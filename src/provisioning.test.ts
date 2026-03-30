import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _initTestDatabase } from './db.js';
import { createClient } from './icp-db.js';
import {
  ensureDeploymentTable,
  getDeployment,
  getDeploymentByClient,
  insertDeployment,
  listDeployments,
  provisionDroplet,
  teardownDeployment,
  updateDeploymentStatus,
  updateDropletIp,
} from './provisioning.js';

beforeEach(() => {
  _initTestDatabase();
  ensureDeploymentTable();
});

function makeClient(name = 'TestCo') {
  return createClient({
    company_name: name,
    contact_email: `${name.toLowerCase()}@test.com`,
    channel_type: 'slack',
    crm_type: 'hubspot',
  });
}

// ── DB Operations ────────────────────────────────────────────────────────────

describe('icp_deployments CRUD', () => {
  it('inserts and retrieves a deployment', () => {
    const client = makeClient();
    const dep = insertDeployment({
      clientId: client.id,
      dropletId: 12345,
      dropletName: 'icp-testco',
      dropletIp: '1.2.3.4',
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'provisioning',
    });

    expect(dep.id).toBeTruthy();
    expect(dep.client_id).toBe(client.id);
    expect(dep.droplet_id).toBe(12345);
    expect(dep.droplet_ip).toBe('1.2.3.4');
    expect(dep.status).toBe('provisioning');

    const fetched = getDeployment(dep.id);
    expect(fetched).toEqual(dep);
  });

  it('returns undefined for unknown deployment', () => {
    expect(getDeployment('nonexistent')).toBeUndefined();
  });

  it('getDeploymentByClient returns active deployment', () => {
    const client = makeClient();
    insertDeployment({
      clientId: client.id,
      dropletId: 111,
      dropletName: 'icp-old',
      dropletIp: null,
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'destroyed',
    });
    const active = insertDeployment({
      clientId: client.id,
      dropletId: 222,
      dropletName: 'icp-new',
      dropletIp: '5.6.7.8',
      region: 'sfo3',
      size: 's-2vcpu-4gb',
      status: 'running',
    });

    const found = getDeploymentByClient(client.id);
    expect(found?.droplet_id).toBe(222);
    expect(found?.status).toBe('running');
  });

  it('getDeploymentByClient returns undefined when all destroyed', () => {
    const client = makeClient();
    insertDeployment({
      clientId: client.id,
      dropletId: 333,
      dropletName: 'icp-gone',
      dropletIp: null,
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'destroyed',
    });
    expect(getDeploymentByClient(client.id)).toBeUndefined();
  });

  it('listDeployments excludes destroyed', () => {
    const c1 = makeClient('Alpha');
    const c2 = makeClient('Beta');
    insertDeployment({ clientId: c1.id, dropletId: 1, dropletName: 'a', dropletIp: null, region: 'nyc3', size: 's-1vcpu-2gb', status: 'running' });
    insertDeployment({ clientId: c2.id, dropletId: 2, dropletName: 'b', dropletIp: null, region: 'nyc3', size: 's-1vcpu-2gb', status: 'destroyed' });
    const list = listDeployments();
    expect(list).toHaveLength(1);
    expect(list[0].droplet_id).toBe(1);
  });

  it('updates deployment status and fields', () => {
    const client = makeClient();
    const dep = insertDeployment({
      clientId: client.id,
      dropletId: 444,
      dropletName: 'icp-update',
      dropletIp: null,
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'provisioning',
    });

    updateDeploymentStatus(dep.id, 'running', { dropletIp: '9.8.7.6' });
    const updated = getDeployment(dep.id);
    expect(updated?.status).toBe('running');
    expect(updated?.droplet_ip).toBe('9.8.7.6');
  });

  it('updates error_message on failure', () => {
    const client = makeClient();
    const dep = insertDeployment({
      clientId: client.id,
      dropletId: 555,
      dropletName: 'icp-fail',
      dropletIp: null,
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'deploying',
    });

    updateDeploymentStatus(dep.id, 'failed', { errorMessage: 'SSH timeout' });
    const updated = getDeployment(dep.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.error_message).toBe('SSH timeout');
  });
});

// ── provisionDroplet ─────────────────────────────────────────────────────────

describe('provisionDroplet', () => {
  it('creates droplet and records deployment', async () => {
    const client = makeClient('Acme Corp');
    const mockCreate = vi.fn().mockResolvedValue({
      id: 99001,
      networks: { v4: [{ ip_address: '10.20.30.40', type: 'public' }] },
    });

    const dep = await provisionDroplet({ clientId: client.id }, mockCreate);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.Name).toBe('icp-acme-corp');
    expect(callArgs.Tags).toContain('icpconnector-client');
    expect(callArgs.Monitoring).toBe(true);

    expect(dep.droplet_id).toBe(99001);
    expect(dep.droplet_ip).toBe('10.20.30.40');
    expect(dep.status).toBe('provisioning');
  });

  it('throws when client not found', async () => {
    const mockCreate = vi.fn();
    await expect(provisionDroplet({ clientId: 'bad-id' }, mockCreate)).rejects.toThrow('Client not found');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws when client already has active deployment', async () => {
    const client = makeClient('DupeTest');
    insertDeployment({
      clientId: client.id,
      dropletId: 77,
      dropletName: 'icp-dup',
      dropletIp: '1.1.1.1',
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'running',
    });

    const mockCreate = vi.fn();
    await expect(provisionDroplet({ clientId: client.id }, mockCreate)).rejects.toThrow('already has an active deployment');
  });

  it('allows re-provisioning after failed deployment', async () => {
    const client = makeClient('RetryTest');
    insertDeployment({
      clientId: client.id,
      dropletId: 88,
      dropletName: 'icp-retry',
      dropletIp: null,
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'failed',
    });

    const mockCreate = vi.fn().mockResolvedValue({ id: 99002 });
    const dep = await provisionDroplet({ clientId: client.id }, mockCreate);
    expect(dep.droplet_id).toBe(99002);
  });

  it('handles droplet without immediate IP', async () => {
    const client = makeClient('NoIpYet');
    const mockCreate = vi.fn().mockResolvedValue({ id: 99003 });

    const dep = await provisionDroplet({ clientId: client.id }, mockCreate);
    expect(dep.droplet_ip).toBeNull();
  });
});

// ── teardownDeployment ───────────────────────────────────────────────────────

describe('teardownDeployment', () => {
  it('destroys droplet and marks deployment destroyed', async () => {
    const client = makeClient();
    const dep = insertDeployment({
      clientId: client.id,
      dropletId: 5001,
      dropletName: 'icp-teardown',
      dropletIp: '1.2.3.4',
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'running',
    });

    const mockDelete = vi.fn().mockResolvedValue({});
    await teardownDeployment(dep.id, mockDelete);

    expect(mockDelete).toHaveBeenCalledWith({ ID: 5001 });
    const updated = getDeployment(dep.id);
    expect(updated?.status).toBe('destroyed');
  });

  it('throws for unknown deployment', async () => {
    const mockDelete = vi.fn();
    await expect(teardownDeployment('nonexistent', mockDelete)).rejects.toThrow('Deployment not found');
  });

  it('skips already-destroyed deployment', async () => {
    const client = makeClient();
    const dep = insertDeployment({
      clientId: client.id,
      dropletId: 5002,
      dropletName: 'icp-already',
      dropletIp: null,
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'destroyed',
    });

    const mockDelete = vi.fn();
    await teardownDeployment(dep.id, mockDelete);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('marks failed on DO API error', async () => {
    const client = makeClient();
    const dep = insertDeployment({
      clientId: client.id,
      dropletId: 5003,
      dropletName: 'icp-errordel',
      dropletIp: '1.2.3.4',
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'running',
    });

    const mockDelete = vi.fn().mockRejectedValue(new Error('DO API 500'));
    await expect(teardownDeployment(dep.id, mockDelete)).rejects.toThrow('Teardown failed');

    const updated = getDeployment(dep.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.error_message).toContain('DO API 500');
  });
});

// ── updateDropletIp ──────────────────────────────────────────────────────────

describe('updateDropletIp', () => {
  it('updates IP when available', async () => {
    const client = makeClient();
    const dep = insertDeployment({
      clientId: client.id,
      dropletId: 6001,
      dropletName: 'icp-ipupdate',
      dropletIp: null,
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'provisioning',
    });

    const mockGet = vi.fn().mockResolvedValue({
      status: 'active',
      networks: { v4: [{ ip_address: '50.60.70.80', type: 'public' }] },
    });

    const ip = await updateDropletIp(dep.id, mockGet);
    expect(ip).toBe('50.60.70.80');

    const updated = getDeployment(dep.id);
    expect(updated?.droplet_ip).toBe('50.60.70.80');
  });

  it('returns null when no IP yet', async () => {
    const client = makeClient();
    const dep = insertDeployment({
      clientId: client.id,
      dropletId: 6002,
      dropletName: 'icp-noip',
      dropletIp: null,
      region: 'nyc3',
      size: 's-1vcpu-2gb',
      status: 'provisioning',
    });

    const mockGet = vi.fn().mockResolvedValue({ status: 'new' });
    const ip = await updateDropletIp(dep.id, mockGet);
    expect(ip).toBeNull();
  });
});
