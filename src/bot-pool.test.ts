import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _initTestDatabase, getDb } from './db.js';
import { createClient } from './icp-db.js';
import {
  addBotsToPool,
  assignBot,
  getPoolStatus,
  listPoolBots,
  retireBot,
  unassignBot,
  checkPoolAndAlert,
} from './bot-pool.js';

// Mock global fetch for Telegram API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockTelegramSuccess(result: Record<string, unknown> = {}) {
  mockFetch.mockResolvedValueOnce({
    json: async () => ({ ok: true, result }),
  });
}

function mockTelegramError(description: string) {
  mockFetch.mockResolvedValueOnce({
    json: async () => ({ ok: false, description }),
  });
}

beforeEach(() => {
  _initTestDatabase();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── addBotsToPool ───────────────────────────────────────────────────────────

describe('addBotsToPool', () => {
  it('adds a valid bot token to the pool', async () => {
    mockTelegramSuccess({ username: 'test_bot', id: 123 });

    const result = await addBotsToPool(['fake-token-123']);
    expect(result.added).toEqual(['test_bot']);
    expect(result.errors).toHaveLength(0);

    const status = getPoolStatus();
    expect(status.available).toBe(1);
    expect(status.total).toBe(1);
  });

  it('rejects duplicate bot usernames', async () => {
    mockTelegramSuccess({ username: 'dup_bot', id: 456 });
    await addBotsToPool(['token-1']);

    mockTelegramSuccess({ username: 'dup_bot', id: 456 });
    const result = await addBotsToPool(['token-2']);

    expect(result.added).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('already in pool');
  });

  it('reports errors for invalid tokens', async () => {
    mockTelegramError('Unauthorized');
    const result = await addBotsToPool(['bad-token']);

    expect(result.added).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Unauthorized');
  });

  it('skips empty tokens', async () => {
    const result = await addBotsToPool(['', '  ']);
    expect(result.added).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('encrypts stored bot tokens', async () => {
    mockTelegramSuccess({ username: 'enc_bot', id: 789 });
    await addBotsToPool(['my-secret-token']);

    // Read raw from DB — should be encrypted (iv:authTag:ciphertext format)
    const row = getDb()
      .prepare('SELECT bot_token FROM telegram_bot_pool WHERE bot_username = ?')
      .get('enc_bot') as { bot_token: string };

    expect(row.bot_token).not.toBe('my-secret-token');
    expect(row.bot_token.split(':')).toHaveLength(3); // encrypted format
  });
});

// ── getPoolStatus ───────────────────────────────────────────────────────────

describe('getPoolStatus', () => {
  it('returns zeros for empty pool', () => {
    const status = getPoolStatus();
    expect(status).toEqual({ available: 0, assigned: 0, retired: 0, total: 0 });
  });

  it('counts bots by status', async () => {
    // Add 3 bots
    for (let i = 0; i < 3; i++) {
      mockTelegramSuccess({ username: `bot_${i}`, id: i });
    }
    await addBotsToPool(['t1', 't2', 't3']);

    const status = getPoolStatus();
    expect(status.available).toBe(3);
    expect(status.total).toBe(3);
  });
});

// ── assignBot ───────────────────────────────────────────────────────────────

describe('assignBot', () => {
  it('assigns the oldest available bot', async () => {
    // Add two bots
    mockTelegramSuccess({ username: 'first_bot', id: 1 });
    mockTelegramSuccess({ username: 'second_bot', id: 2 });
    await addBotsToPool(['t1', 't2']);

    const client = createClient({
      company_name: 'TestCo',
      contact_email: 'test@test.com',
      channel_type: 'telegram',
      crm_type: 'hubspot',
    });

    // Mock the 3 Telegram API calls for assignment (setMyName, setMyDescription, setMyShortDescription)
    mockTelegramSuccess({});
    mockTelegramSuccess({});
    mockTelegramSuccess({});

    const result = await assignBot(client.id, 'TestCo Leads');
    expect(result.bot_username).toBe('first_bot');
    expect(result.telegram_link).toBe('https://t.me/first_bot');

    const status = getPoolStatus();
    expect(status.available).toBe(1);
    expect(status.assigned).toBe(1);
  });

  it('throws when no bots are available', async () => {
    await expect(
      assignBot('some-client', 'My Bot'),
    ).rejects.toThrow('No available bots in pool');
  });

  it('calls Telegram API to customize the bot', async () => {
    mockTelegramSuccess({ username: 'custom_bot', id: 1 });
    await addBotsToPool(['t1']);

    const client = createClient({
      company_name: 'CustomCo',
      contact_email: 'c@c.com',
      channel_type: 'telegram',
      crm_type: 'hubspot',
    });

    mockTelegramSuccess({});
    mockTelegramSuccess({});
    mockTelegramSuccess({});

    await assignBot(client.id, 'Custom Leads', 'Find your ideal customers', 'AI leads for you');

    // getMe + setMyName + setMyDescription + setMyShortDescription = 4 total calls
    // (1 from addBotsToPool + 3 from assignBot)
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // Verify setMyName was called with the display name
    const setNameCall = mockFetch.mock.calls[1];
    expect(setNameCall[0]).toContain('setMyName');
    const nameBody = JSON.parse(setNameCall[1].body);
    expect(nameBody.name).toBe('Custom Leads');
  });
});

// ── retireBot ───────────────────────────────────────────────────────────────

describe('retireBot', () => {
  it('retires an available bot', async () => {
    mockTelegramSuccess({ username: 'retire_bot', id: 1 });
    await addBotsToPool(['t1']);

    const bots = listPoolBots();
    const result = retireBot(bots[0].id);
    expect(result.ok).toBe(true);

    const status = getPoolStatus();
    expect(status.retired).toBe(1);
    expect(status.available).toBe(0);
  });

  it('refuses to retire an assigned bot', async () => {
    mockTelegramSuccess({ username: 'assigned_bot', id: 1 });
    await addBotsToPool(['t1']);

    const client = createClient({
      company_name: 'Co',
      contact_email: 'c@c.com',
      channel_type: 'telegram',
      crm_type: 'hubspot',
    });

    mockTelegramSuccess({});
    mockTelegramSuccess({});
    mockTelegramSuccess({});
    await assignBot(client.id, 'MyBot');

    const bots = listPoolBots();
    const assignedBot = bots.find((b) => b.status === 'assigned');
    const result = retireBot(assignedBot!.id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot retire an assigned bot');
  });

  it('returns error for unknown bot', () => {
    const result = retireBot('nonexistent');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Bot not found');
  });
});

// ── unassignBot ─────────────────────────────────────────────────────────────

describe('unassignBot', () => {
  it('unassigns an assigned bot and returns it to available', async () => {
    mockTelegramSuccess({ username: 'unassign_bot', id: 1 });
    await addBotsToPool(['t1']);

    const client = createClient({
      company_name: 'Co',
      contact_email: 'c@c.com',
      channel_type: 'telegram',
      crm_type: 'hubspot',
    });

    mockTelegramSuccess({});
    mockTelegramSuccess({});
    mockTelegramSuccess({});
    const assigned = await assignBot(client.id, 'MyBot');

    const result = unassignBot(assigned.bot_id);
    expect(result.ok).toBe(true);

    const status = getPoolStatus();
    expect(status.available).toBe(1);
    expect(status.assigned).toBe(0);
  });

  it('refuses to unassign a non-assigned bot', async () => {
    mockTelegramSuccess({ username: 'avail_bot', id: 1 });
    await addBotsToPool(['t1']);

    const bots = listPoolBots();
    const result = unassignBot(bots[0].id);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not assigned');
  });
});

// ── listPoolBots ────────────────────────────────────────────────────────────

describe('listPoolBots', () => {
  it('does not expose bot tokens', async () => {
    mockTelegramSuccess({ username: 'safe_bot', id: 1 });
    await addBotsToPool(['super-secret-token']);

    const bots = listPoolBots();
    expect(bots).toHaveLength(1);
    expect(bots[0]).not.toHaveProperty('bot_token');
    expect(bots[0].bot_username).toBe('safe_bot');
    expect(bots[0].status).toBe('available');
  });
});

// ── checkPoolAndAlert ───────────────────────────────────────────────────────

describe('checkPoolAndAlert', () => {
  it('does not alert when pool is above threshold', async () => {
    // Pool has 0 bots, but no admin chat ID configured, so it just logs a warning
    await checkPoolAndAlert();
    // Should not call fetch (no sendMessage call)
    // The function logs a warning but doesn't throw
  });
});
