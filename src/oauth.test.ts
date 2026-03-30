import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _initTestDatabase } from './db.js';
import { createClient, getCredential, upsertCredential } from './icp-db.js';
import {
  getAuthorizationUrl,
  getConnectionStatus,
  getProviderStatus,
  getValidAccessToken,
  handleOAuthCallback,
  type OAuthProviderType,
} from './oauth.js';

// Mock environment for OAuth client credentials
vi.stubEnv('HUBSPOT_CLIENT_ID', 'test-hubspot-client-id');
vi.stubEnv('HUBSPOT_CLIENT_SECRET', 'test-hubspot-client-secret');
vi.stubEnv('PIPEDRIVE_CLIENT_ID', 'test-pipedrive-client-id');
vi.stubEnv('PIPEDRIVE_CLIENT_SECRET', 'test-pipedrive-client-secret');
vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-google-client-id');
vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-google-client-secret');
vi.stubEnv('SLACK_CLIENT_ID', 'test-slack-client-id');
vi.stubEnv('SLACK_CLIENT_SECRET', 'test-slack-client-secret');
vi.stubEnv('OAUTH_REDIRECT_BASE_URL', 'http://localhost:3141');

beforeEach(() => {
  _initTestDatabase();
});

// ── Authorization URL Generation ────────────────────────────────────────────

describe('getAuthorizationUrl', () => {
  it('generates HubSpot authorization URL with correct params', () => {
    const client = createClient({
      company_name: 'TestCo',
      contact_email: 'test@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    const url = getAuthorizationUrl(client.id, 'hubspot');
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://app.hubspot.com/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('test-hubspot-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:3141/api/oauth/hubspot/callback');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('state')).toBeTruthy();
    expect(parsed.searchParams.get('scope')).toContain('crm.objects.contacts');
  });

  it('generates Pipedrive authorization URL', () => {
    const client = createClient({
      company_name: 'TestCo',
      contact_email: 'test@test.com',
      channel_type: 'crm',
      crm_type: 'pipedrive',
    });

    const url = getAuthorizationUrl(client.id, 'pipedrive');
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://oauth.pipedrive.com/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('test-pipedrive-client-id');
  });

  it('generates Google Sheets URL with access_type=offline', () => {
    const client = createClient({
      company_name: 'TestCo',
      contact_email: 'test@test.com',
      channel_type: 'export',
      crm_type: 'google_sheets',
    });

    const url = getAuthorizationUrl(client.id, 'google_sheets');
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
  });

  it('generates Slack authorization URL with comma-separated scopes', () => {
    const client = createClient({
      company_name: 'TestCo',
      contact_email: 'test@test.com',
      channel_type: 'channel',
      crm_type: 'slack',
    });

    const url = getAuthorizationUrl(client.id, 'slack');
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(parsed.searchParams.get('scope')).toContain('chat:write');
  });

  it('generates unique state for each call', () => {
    const client = createClient({
      company_name: 'TestCo',
      contact_email: 'test@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    const url1 = new URL(getAuthorizationUrl(client.id, 'hubspot'));
    const url2 = new URL(getAuthorizationUrl(client.id, 'hubspot'));

    expect(url1.searchParams.get('state')).not.toBe(url2.searchParams.get('state'));
  });
});

// ── Connection Status ───────────────────────────────────────────────────────

describe('getConnectionStatus', () => {
  it('returns disconnected for all providers when no credentials exist', () => {
    const client = createClient({
      company_name: 'StatusTest',
      contact_email: 'status@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    const statuses = getConnectionStatus(client.id);
    expect(statuses).toHaveLength(4);

    for (const status of statuses) {
      expect(status.connected).toBe(false);
      expect(status.tokenExpiry).toBeNull();
      expect(status.tokenExpired).toBe(false);
    }
  });

  it('shows connected provider when credential exists', () => {
    const client = createClient({
      company_name: 'ConnTest',
      contact_email: 'conn@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    upsertCredential({
      client_id: client.id,
      channel_type: 'crm',
      crm_type: 'hubspot',
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      token_expiry: Math.floor(Date.now() / 1000) + 3600,
    });

    const statuses = getConnectionStatus(client.id);
    const hubspot = statuses.find((s) => s.provider === 'hubspot');
    expect(hubspot?.connected).toBe(true);
    expect(hubspot?.tokenExpired).toBe(false);
  });

  it('detects expired tokens', () => {
    const client = createClient({
      company_name: 'ExpiredTest',
      contact_email: 'expired@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    upsertCredential({
      client_id: client.id,
      channel_type: 'crm',
      crm_type: 'hubspot',
      access_token: 'old-token',
      token_expiry: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    });

    const statuses = getConnectionStatus(client.id);
    const hubspot = statuses.find((s) => s.provider === 'hubspot');
    expect(hubspot?.connected).toBe(true);
    expect(hubspot?.tokenExpired).toBe(true);
  });
});

describe('getProviderStatus', () => {
  it('returns disconnected for unknown provider credential', () => {
    const client = createClient({
      company_name: 'SingleStatus',
      contact_email: 'single@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    const status = getProviderStatus(client.id, 'pipedrive');
    expect(status.connected).toBe(false);
    expect(status.provider).toBe('pipedrive');
  });
});

// ── Token Validation ────────────────────────────────────────────────────────

describe('getValidAccessToken', () => {
  it('returns token when not expired', async () => {
    const client = createClient({
      company_name: 'ValidToken',
      contact_email: 'valid@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    upsertCredential({
      client_id: client.id,
      channel_type: 'crm',
      crm_type: 'hubspot',
      access_token: 'my-valid-token',
      token_expiry: Math.floor(Date.now() / 1000) + 3600,
    });

    const token = await getValidAccessToken(client.id, 'hubspot');
    expect(token).toBe('my-valid-token');
  });

  it('returns null when no credential exists', async () => {
    const client = createClient({
      company_name: 'NoToken',
      contact_email: 'none@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    const token = await getValidAccessToken(client.id, 'hubspot');
    expect(token).toBeNull();
  });

  it('returns token when expiry is null (non-expiring token)', async () => {
    const client = createClient({
      company_name: 'NoExpiry',
      contact_email: 'noexp@test.com',
      channel_type: 'crm',
      crm_type: 'hubspot',
    });

    upsertCredential({
      client_id: client.id,
      channel_type: 'crm',
      crm_type: 'hubspot',
      access_token: 'non-expiring-token',
      token_expiry: null,
    });

    const token = await getValidAccessToken(client.id, 'hubspot');
    expect(token).toBe('non-expiring-token');
  });
});

// ── OAuth Callback ──────────────────────────────────────────────────────────

describe('handleOAuthCallback', () => {
  it('rejects invalid state parameter', async () => {
    await expect(
      handleOAuthCallback('hubspot', 'some-code', 'invalid-state'),
    ).rejects.toThrow('Invalid or expired OAuth state parameter');
  });
});
