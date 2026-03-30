import { Hono } from 'hono';

import { getClient, deleteCredential, listCredentialsForClient } from './icp-db.js';
import {
  getAuthorizationUrl,
  getConnectionStatus,
  getProviderStatus,
  getValidAccessToken,
  handleOAuthCallback,
  type OAuthProviderType,
} from './oauth.js';
import { logger } from './logger.js';

const VALID_PROVIDERS: ReadonlySet<string> = new Set([
  'hubspot',
  'pipedrive',
  'google_sheets',
  'slack',
]);

function isValidProvider(provider: string): provider is OAuthProviderType {
  return VALID_PROVIDERS.has(provider);
}

/**
 * Mount OAuth routes on a Hono app.
 * Call `app.route('/api/oauth', createOAuthRoutes())` in dashboard.ts.
 */
export function createOAuthRoutes(): Hono {
  const oauth = new Hono();

  // ── Initiate OAuth flow ─────────────────────────────────────────────────
  // GET /api/oauth/:provider/authorize?clientId=...
  oauth.get('/:provider/authorize', (c) => {
    const provider = c.req.param('provider');
    const clientId = c.req.query('clientId');

    if (!provider || !isValidProvider(provider)) {
      return c.json({ error: `Invalid provider: ${provider}` }, 400);
    }
    if (!clientId) {
      return c.json({ error: 'clientId query parameter is required' }, 400);
    }

    const client = getClient(clientId);
    if (!client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    try {
      const url = getAuthorizationUrl(clientId, provider);
      return c.redirect(url, 302);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, provider, clientId }, 'Failed to generate auth URL');
      return c.json({ error: message }, 500);
    }
  });

  // ── OAuth callback ──────────────────────────────────────────────────────
  // GET /api/oauth/:provider/callback?code=...&state=...
  oauth.get('/:provider/callback', async (c) => {
    const provider = c.req.param('provider');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (!provider || !isValidProvider(provider)) {
      return c.json({ error: `Invalid provider: ${provider}` }, 400);
    }

    // Handle user-denied consent
    if (error) {
      logger.warn({ provider, error }, 'OAuth consent denied');
      return c.html(
        `<html><body>
          <h2>Connection Cancelled</h2>
          <p>You declined the ${provider} authorization. You can try again from the onboarding form.</p>
        </body></html>`,
        200,
      );
    }

    if (!code || !state) {
      return c.json({ error: 'Missing code or state parameter' }, 400);
    }

    try {
      const result = await handleOAuthCallback(provider, code, state);
      return c.html(
        `<html><body>
          <h2>Connected!</h2>
          <p>Successfully connected <strong>${provider}</strong>. You can close this window.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth_success', provider: '${result.provider}', clientId: '${result.clientId}' }, '*');
              setTimeout(() => window.close(), 2000);
            }
          </script>
        </body></html>`,
        200,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, provider }, 'OAuth callback failed');
      return c.html(
        `<html><body>
          <h2>Connection Failed</h2>
          <p>Failed to connect ${provider}: ${message}</p>
          <p>Please try again from the onboarding form.</p>
        </body></html>`,
        200,
      );
    }
  });

  // ── Connection status for a client ──────────────────────────────────────
  // GET /api/oauth/status?clientId=...
  oauth.get('/status', (c) => {
    const clientId = c.req.query('clientId');
    if (!clientId) {
      return c.json({ error: 'clientId query parameter is required' }, 400);
    }

    const client = getClient(clientId);
    if (!client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const connections = getConnectionStatus(clientId);
    return c.json({ clientId, connections });
  });

  // ── Single provider status ──────────────────────────────────────────────
  // GET /api/oauth/:provider/status?clientId=...
  oauth.get('/:provider/status', (c) => {
    const provider = c.req.param('provider');
    const clientId = c.req.query('clientId');

    if (!provider || !isValidProvider(provider)) {
      return c.json({ error: `Invalid provider: ${provider}` }, 400);
    }
    if (!clientId) {
      return c.json({ error: 'clientId query parameter is required' }, 400);
    }

    const client = getClient(clientId);
    if (!client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const status = getProviderStatus(clientId, provider);
    return c.json(status);
  });

  // ── Disconnect a provider ───────────────────────────────────────────────
  // DELETE /api/oauth/:provider?clientId=...
  oauth.delete('/:provider', (c) => {
    const provider = c.req.param('provider');
    const clientId = c.req.query('clientId');

    if (!provider || !isValidProvider(provider)) {
      return c.json({ error: `Invalid provider: ${provider}` }, 400);
    }
    if (!clientId) {
      return c.json({ error: 'clientId query parameter is required' }, 400);
    }

    const client = getClient(clientId);
    if (!client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const status = getProviderStatus(clientId, provider);
    if (!status.connected) {
      return c.json({ error: `${provider} is not connected` }, 404);
    }

    const providerMap: Record<string, { channelType: string; crmType: string }> = {
      hubspot: { channelType: 'crm', crmType: 'hubspot' },
      pipedrive: { channelType: 'crm', crmType: 'pipedrive' },
      google_sheets: { channelType: 'export', crmType: 'google_sheets' },
      slack: { channelType: 'channel', crmType: 'slack' },
    };
    const providerInfo = providerMap[provider];
    const credentials = listCredentialsForClient(clientId);
    const cred = credentials.find(
      (cr) => cr.channel_type === providerInfo.channelType && cr.crm_type === providerInfo.crmType,
    );
    if (cred) {
      deleteCredential(cred.id);
    }

    return c.json({ success: true, provider, clientId });
  });

  return oauth;
}
