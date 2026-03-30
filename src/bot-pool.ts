import crypto from 'crypto';

import { encryptField, decryptField, getDb } from './db.js';
import { BOT_POOL_ADMIN_CHAT_ID, BOT_POOL_MIN_AVAILABLE, TELEGRAM_BOT_TOKEN } from './config.js';
import { logger } from './logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type BotPoolStatus = 'available' | 'assigned' | 'retired';

export interface PoolBot {
  id: string;
  bot_token: string;
  bot_username: string;
  status: BotPoolStatus;
  assigned_client_id: string | null;
  display_name: string | null;
  created_at: number;
  assigned_at: number | null;
}

export interface PoolStatusSummary {
  available: number;
  assigned: number;
  retired: number;
  total: number;
}

export interface AssignResult {
  bot_username: string;
  bot_id: string;
  telegram_link: string;
}

// ── Raw DB row (token is encrypted) ─────────────────────────────────────────

interface PoolBotRow {
  id: string;
  bot_token: string;
  bot_username: string;
  status: string;
  assigned_client_id: string | null;
  display_name: string | null;
  created_at: number;
  assigned_at: number | null;
}

function decryptBot(row: PoolBotRow): PoolBot {
  return {
    ...row,
    status: row.status as BotPoolStatus,
    bot_token: decryptField(row.bot_token),
  };
}

// ── Pool operations ─────────────────────────────────────────────────────────

/**
 * Add bots to the pool. Validates each token against the Telegram API
 * and stores them encrypted.
 */
export async function addBotsToPool(
  tokens: string[],
): Promise<{ added: string[]; errors: Array<{ token: string; error: string }> }> {
  const added: string[] = [];
  const errors: Array<{ token: string; error: string }> = [];

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    try {
      // Validate token with Telegram getMe
      const info = await callTelegramApi(trimmed, 'getMe');
      const username: string = info.result.username;

      // Check for duplicate
      const existing = getDb()
        .prepare('SELECT id FROM telegram_bot_pool WHERE bot_username = ?')
        .get(username) as { id: string } | undefined;

      if (existing) {
        errors.push({ token: maskToken(trimmed), error: `@${username} already in pool` });
        continue;
      }

      const id = crypto.randomUUID();
      const encryptedToken = encryptField(trimmed);

      getDb()
        .prepare(
          `INSERT INTO telegram_bot_pool (id, bot_token, bot_username, status, created_at)
           VALUES (?, ?, ?, 'available', strftime('%s','now'))`,
        )
        .run(id, encryptedToken, username);

      added.push(username);
      logger.info({ username }, 'Bot added to pool');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ token: maskToken(trimmed), error: msg });
    }
  }

  return { added, errors };
}

/**
 * Assign the next available bot to a client. Calls Telegram API to
 * customize the bot's name and description, then marks it as assigned.
 */
export async function assignBot(
  clientId: string,
  displayName: string,
  description?: string,
  shortDescription?: string,
): Promise<AssignResult> {
  const row = getDb()
    .prepare(
      `SELECT * FROM telegram_bot_pool
       WHERE status = 'available'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get() as PoolBotRow | undefined;

  if (!row) {
    throw new Error('No available bots in pool');
  }

  const bot = decryptBot(row);

  // Customize bot via Telegram API
  await callTelegramApi(bot.bot_token, 'setMyName', {
    name: displayName,
  });

  await callTelegramApi(bot.bot_token, 'setMyDescription', {
    description: description ?? 'Your AI lead generation assistant',
  });

  await callTelegramApi(bot.bot_token, 'setMyShortDescription', {
    short_description: shortDescription ?? `${displayName} — AI-powered leads`,
  });

  // Mark as assigned
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `UPDATE telegram_bot_pool
       SET status = 'assigned', assigned_client_id = ?, display_name = ?, assigned_at = ?
       WHERE id = ?`,
    )
    .run(clientId, displayName, now, bot.id);

  logger.info({ botId: bot.id, username: bot.bot_username, clientId }, 'Bot assigned to client');

  return {
    bot_username: bot.bot_username,
    bot_id: bot.id,
    telegram_link: `https://t.me/${bot.bot_username}`,
  };
}

/**
 * Retire a bot — removes it from active rotation. Cannot retire an assigned bot.
 */
export function retireBot(botId: string): { ok: boolean; error?: string } {
  const row = getDb()
    .prepare('SELECT status FROM telegram_bot_pool WHERE id = ?')
    .get(botId) as { status: string } | undefined;

  if (!row) return { ok: false, error: 'Bot not found' };
  if (row.status === 'assigned') return { ok: false, error: 'Cannot retire an assigned bot. Unassign first.' };
  if (row.status === 'retired') return { ok: false, error: 'Bot already retired' };

  getDb()
    .prepare("UPDATE telegram_bot_pool SET status = 'retired' WHERE id = ?")
    .run(botId);

  logger.info({ botId }, 'Bot retired from pool');
  return { ok: true };
}

/**
 * Unassign a bot — resets it to available. Clears display_name and client link.
 */
export function unassignBot(botId: string): { ok: boolean; error?: string } {
  const row = getDb()
    .prepare('SELECT status FROM telegram_bot_pool WHERE id = ?')
    .get(botId) as { status: string } | undefined;

  if (!row) return { ok: false, error: 'Bot not found' };
  if (row.status !== 'assigned') return { ok: false, error: 'Bot is not assigned' };

  getDb()
    .prepare(
      `UPDATE telegram_bot_pool
       SET status = 'available', assigned_client_id = NULL, display_name = NULL, assigned_at = NULL
       WHERE id = ?`,
    )
    .run(botId);

  logger.info({ botId }, 'Bot unassigned, returned to pool');
  return { ok: true };
}

/**
 * Get pool status summary.
 */
export function getPoolStatus(): PoolStatusSummary {
  const rows = getDb()
    .prepare(
      `SELECT status, COUNT(*) as count FROM telegram_bot_pool GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>;

  const summary: PoolStatusSummary = { available: 0, assigned: 0, retired: 0, total: 0 };
  for (const row of rows) {
    const key = row.status as keyof Omit<PoolStatusSummary, 'total'>;
    if (key in summary) {
      summary[key] = row.count;
    }
    summary.total += row.count;
  }
  return summary;
}

/**
 * List all bots in the pool. Tokens are NOT included in the response for security.
 */
export function listPoolBots(): Array<Omit<PoolBot, 'bot_token'>> {
  const rows = getDb()
    .prepare('SELECT id, bot_username, status, assigned_client_id, display_name, created_at, assigned_at FROM telegram_bot_pool ORDER BY created_at ASC')
    .all() as Array<Omit<PoolBotRow, 'bot_token'>>;

  return rows.map((r) => ({
    ...r,
    status: r.status as BotPoolStatus,
  }));
}

/**
 * Check pool levels and send alert if available < threshold.
 * Uses the main bot token to send a Telegram message to the admin chat.
 */
export async function checkPoolAndAlert(): Promise<void> {
  const status = getPoolStatus();
  const threshold = BOT_POOL_MIN_AVAILABLE;

  if (status.available >= threshold) return;

  const adminChatId = BOT_POOL_ADMIN_CHAT_ID;
  if (!adminChatId) {
    logger.warn('Bot pool low (%d available) but BOT_POOL_ADMIN_CHAT_ID not set', status.available);
    return;
  }

  const mainToken = TELEGRAM_BOT_TOKEN;
  if (!mainToken) {
    logger.warn('Bot pool low but no TELEGRAM_BOT_TOKEN to send alert');
    return;
  }

  const message =
    `⚠️ Bot Pool Low\n\n` +
    `Available: ${status.available} (threshold: ${threshold})\n` +
    `Assigned: ${status.assigned}\n` +
    `Retired: ${status.retired}\n` +
    `Total: ${status.total}\n\n` +
    `Add more bots via POST /admin/bot-pool/add`;

  try {
    await callTelegramApi(mainToken, 'sendMessage', {
      chat_id: adminChatId,
      text: message,
    });
    logger.info({ available: status.available, threshold }, 'Bot pool low-stock alert sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send bot pool alert');
  }
}

// ── Telegram API helper ─────────────────────────────────────────────────────

async function callTelegramApi(
  token: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: params ? JSON.stringify(params) : undefined,
  });

  const data = (await response.json()) as { ok: boolean; result: Record<string, unknown>; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description ?? 'unknown error'}`);
  }
  return data;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Mask a bot token for safe logging (show first 5 and last 4 chars). */
function maskToken(token: string): string {
  if (token.length < 12) return '***';
  return `${token.slice(0, 5)}...${token.slice(-4)}`;
}
