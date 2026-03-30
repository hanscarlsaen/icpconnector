import { beforeEach, describe, expect, it } from 'vitest';

import { _initTestDatabase } from './db.js';
import {
  createClient,
  createInvoice,
  deleteClient,
  deleteCredential,
  getClient,
  getCredential,
  getInvoice,
  getTotalLeadsForPeriod,
  getUsageForPeriod,
  listClients,
  listCredentialsForClient,
  listInvoicesForClient,
  markInvoiceFailed,
  markInvoicePaid,
  recordUsage,
  upsertCredential,
} from './icp-db.js';

beforeEach(() => {
  _initTestDatabase();
});

// ── icp_clients ──────────────────────────────────────────────────────────────

describe('icp_clients', () => {
  it('creates and retrieves a client', () => {
    const client = createClient({
      company_name: 'Acme Corp',
      contact_email: 'sales@acme.com',
      channel_type: 'slack',
      crm_type: 'hubspot',
    });
    expect(client.id).toBeTruthy();
    expect(client.company_name).toBe('Acme Corp');

    const fetched = getClient(client.id);
    expect(fetched).toEqual(client);
  });

  it('returns undefined for unknown client', () => {
    expect(getClient('nonexistent')).toBeUndefined();
  });

  it('lists all clients', () => {
    createClient({ company_name: 'First', contact_email: 'a@a.com', channel_type: 'slack', crm_type: 'hubspot' });
    createClient({ company_name: 'Second', contact_email: 'b@b.com', channel_type: 'slack', crm_type: 'pipedrive' });
    const list = listClients();
    expect(list).toHaveLength(2);
    const names = list.map((c) => c.company_name);
    expect(names).toContain('First');
    expect(names).toContain('Second');
  });

  it('deletes a client', () => {
    const client = createClient({ company_name: 'ToBeDel', contact_email: 'x@x.com', channel_type: 'slack', crm_type: 'hubspot' });
    deleteClient(client.id);
    expect(getClient(client.id)).toBeUndefined();
  });
});

// ── icp_credentials ──────────────────────────────────────────────────────────

describe('icp_credentials', () => {
  it('stores and retrieves credentials with decryption', () => {
    const client = createClient({ company_name: 'CredTest', contact_email: 'c@c.com', channel_type: 'slack', crm_type: 'hubspot' });
    const cred = upsertCredential({
      client_id: client.id,
      channel_type: 'slack',
      crm_type: 'hubspot',
      access_token: 'secret-access-token',
      refresh_token: 'secret-refresh-token',
      token_expiry: 9999999999,
    });
    expect(cred.access_token).toBe('secret-access-token');
    expect(cred.refresh_token).toBe('secret-refresh-token');

    const fetched = getCredential(client.id, 'slack', 'hubspot');
    expect(fetched?.access_token).toBe('secret-access-token');
  });

  it('upserts credential on conflict', () => {
    const client = createClient({ company_name: 'UpsertTest', contact_email: 'u@u.com', channel_type: 'slack', crm_type: 'hubspot' });
    upsertCredential({ client_id: client.id, channel_type: 'slack', crm_type: 'hubspot', access_token: 'token-v1' });
    upsertCredential({ client_id: client.id, channel_type: 'slack', crm_type: 'hubspot', access_token: 'token-v2' });

    const creds = listCredentialsForClient(client.id);
    expect(creds).toHaveLength(1);
    expect(creds[0].access_token).toBe('token-v2');
  });

  it('supports null refresh_token', () => {
    const client = createClient({ company_name: 'NoRefresh', contact_email: 'nr@nr.com', channel_type: 'slack', crm_type: 'salesforce' });
    const cred = upsertCredential({ client_id: client.id, channel_type: 'slack', crm_type: 'salesforce', access_token: 'tok' });
    expect(cred.refresh_token).toBeNull();
  });

  it('deletes credential by id', () => {
    const client = createClient({ company_name: 'DelCred', contact_email: 'd@d.com', channel_type: 'slack', crm_type: 'hubspot' });
    const cred = upsertCredential({ client_id: client.id, channel_type: 'slack', crm_type: 'hubspot', access_token: 'tok' });
    deleteCredential(cred.id);
    expect(getCredential(client.id, 'slack', 'hubspot')).toBeUndefined();
  });
});

// ── icp_usage ────────────────────────────────────────────────────────────────

describe('icp_usage', () => {
  it('records usage and returns row', () => {
    const client = createClient({ company_name: 'UsageTest', contact_email: 'u@u.com', channel_type: 'slack', crm_type: 'hubspot' });
    const row = recordUsage(client.id, '2026-03-01', 5);
    expect(row.leads_delivered).toBe(5);
    expect(row.date).toBe('2026-03-01');
  });

  it('accumulates usage on same day', () => {
    const client = createClient({ company_name: 'AccumTest', contact_email: 'a@a.com', channel_type: 'slack', crm_type: 'hubspot' });
    recordUsage(client.id, '2026-03-01', 3);
    const row = recordUsage(client.id, '2026-03-01', 7);
    expect(row.leads_delivered).toBe(10);
  });

  it('getUsageForPeriod returns rows in date range', () => {
    const client = createClient({ company_name: 'PeriodTest', contact_email: 'p@p.com', channel_type: 'slack', crm_type: 'hubspot' });
    recordUsage(client.id, '2026-02-28', 1);
    recordUsage(client.id, '2026-03-01', 5);
    recordUsage(client.id, '2026-03-15', 8);
    recordUsage(client.id, '2026-04-01', 2);

    const rows = getUsageForPeriod(client.id, '2026-03-01', '2026-03-31');
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026-03-01');
    expect(rows[1].date).toBe('2026-03-15');
  });

  it('getTotalLeadsForPeriod sums correctly', () => {
    const client = createClient({ company_name: 'TotalTest', contact_email: 't@t.com', channel_type: 'slack', crm_type: 'hubspot' });
    recordUsage(client.id, '2026-03-01', 5);
    recordUsage(client.id, '2026-03-15', 8);

    const total = getTotalLeadsForPeriod(client.id, '2026-03-01', '2026-03-31');
    expect(total).toBe(13);
  });

  it('getTotalLeadsForPeriod returns 0 when no data', () => {
    const client = createClient({ company_name: 'EmptyTest', contact_email: 'e@e.com', channel_type: 'slack', crm_type: 'hubspot' });
    const total = getTotalLeadsForPeriod(client.id, '2026-03-01', '2026-03-31');
    expect(total).toBe(0);
  });
});

// ── icp_billing ──────────────────────────────────────────────────────────────

describe('icp_billing', () => {
  it('creates invoice with pending status', () => {
    const client = createClient({ company_name: 'BillTest', contact_email: 'b@b.com', channel_type: 'slack', crm_type: 'hubspot' });
    const invoice = createInvoice({
      client_id: client.id,
      stripe_customer_id: 'cus_123',
      period_start: 1740787200,
      period_end: 1743465600,
      invoice_amount_cents: 9900,
    });
    expect(invoice.status).toBe('pending');
    expect(invoice.invoice_amount_cents).toBe(9900);
    expect(invoice.paid_at).toBeNull();
  });

  it('marks invoice as paid', () => {
    const client = createClient({ company_name: 'PaidTest', contact_email: 'p@p.com', channel_type: 'slack', crm_type: 'hubspot' });
    const invoice = createInvoice({
      client_id: client.id,
      stripe_customer_id: 'cus_456',
      period_start: 1740787200,
      period_end: 1743465600,
      invoice_amount_cents: 4900,
    });
    markInvoicePaid(invoice.id, 'inv_stripe_abc');
    const updated = getInvoice(invoice.id);
    expect(updated?.status).toBe('paid');
    expect(updated?.stripe_invoice_id).toBe('inv_stripe_abc');
    expect(updated?.paid_at).toBeGreaterThan(0);
  });

  it('marks invoice as failed', () => {
    const client = createClient({ company_name: 'FailTest', contact_email: 'f@f.com', channel_type: 'slack', crm_type: 'hubspot' });
    const invoice = createInvoice({
      client_id: client.id,
      stripe_customer_id: 'cus_789',
      period_start: 1740787200,
      period_end: 1743465600,
      invoice_amount_cents: 1900,
    });
    markInvoiceFailed(invoice.id);
    expect(getInvoice(invoice.id)?.status).toBe('failed');
  });

  it('listInvoicesForClient returns invoices in descending order', () => {
    const client = createClient({ company_name: 'ListBill', contact_email: 'lb@lb.com', channel_type: 'slack', crm_type: 'hubspot' });
    createInvoice({ client_id: client.id, stripe_customer_id: 'cus_1', period_start: 1000, period_end: 2000, invoice_amount_cents: 100 });
    createInvoice({ client_id: client.id, stripe_customer_id: 'cus_1', period_start: 3000, period_end: 4000, invoice_amount_cents: 200 });
    const invoices = listInvoicesForClient(client.id);
    expect(invoices).toHaveLength(2);
    expect(invoices[0].period_start).toBe(3000);
  });

  it('returns undefined for unknown invoice', () => {
    expect(getInvoice('nonexistent')).toBeUndefined();
  });
});
