import crypto from 'crypto';

import { decryptField, encryptField, getDb } from './db.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface IcpClient {
  id: string;
  company_name: string;
  contact_email: string;
  channel_type: string;
  crm_type: string;
  created_at: number;
}

export interface IcpCredential {
  id: string;
  client_id: string;
  channel_type: string;
  crm_type: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry: number | null;
  created_at: number;
  updated_at: number;
}

export interface IcpUsage {
  id: number;
  client_id: string;
  date: string;
  leads_delivered: number;
  created_at: number;
}

export type BillingStatus = 'pending' | 'paid' | 'failed' | 'void';

export interface IcpBilling {
  id: string;
  client_id: string;
  stripe_customer_id: string;
  stripe_invoice_id: string | null;
  period_start: number;
  period_end: number;
  invoice_amount_cents: number;
  status: BillingStatus;
  created_at: number;
  paid_at: number | null;
}

// ── icp_clients ──────────────────────────────────────────────────────────────

export function createClient(fields: Omit<IcpClient, 'id' | 'created_at'>): IcpClient {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT INTO icp_clients (id, company_name, contact_email, channel_type, crm_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, fields.company_name, fields.contact_email, fields.channel_type, fields.crm_type, now);
  return { id, ...fields, created_at: now };
}

export function getClient(id: string): IcpClient | undefined {
  return getDb()
    .prepare('SELECT * FROM icp_clients WHERE id = ?')
    .get(id) as IcpClient | undefined;
}

export function listClients(): IcpClient[] {
  return getDb()
    .prepare('SELECT * FROM icp_clients ORDER BY created_at DESC')
    .all() as IcpClient[];
}

export function deleteClient(id: string): void {
  getDb().prepare('DELETE FROM icp_clients WHERE id = ?').run(id);
}

// ── icp_credentials ──────────────────────────────────────────────────────────

export function upsertCredential(fields: {
  client_id: string;
  channel_type: string;
  crm_type: string;
  access_token: string;
  refresh_token?: string | null;
  token_expiry?: number | null;
}): IcpCredential {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const encryptedAccess = encryptField(fields.access_token);
  const encryptedRefresh = fields.refresh_token ? encryptField(fields.refresh_token) : null;

  getDb()
    .prepare(
      `INSERT INTO icp_credentials
         (id, client_id, channel_type, crm_type, access_token, refresh_token, token_expiry, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, channel_type, crm_type) DO UPDATE SET
         access_token  = excluded.access_token,
         refresh_token = excluded.refresh_token,
         token_expiry  = excluded.token_expiry,
         updated_at    = excluded.updated_at`,
    )
    .run(
      id,
      fields.client_id,
      fields.channel_type,
      fields.crm_type,
      encryptedAccess,
      encryptedRefresh,
      fields.token_expiry ?? null,
      now,
      now,
    );

  const row = getDb()
    .prepare(
      'SELECT * FROM icp_credentials WHERE client_id = ? AND channel_type = ? AND crm_type = ?',
    )
    .get(fields.client_id, fields.channel_type, fields.crm_type) as IcpCredential;

  return decryptCredential(row);
}

export function getCredential(
  clientId: string,
  channelType: string,
  crmType: string,
): IcpCredential | undefined {
  const row = getDb()
    .prepare(
      'SELECT * FROM icp_credentials WHERE client_id = ? AND channel_type = ? AND crm_type = ?',
    )
    .get(clientId, channelType, crmType) as IcpCredential | undefined;
  return row ? decryptCredential(row) : undefined;
}

export function listCredentialsForClient(clientId: string): IcpCredential[] {
  const rows = getDb()
    .prepare('SELECT * FROM icp_credentials WHERE client_id = ?')
    .all(clientId) as IcpCredential[];
  return rows.map(decryptCredential);
}

export function deleteCredential(id: string): void {
  getDb().prepare('DELETE FROM icp_credentials WHERE id = ?').run(id);
}

function decryptCredential(row: IcpCredential): IcpCredential {
  return {
    ...row,
    access_token: decryptField(row.access_token),
    refresh_token: row.refresh_token ? decryptField(row.refresh_token) : null,
  };
}

// ── icp_usage ────────────────────────────────────────────────────────────────

/**
 * Record leads delivered for a client on a given date (YYYY-MM-DD).
 * Upserts: increments leads_delivered if a row already exists for that day.
 */
export function recordUsage(clientId: string, date: string, leadsDelivered: number): IcpUsage {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT INTO icp_usage (client_id, date, leads_delivered, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(client_id, date) DO UPDATE SET
         leads_delivered = leads_delivered + excluded.leads_delivered`,
    )
    .run(clientId, date, leadsDelivered, now);

  return getDb()
    .prepare('SELECT * FROM icp_usage WHERE client_id = ? AND date = ?')
    .get(clientId, date) as IcpUsage;
}

export function getUsageForPeriod(
  clientId: string,
  startDate: string,
  endDate: string,
): IcpUsage[] {
  return getDb()
    .prepare(
      `SELECT * FROM icp_usage
       WHERE client_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`,
    )
    .all(clientId, startDate, endDate) as IcpUsage[];
}

export function getTotalLeadsForPeriod(
  clientId: string,
  startDate: string,
  endDate: string,
): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(leads_delivered), 0) AS total
       FROM icp_usage
       WHERE client_id = ? AND date >= ? AND date <= ?`,
    )
    .get(clientId, startDate, endDate) as { total: number };
  return row.total;
}

// ── icp_billing ──────────────────────────────────────────────────────────────

export function createInvoice(fields: {
  client_id: string;
  stripe_customer_id: string;
  period_start: number;
  period_end: number;
  invoice_amount_cents: number;
}): IcpBilling {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT INTO icp_billing
         (id, client_id, stripe_customer_id, period_start, period_end, invoice_amount_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      id,
      fields.client_id,
      fields.stripe_customer_id,
      fields.period_start,
      fields.period_end,
      fields.invoice_amount_cents,
      now,
    );
  return getDb()
    .prepare('SELECT * FROM icp_billing WHERE id = ?')
    .get(id) as IcpBilling;
}

export function markInvoicePaid(id: string, stripeInvoiceId: string): void {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `UPDATE icp_billing
       SET status = 'paid', stripe_invoice_id = ?, paid_at = ?
       WHERE id = ?`,
    )
    .run(stripeInvoiceId, now, id);
}

export function markInvoiceFailed(id: string): void {
  getDb()
    .prepare(`UPDATE icp_billing SET status = 'failed' WHERE id = ?`)
    .run(id);
}

export function getInvoice(id: string): IcpBilling | undefined {
  return getDb()
    .prepare('SELECT * FROM icp_billing WHERE id = ?')
    .get(id) as IcpBilling | undefined;
}

export function listInvoicesForClient(clientId: string): IcpBilling[] {
  return getDb()
    .prepare(
      'SELECT * FROM icp_billing WHERE client_id = ? ORDER BY period_start DESC',
    )
    .all(clientId) as IcpBilling[];
}
