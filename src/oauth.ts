import crypto from 'crypto';

import { readEnvFile } from './env.js';
import { encryptField, decryptField } from './db.js';
import { upsertCredential, getCredential, getClient, listCredentialsForClient } from './icp-db.js';
import { logger } from './logger.js';

// ── OAuth Env Config ────────────────────────────────────────────────────────

const oauthEnv = readEnvFile([
  'HUBSPOT_CLIENT_ID',
  'HUBSPOT_CLIENT_SECRET',
  'PIPEDRIVE_CLIENT_ID',
  'PIPEDRIVE_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
  'OAUTH_REDIRECT_BASE_URL',
]);

const OAUTH_REDIRECT_BASE_URL =
  process.env.OAUTH_REDIRECT_BASE_URL || oauthEnv.OAUTH_REDIRECT_BASE_URL || 'http://localhost:3141';

// ── Types ───────────────────────────────────────────────────────────────────

export type OAuthProviderType = 'hubspot' | 'pipedrive' | 'google_sheets' | 'slack';

interface OAuthProviderConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly scopes: readonly string[];
  readonly channelType: string;
  readonly crmType: string;
}

interface TokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
}

export interface ConnectionStatus {
  readonly provider: OAuthProviderType;
  readonly connected: boolean;
  readonly tokenExpiry: number | null;
  readonly tokenExpired: boolean;
  readonly updatedAt: number | null;
}

// ── CSRF State Store ────────────────────────────────────────────────────────
// In-memory store with 10-minute expiry for OAuth state parameters.

const pendingStates = new Map<string, { clientId: string; provider: OAuthProviderType; expiresAt: number }>();

function createState(clientId: string, provider: OAuthProviderType): string {
  const state = crypto.randomBytes(32).toString('hex');
  pendingStates.set(state, {
    clientId,
    provider,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return state;
}

function consumeState(state: string): { clientId: string; provider: OAuthProviderType } | undefined {
  const entry = pendingStates.get(state);
  if (!entry) return undefined;
  pendingStates.delete(state);
  if (Date.now() > entry.expiresAt) return undefined;
  return { clientId: entry.clientId, provider: entry.provider };
}

// Periodic cleanup of expired states
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (now > val.expiresAt) pendingStates.delete(key);
  }
}, 60_000);

// ── Provider Configs ────────────────────────────────────────────────────────

function getProviderConfig(provider: OAuthProviderType): OAuthProviderConfig {
  switch (provider) {
    case 'hubspot':
      return {
        clientId: process.env.HUBSPOT_CLIENT_ID || oauthEnv.HUBSPOT_CLIENT_ID || '',
        clientSecret: process.env.HUBSPOT_CLIENT_SECRET || oauthEnv.HUBSPOT_CLIENT_SECRET || '',
        authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        scopes: ['crm.objects.contacts.write', 'crm.objects.contacts.read', 'crm.objects.companies.read'],
        channelType: 'crm',
        crmType: 'hubspot',
      };
    case 'pipedrive':
      return {
        clientId: process.env.PIPEDRIVE_CLIENT_ID || oauthEnv.PIPEDRIVE_CLIENT_ID || '',
        clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET || oauthEnv.PIPEDRIVE_CLIENT_SECRET || '',
        authorizeUrl: 'https://oauth.pipedrive.com/oauth/authorize',
        tokenUrl: 'https://oauth.pipedrive.com/oauth/token',
        scopes: ['contacts:full', 'deals:full'],
        channelType: 'crm',
        crmType: 'pipedrive',
      };
    case 'google_sheets':
      return {
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || oauthEnv.GOOGLE_OAUTH_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || oauthEnv.GOOGLE_OAUTH_CLIENT_SECRET || '',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
        channelType: 'export',
        crmType: 'google_sheets',
      };
    case 'slack':
      return {
        clientId: process.env.SLACK_CLIENT_ID || oauthEnv.SLACK_CLIENT_ID || '',
        clientSecret: process.env.SLACK_CLIENT_SECRET || oauthEnv.SLACK_CLIENT_SECRET || '',
        authorizeUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: ['chat:write', 'channels:read', 'users:read'],
        channelType: 'channel',
        crmType: 'slack',
      };
  }
}

// ── Authorization URL ───────────────────────────────────────────────────────

export function getAuthorizationUrl(clientId: string, provider: OAuthProviderType): string {
  const config = getProviderConfig(provider);
  if (!config.clientId) {
    throw new Error(`OAuth client ID not configured for ${provider}`);
  }

  const state = createState(clientId, provider);
  const redirectUri = `${OAUTH_REDIRECT_BASE_URL}/api/oauth/${provider}/callback`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  });

  // Google requires access_type=offline for refresh tokens
  if (provider === 'google_sheets') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  // Slack uses user_scope for user tokens, scope for bot tokens
  if (provider === 'slack') {
    params.set('scope', config.scopes.join(','));
  } else {
    params.set('scope', config.scopes.join(' '));
  }

  return `${config.authorizeUrl}?${params.toString()}`;
}

// ── Token Exchange ──────────────────────────────────────────────────────────

async function exchangeCodeForTokens(
  provider: OAuthProviderType,
  code: string,
): Promise<TokenResponse> {
  const config = getProviderConfig(provider);
  const redirectUri = `${OAUTH_REDIRECT_BASE_URL}/api/oauth/${provider}/callback`;

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  };

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error({ provider, status: response.status, body: errorBody }, 'OAuth token exchange failed');
    throw new Error(`Token exchange failed for ${provider}: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  // Slack nests the token differently
  if (provider === 'slack') {
    if (!data.ok) {
      throw new Error(`Slack OAuth error: ${String(data.error)}`);
    }
    const authedUser = data.authed_user as Record<string, unknown> | undefined;
    return {
      access_token: (data.access_token as string) || (authedUser?.access_token as string),
      refresh_token: data.refresh_token as string | undefined,
      expires_in: data.expires_in as number | undefined,
    };
  }

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string | undefined,
    expires_in: data.expires_in as number | undefined,
  };
}

// ── Callback Handler ────────────────────────────────────────────────────────

export async function handleOAuthCallback(
  provider: OAuthProviderType,
  code: string,
  state: string,
): Promise<{ clientId: string; provider: OAuthProviderType }> {
  const stateData = consumeState(state);
  if (!stateData) {
    throw new Error('Invalid or expired OAuth state parameter');
  }
  if (stateData.provider !== provider) {
    throw new Error('OAuth state provider mismatch');
  }

  const client = getClient(stateData.clientId);
  if (!client) {
    throw new Error(`Client ${stateData.clientId} not found`);
  }

  const tokens = await exchangeCodeForTokens(provider, code);
  const config = getProviderConfig(provider);

  const tokenExpiry = tokens.expires_in
    ? Math.floor(Date.now() / 1000) + tokens.expires_in
    : null;

  upsertCredential({
    client_id: stateData.clientId,
    channel_type: config.channelType,
    crm_type: config.crmType,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry: tokenExpiry,
  });

  logger.info({ clientId: stateData.clientId, provider }, 'OAuth tokens stored');

  return { clientId: stateData.clientId, provider };
}

// ── Token Refresh ───────────────────────────────────────────────────────────

export async function refreshAccessToken(
  clientId: string,
  provider: OAuthProviderType,
): Promise<boolean> {
  const config = getProviderConfig(provider);
  const credential = getCredential(clientId, config.channelType, config.crmType);
  if (!credential?.refresh_token) {
    logger.warn({ clientId, provider }, 'No refresh token available');
    return false;
  }

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: credential.refresh_token,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  };

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ provider, clientId, status: response.status, body: errorBody }, 'Token refresh failed');
      return false;
    }

    const data = (await response.json()) as Record<string, unknown>;

    let accessToken: string;
    let refreshToken: string | null = null;

    if (provider === 'slack') {
      if (!data.ok) {
        logger.error({ provider, clientId, error: data.error }, 'Slack token refresh failed');
        return false;
      }
      const authedUser = data.authed_user as Record<string, unknown> | undefined;
      accessToken = (data.access_token as string) || (authedUser?.access_token as string);
      refreshToken = (data.refresh_token as string) ?? credential.refresh_token;
    } else {
      accessToken = data.access_token as string;
      // Some providers rotate refresh tokens
      refreshToken = (data.refresh_token as string) ?? credential.refresh_token;
    }

    const tokenExpiry = data.expires_in
      ? Math.floor(Date.now() / 1000) + (data.expires_in as number)
      : null;

    upsertCredential({
      client_id: clientId,
      channel_type: config.channelType,
      crm_type: config.crmType,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expiry: tokenExpiry,
    });

    logger.info({ clientId, provider }, 'OAuth token refreshed');
    return true;
  } catch (err) {
    logger.error({ err, clientId, provider }, 'Token refresh request failed');
    return false;
  }
}

// ── Get Valid Token (with auto-refresh) ─────────────────────────────────────

export async function getValidAccessToken(
  clientId: string,
  provider: OAuthProviderType,
): Promise<string | null> {
  const config = getProviderConfig(provider);
  const credential = getCredential(clientId, config.channelType, config.crmType);
  if (!credential) return null;

  const now = Math.floor(Date.now() / 1000);
  const isExpired = credential.token_expiry !== null && credential.token_expiry < now;
  const isExpiringSoon = credential.token_expiry !== null && credential.token_expiry < now + 300;

  if (isExpired || isExpiringSoon) {
    const refreshed = await refreshAccessToken(clientId, provider);
    if (!refreshed && isExpired) return null;
    if (refreshed) {
      const updated = getCredential(clientId, config.channelType, config.crmType);
      return updated?.access_token ?? null;
    }
  }

  return credential.access_token;
}

// ── Connection Status ───────────────────────────────────────────────────────

export function getConnectionStatus(clientId: string): readonly ConnectionStatus[] {
  const providers: readonly OAuthProviderType[] = ['hubspot', 'pipedrive', 'google_sheets', 'slack'];
  const now = Math.floor(Date.now() / 1000);

  return providers.map((provider) => {
    const config = getProviderConfig(provider);
    const credential = getCredential(clientId, config.channelType, config.crmType);

    if (!credential) {
      return {
        provider,
        connected: false,
        tokenExpiry: null,
        tokenExpired: false,
        updatedAt: null,
      };
    }

    const tokenExpired = credential.token_expiry !== null && credential.token_expiry < now;

    return {
      provider,
      connected: true,
      tokenExpiry: credential.token_expiry,
      tokenExpired,
      updatedAt: credential.updated_at,
    };
  });
}

export function getProviderStatus(
  clientId: string,
  provider: OAuthProviderType,
): ConnectionStatus {
  const config = getProviderConfig(provider);
  const credential = getCredential(clientId, config.channelType, config.crmType);
  const now = Math.floor(Date.now() / 1000);

  if (!credential) {
    return { provider, connected: false, tokenExpiry: null, tokenExpired: false, updatedAt: null };
  }

  return {
    provider,
    connected: true,
    tokenExpiry: credential.token_expiry,
    tokenExpired: credential.token_expiry !== null && credential.token_expiry < now,
    updatedAt: credential.updated_at,
  };
}
