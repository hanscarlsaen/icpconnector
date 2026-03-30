import crypto from 'crypto';
import { execSync } from 'child_process';
import path from 'path';

import { getDb } from './db.js';
import { getClient, type IcpClient } from './icp-db.js';
import { PROJECT_ROOT } from './config.js';
import { logger } from './logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type DeploymentStatus = 'provisioning' | 'deploying' | 'running' | 'failed' | 'destroyed';

export interface IcpDeployment {
  id: string;
  client_id: string;
  droplet_id: number;
  droplet_name: string;
  droplet_ip: string | null;
  region: string;
  size: string;
  status: DeploymentStatus;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export interface ProvisionOpts {
  clientId: string;
  region?: string;
  size?: string;
  sshKeyId?: string;
}

export interface ProvisionResult {
  deployment: IcpDeployment;
  dropletId: number;
  ip: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_REGION = 'nyc3';
const DEFAULT_SIZE = 's-1vcpu-2gb';
const DEFAULT_SSH_KEY_ID = '54488305';
const DROPLET_IMAGE_ID = 178619052; // Ubuntu 24.04 LTS x64
const DROPLET_TAG = 'icpconnector-client';

// ── DB Operations ────────────────────────────────────────────────────────────

export function ensureDeploymentTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS icp_deployments (
      id              TEXT PRIMARY KEY,
      client_id       TEXT NOT NULL REFERENCES icp_clients(id) ON DELETE CASCADE,
      droplet_id      INTEGER NOT NULL,
      droplet_name    TEXT NOT NULL,
      droplet_ip      TEXT,
      region          TEXT NOT NULL,
      size            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'provisioning',
      error_message   TEXT,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_icp_deployments_client ON icp_deployments(client_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_icp_deployments_droplet ON icp_deployments(droplet_id);
  `);
}

export function insertDeployment(fields: {
  clientId: string;
  dropletId: number;
  dropletName: string;
  dropletIp: string | null;
  region: string;
  size: string;
  status: DeploymentStatus;
}): IcpDeployment {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT INTO icp_deployments
         (id, client_id, droplet_id, droplet_name, droplet_ip, region, size, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, fields.clientId, fields.dropletId, fields.dropletName, fields.dropletIp, fields.region, fields.size, fields.status, now, now);
  return getDb().prepare('SELECT * FROM icp_deployments WHERE id = ?').get(id) as IcpDeployment;
}

export function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  extra?: { dropletIp?: string; errorMessage?: string | null },
): void {
  const now = Math.floor(Date.now() / 1000);
  const fields: string[] = ['status = ?', 'updated_at = ?'];
  const values: unknown[] = [status, now];

  if (extra?.dropletIp !== undefined) {
    fields.push('droplet_ip = ?');
    values.push(extra.dropletIp);
  }
  if (extra?.errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(extra.errorMessage);
  }

  values.push(deploymentId);
  getDb()
    .prepare(`UPDATE icp_deployments SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);
}

export function getDeploymentByClient(clientId: string): IcpDeployment | undefined {
  return getDb()
    .prepare('SELECT * FROM icp_deployments WHERE client_id = ? AND status != ? ORDER BY created_at DESC LIMIT 1')
    .get(clientId, 'destroyed') as IcpDeployment | undefined;
}

export function getDeployment(id: string): IcpDeployment | undefined {
  return getDb()
    .prepare('SELECT * FROM icp_deployments WHERE id = ?')
    .get(id) as IcpDeployment | undefined;
}

export function listDeployments(): IcpDeployment[] {
  return getDb()
    .prepare('SELECT * FROM icp_deployments WHERE status != ? ORDER BY created_at DESC')
    .all('destroyed') as IcpDeployment[];
}

// ── Droplet Name ─────────────────────────────────────────────────────────────

function makeDropletName(client: IcpClient): string {
  const slug = client.company_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30);
  return `icp-${slug}`;
}

// ── Provision (Create Droplet) ───────────────────────────────────────────────

/**
 * Provisions a new DigitalOcean droplet for the given client.
 * This function is designed to be called by the orchestrator after client
 * onboarding is complete. It creates the droplet and records the deployment
 * in the database. Deployment of the agent code is a separate step.
 *
 * Returns the droplet ID and deployment record. The caller should then
 * use `deployAgent()` to push code to the droplet once it's ready.
 */
export async function provisionDroplet(
  opts: ProvisionOpts,
  createDropletFn: (params: {
    Name: string;
    Size: string;
    ImageID: number;
    Region: string;
    SSHKeys: string[];
    Tags: string[];
    Monitoring: boolean;
  }) => Promise<{ id: number; networks?: { v4?: Array<{ ip_address: string; type: string }> } }>,
): Promise<IcpDeployment> {
  const client = getClient(opts.clientId);
  if (!client) {
    throw new Error(`Client not found: ${opts.clientId}`);
  }

  // Check for existing active deployment
  const existing = getDeploymentByClient(opts.clientId);
  if (existing && existing.status !== 'failed') {
    throw new Error(`Client ${opts.clientId} already has an active deployment (${existing.status})`);
  }

  const dropletName = makeDropletName(client);
  const region = opts.region ?? DEFAULT_REGION;
  const size = opts.size ?? DEFAULT_SIZE;
  const sshKeyId = opts.sshKeyId ?? DEFAULT_SSH_KEY_ID;

  logger.info({ clientId: opts.clientId, dropletName, region, size }, 'Provisioning droplet');

  const droplet = await createDropletFn({
    Name: dropletName,
    Size: size,
    ImageID: DROPLET_IMAGE_ID,
    Region: region,
    SSHKeys: [sshKeyId],
    Tags: [DROPLET_TAG, `client:${opts.clientId}`],
    Monitoring: true,
  });

  const publicIp = droplet.networks?.v4?.find(n => n.type === 'public')?.ip_address ?? null;

  const deployment = insertDeployment({
    clientId: opts.clientId,
    dropletId: droplet.id,
    dropletName,
    dropletIp: publicIp,
    region,
    size,
    status: 'provisioning',
  });

  logger.info({ deploymentId: deployment.id, dropletId: droplet.id, ip: publicIp }, 'Droplet created');
  return deployment;
}

// ── Deploy Agent Code ────────────────────────────────────────────────────────

/**
 * Deploys the ClaudeClaw agent to a provisioned droplet using the existing
 * deploy-agent.sh script. Requires the droplet IP to be available.
 */
export function deployAgent(deploymentId: string, agentId: string): void {
  const deployment = getDeployment(deploymentId);
  if (!deployment) {
    throw new Error(`Deployment not found: ${deploymentId}`);
  }
  if (!deployment.droplet_ip) {
    throw new Error(`Droplet IP not yet available for deployment ${deploymentId}`);
  }

  updateDeploymentStatus(deploymentId, 'deploying');

  try {
    const deployScript = path.join(PROJECT_ROOT, 'scripts', 'deploy-agent.sh');
    execSync(`bash "${deployScript}" "${agentId}" "${deployment.droplet_ip}"`, {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 600_000, // 10 minutes
    });

    updateDeploymentStatus(deploymentId, 'running');
    logger.info({ deploymentId, agentId, ip: deployment.droplet_ip }, 'Agent deployed successfully');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateDeploymentStatus(deploymentId, 'failed', { errorMessage: message });
    logger.error({ deploymentId, agentId, err: message }, 'Agent deployment failed');
    throw new Error(`Deployment failed: ${message}`);
  }
}

// ── Health Check ─────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  healthy: boolean;
  dropletStatus?: string;
  agentRunning?: boolean;
  error?: string;
}

/**
 * Checks if the deployed agent is healthy by:
 * 1. Verifying the droplet is active via DO API
 * 2. SSH-ing to check if the systemd service is running
 */
export async function checkHealth(
  deploymentId: string,
  getDropletFn: (params: { ID: number }) => Promise<{ status: string }>,
): Promise<HealthCheckResult> {
  const deployment = getDeployment(deploymentId);
  if (!deployment) {
    return { healthy: false, error: `Deployment not found: ${deploymentId}` };
  }

  try {
    const droplet = await getDropletFn({ ID: deployment.droplet_id });
    const dropletStatus = droplet.status;

    if (dropletStatus !== 'active') {
      return { healthy: false, dropletStatus, agentRunning: false };
    }

    if (!deployment.droplet_ip) {
      return { healthy: false, dropletStatus, agentRunning: false, error: 'No IP address' };
    }

    // Check if the systemd service is running
    let agentRunning = false;
    try {
      const serviceName = `claudeclaw-${deployment.droplet_name}`;
      execSync(
        `ssh -i ~/.ssh/claudeclaw_do -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 root@${deployment.droplet_ip} "systemctl is-active ${serviceName}"`,
        { stdio: 'pipe', timeout: 30_000 },
      );
      agentRunning = true;
    } catch {
      agentRunning = false;
    }

    return { healthy: agentRunning, dropletStatus, agentRunning };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { healthy: false, error: message };
  }
}

// ── Teardown (Destroy Droplet) ───────────────────────────────────────────────

/**
 * Destroys a client's droplet and marks the deployment as destroyed.
 * Called when a client cancels their subscription.
 */
export async function teardownDeployment(
  deploymentId: string,
  deleteDropletFn: (params: { ID: number }) => Promise<unknown>,
): Promise<void> {
  const deployment = getDeployment(deploymentId);
  if (!deployment) {
    throw new Error(`Deployment not found: ${deploymentId}`);
  }
  if (deployment.status === 'destroyed') {
    logger.warn({ deploymentId }, 'Deployment already destroyed');
    return;
  }

  logger.info({ deploymentId, dropletId: deployment.droplet_id }, 'Destroying droplet');

  try {
    await deleteDropletFn({ ID: deployment.droplet_id });
    updateDeploymentStatus(deploymentId, 'destroyed');
    logger.info({ deploymentId }, 'Droplet destroyed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateDeploymentStatus(deploymentId, 'failed', { errorMessage: `Teardown failed: ${message}` });
    throw new Error(`Teardown failed: ${message}`);
  }
}

// ── Update IP (for polling after provisioning) ───────────────────────────────

/**
 * Polls the DO API for the droplet's public IP and updates the deployment.
 * Useful when the droplet was just created and the IP wasn't immediately available.
 */
export async function updateDropletIp(
  deploymentId: string,
  getDropletFn: (params: { ID: number }) => Promise<{
    status: string;
    networks?: { v4?: Array<{ ip_address: string; type: string }> };
  }>,
): Promise<string | null> {
  const deployment = getDeployment(deploymentId);
  if (!deployment) {
    throw new Error(`Deployment not found: ${deploymentId}`);
  }

  const droplet = await getDropletFn({ ID: deployment.droplet_id });
  const publicIp = droplet.networks?.v4?.find(n => n.type === 'public')?.ip_address ?? null;

  if (publicIp && publicIp !== deployment.droplet_ip) {
    updateDeploymentStatus(deploymentId, deployment.status, { dropletIp: publicIp });
    logger.info({ deploymentId, ip: publicIp }, 'Droplet IP updated');
  }

  return publicIp;
}
