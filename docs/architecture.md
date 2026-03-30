# ICPConnector — Platform Architecture

**Status:** v1.0 Draft
**Author:** Platform Architect
**Date:** 2026-03-30

---

## Overview

ICPConnector is a B2B lead generation SaaS. Clients onboard via a web form, connect their chat channel (Telegram/Slack/WhatsApp) and CRM (HubSpot/Pipedrive/Google Sheets), then converse with an AI agent to discover and export leads. There is no separate login or app — the product lives inside tools clients already use.

Each client gets a dedicated AI agent instance running on its own DigitalOcean droplet. The control plane (onboarding, billing, provisioning) runs separately from the per-client agent instances.

---

## System Architecture Diagram

```
                        ┌─────────────────────────────────────────────┐
                        │           CONTROL PLANE (DO Droplet)         │
                        │                                               │
  Client browser ───▶  │  ┌───────────────────────────────────────┐   │
  (onboarding form)     │  │  Onboarding API  (Express + TypeScript)│   │
                        │  │  POST /onboard                         │   │
                        │  │  GET  /billing/…                       │   │
                        │  │  GET  /oauth/callback/…               │   │
                        │  └────────────────┬──────────────────────┘   │
                        │                   │                           │
                        │            ┌──────▼──────┐                   │
                        │            │  PostgreSQL  │                   │
                        │            │  (clients,  │                   │
                        │            │   usage,    │                   │
                        │            │   billing)  │                   │
                        │            └──────┬──────┘                   │
                        │                   │                           │
                        │  ┌────────────────▼──────────────────────┐   │
                        │  │  Agent Provisioner                     │   │
                        │  │  - Creates DO droplet per client       │   │
                        │  │  - Pushes client config (encrypted)    │   │
                        │  │  - Installs + starts ClaudeClaw agent  │   │
                        │  └────────────────────────────────────────┘   │
                        │                                               │
                        │  ┌────────────────────────────────────────┐  │
                        │  │  Stripe Webhook Receiver               │  │
                        │  │  - Handles payment events              │  │
                        │  │  - Suspends/reactivates clients        │  │
                        │  └────────────────────────────────────────┘  │
                        └─────────────────────────────────────────────┘

              ┌─────────────────────────────────────────────────┐
              │         PER-CLIENT AGENT (DO Droplet)            │
              │                                                   │
              │  Channel Adapter (one of):                        │
              │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
              │  │ Telegram │  │  Slack   │  │   WhatsApp    │  │
              │  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
              │       └─────────────┴─────────────────┘          │
              │                     │                             │
              │            ┌────────▼────────┐                   │
              │            │  ClaudeClaw Bot  │                   │
              │            │  (Claude AI core)│                   │
              │            └────────┬────────┘                   │
              │                     │                             │
              │         ┌───────────▼────────────┐               │
              │         │   Skill Plugin System   │               │
              │         │  ┌──────────────────┐  │               │
              │         │  │ Lead_generation  │  │               │
              │         │  │ (Apify → leads)  │  │               │
              │         │  ├──────────────────┤  │               │
              │         │  │  HubSpot_export  │  │               │
              │         │  ├──────────────────┤  │               │
              │         │  │ Pipedrive_export │  │               │
              │         │  ├──────────────────┤  │               │
              │         │  │  Sheets_export   │  │               │
              │         │  └──────────────────┘  │               │
              │         └────────────────────────┘               │
              │                                                   │
              │  ┌──────────────────────────────────────────┐    │
              │  │  Usage Reporter                          │    │
              │  │  - Reports lead deliveries to control    │    │
              │  │    plane API (POST /usage/report)        │    │
              │  │  - Reads client config from local SQLite │    │
              │  └──────────────────────────────────────────┘    │
              └─────────────────────────────────────────────────┘
```

---

## Database Schema (PostgreSQL — Control Plane)

### `clients`
Stores each onboarded client.

```sql
CREATE TABLE clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      TEXT NOT NULL,
  contact_name      TEXT NOT NULL,
  contact_email     TEXT NOT NULL UNIQUE,
  contact_phone     TEXT,

  -- Channel
  channel_type      TEXT NOT NULL CHECK (channel_type IN ('telegram', 'slack', 'whatsapp')),
  channel_config    JSONB NOT NULL DEFAULT '{}',
  -- telegram: { bot_token_enc, chat_id }
  -- slack:    { bot_token_enc, channel_id, signing_secret_enc }
  -- whatsapp: { phone_number_id, access_token_enc, verify_token_enc }

  -- CRM
  crm_type          TEXT NOT NULL CHECK (crm_type IN ('hubspot', 'pipedrive', 'google_sheets', 'none')),
  crm_config        JSONB NOT NULL DEFAULT '{}',
  -- hubspot:     { access_token_enc, refresh_token_enc, expires_at }
  -- pipedrive:   { api_token_enc }
  -- google_sheets: { access_token_enc, refresh_token_enc, expires_at, spreadsheet_id }

  -- Provisioning
  droplet_id        TEXT,           -- DigitalOcean droplet ID
  droplet_ip        TEXT,           -- Public IP for SSH provisioning
  agent_status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (agent_status IN ('pending', 'provisioning', 'active', 'suspended', 'failed')),
  provisioned_at    TIMESTAMPTZ,

  -- Billing
  stripe_customer_id TEXT UNIQUE,
  stripe_payment_method_id TEXT,
  billing_status    TEXT NOT NULL DEFAULT 'trial'
                    CHECK (billing_status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at     TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  billing_cycle_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_email ON clients(contact_email);
CREATE INDEX idx_clients_agent_status ON clients(agent_status);
CREATE INDEX idx_clients_billing_status ON clients(billing_status);
```

**Security note:** All credentials in `channel_config` and `crm_config` are encrypted with AES-256-GCM before storage (same pattern as existing `db.ts`). The encryption key is stored in the control plane's `.env`, never in the database.

---

### `usage_events`
Tracks every batch of leads delivered to a client.

```sql
CREATE TABLE usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id),
  leads_count INTEGER NOT NULL CHECK (leads_count > 0),
  skill_name  TEXT NOT NULL,       -- 'Lead_generation', 'HubSpot_export', etc.
  crm_type    TEXT,                -- crm leads were exported to
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billing_period TEXT NOT NULL,    -- 'YYYY-MM' e.g. '2026-03'
  billed      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_usage_client_period ON usage_events(client_id, billing_period);
CREATE INDEX idx_usage_billed ON usage_events(billed) WHERE NOT billed;
```

---

### `invoices`
Monthly invoices generated from usage.

```sql
CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id),
  billing_period    TEXT NOT NULL,          -- 'YYYY-MM'
  leads_count       INTEGER NOT NULL,
  price_per_lead    NUMERIC(10,4) NOT NULL, -- in USD
  total_amount      NUMERIC(10,2) NOT NULL, -- in USD
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed', 'void')),
  stripe_invoice_id TEXT UNIQUE,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,
  UNIQUE (client_id, billing_period)
);
```

---

### `oauth_tokens`
Separate table for rotating OAuth tokens (HubSpot, Google).

```sql
CREATE TABLE oauth_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id),
  provider        TEXT NOT NULL CHECK (provider IN ('hubspot', 'google')),
  access_token    TEXT NOT NULL,   -- AES-256-GCM encrypted
  refresh_token   TEXT NOT NULL,   -- AES-256-GCM encrypted
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, provider)
);
```

---

## File / Folder Structure

```
icpconnector/
├── docs/
│   ├── architecture.md            ← this file
│   ├── rfc-sdk-engine.md
│   └── skill-discovery-and-deployment.md
│
├── control-plane/                 ← NEW: Onboarding + billing API
│   ├── src/
│   │   ├── index.ts               ← Express server entrypoint
│   │   ├── db.ts                  ← PostgreSQL client (pg + encryption utils)
│   │   ├── routes/
│   │   │   ├── onboarding.ts      ← POST /onboard, GET /onboard/status/:clientId
│   │   │   ├── oauth.ts           ← GET /oauth/callback/hubspot, /google
│   │   │   └── billing.ts         ← POST /billing/webhook (Stripe)
│   │   ├── services/
│   │   │   ├── provisioner.ts     ← DO droplet creation + agent install
│   │   │   ├── billing.ts         ← Stripe invoice generation
│   │   │   ├── usage.ts           ← POST /usage/report handler
│   │   │   └── token-refresh.ts   ← OAuth token refresh cron
│   │   ├── crypto.ts              ← AES-256-GCM encrypt/decrypt (shared)
│   │   └── config.ts              ← Env vars: DATABASE_URL, STRIPE_KEY, DO_TOKEN, etc.
│   ├── migrations/                ← SQL migration files
│   │   ├── 001_initial_schema.sql
│   │   └── 002_oauth_tokens.sql
│   ├── package.json
│   └── tsconfig.json
│
├── src/                           ← Existing ClaudeClaw agent core (unchanged)
│   ├── bot.ts
│   ├── agent.ts
│   ├── config.ts
│   ├── db.ts                      ← SQLite (per-agent, stays as-is)
│   └── …
│
├── skills/                        ← Skill plugin system (existing)
│   ├── lead_generation/
│   │   ├── manifest.json
│   │   ├── handler.py
│   │   ├── SKILL.md
│   │   └── requirements.txt
│   ├── HubSpot_export/
│   ├── Pipedrive_export/
│   └── google_sheets_export/      ← NEW: Google Sheets CRM skill
│       ├── manifest.json
│       ├── handler.py
│       ├── SKILL.md
│       └── requirements.txt
│
├── agents/                        ← Per-agent config directories
│   └── {client-id}/               ← Created per client during provisioning
│       ├── agent.yaml             ← Channel config, skill list, model
│       ├── CLAUDE.md              ← System prompt (ICP-specific)
│       └── .claude/
│           └── skills/            ← Auto-symlinked SKILL.md files
│
├── scripts/
│   ├── run-skill.sh               ← Universal skill invocation wrapper
│   ├── provision-agent.sh         ← SSH-based droplet setup script
│   └── bill-monthly.ts            ← Monthly billing cron entrypoint
│
└── website/                       ← Onboarding web form (existing)
```

---

## API Endpoints (Control Plane)

### Onboarding

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/onboard` | Submit onboarding form. Validates input, creates client record, initiates provisioning. Returns `clientId` + status polling URL. |
| `GET`  | `/onboard/status/:clientId` | Poll provisioning status (`pending → provisioning → active`). Returns droplet IP and channel-specific setup instructions. |
| `GET`  | `/oauth/callback/hubspot` | HubSpot OAuth redirect. Exchanges `code` for tokens, stores encrypted in `oauth_tokens`. |
| `GET`  | `/oauth/callback/google` | Google OAuth redirect. Stores Sheets tokens, sets `spreadsheet_id` in client config. |

#### `POST /onboard` — Request Body

```json
{
  "company_name": "Acme Corp",
  "contact_name": "Jane Smith",
  "contact_email": "jane@acme.com",
  "contact_phone": "+45 12 34 56 78",
  "channel_type": "telegram",
  "channel_config": {
    "bot_token": "123456:ABC..."
  },
  "crm_type": "hubspot"
}
```

#### `POST /onboard` — Response

```json
{
  "clientId": "uuid",
  "status": "provisioning",
  "statusUrl": "/onboard/status/uuid",
  "oauthUrl": "https://app.hubspot.com/oauth/authorize?…"
}
```

---

### Usage Reporting (Internal — called by agent droplets)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/usage/report` | Agent reports leads delivered. Authenticated by shared `AGENT_REPORT_SECRET`. |

```json
{
  "clientId": "uuid",
  "leadsCount": 42,
  "skillName": "Lead_generation",
  "crmType": "hubspot"
}
```

---

### Billing (Stripe Webhooks)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/billing/webhook` | Stripe webhook. Handles `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`. |
| `POST` | `/billing/invoice/:clientId` | Internal: trigger monthly invoice generation for a client. |

---

## Channel Abstraction

Each channel adapter is a thin wrapper that normalises incoming messages to a standard `BotMessage` interface and sends replies via the channel API. The ClaudeClaw agent core never knows which channel it is talking to.

```typescript
interface ChannelAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(chatId: string, text: string): Promise<void>;
  onMessage(handler: (msg: BotMessage) => Promise<void>): void;
}

interface BotMessage {
  chatId: string;
  userId: string;
  text: string;
  timestamp: Date;
}
```

**Implementations:**
- `src/telegram.ts` — existing, wraps `node-telegram-bot-api`
- `src/slack.ts` — existing, wraps Slack Bolt SDK
- `src/whatsapp.ts` — existing, wraps WhatsApp Cloud API

Adding a new channel requires only a new file implementing `ChannelAdapter` — no changes to the bot core.

The active adapter is selected at agent startup from `agent.yaml`:

```yaml
channel: telegram   # or slack, whatsapp
```

---

## Skill Plugin System

Skills are hot-swappable plug-ins. Each skill is a self-contained directory:

```
skills/{SkillName}/
├── manifest.json      ← name, description, input schema, handler type, timeout
├── SKILL.md           ← Natural language description loaded into Claude's context
├── handler.py         ← (or handler.js / handler.sh)
└── requirements.txt   ← Python dependencies (if applicable)
```

**Discovery:** At agent startup, `src/index.ts` reads the `skills` list from `agent.yaml` and creates symlinks in `agents/{clientId}/.claude/skills/`. Claude Code discovers `SKILL.md` files automatically via its `settingSources: ['project']` scan.

**Invocation:** Claude always calls:
```bash
$PROJECT_ROOT/scripts/run-skill.sh <skill_name> '<json_input>'
```

The wrapper reads `manifest.json`, selects the correct interpreter, injects `SKILL_INPUT`, and returns JSON to stdout.

**Adding a new skill:** Create the directory with the four files above. No changes to the agent core, no restart needed for new clients.

**Per-client skill sets:** Each client's `agent.yaml` lists which skills they have access to. Skill A on client 1 doesn't affect client 2.

---

## Agent Provisioning Flow

When `POST /onboard` completes validation and OAuth:

1. **Create DigitalOcean Droplet**
   - Size: `s-1vcpu-1gb` (cheapest; upgrade path available)
   - Region: `ams3` (or closest to client)
   - Image: Ubuntu 24.04 LTS
   - Tags: `icpconnector`, `client-{clientId}`

2. **Wait for droplet to become active** (~30 seconds)

3. **SSH provisioning via `provision-agent.sh`**
   - Install: Node.js 20, Python 3.11, `pnpm`
   - Clone ICPConnector repo
   - `pnpm install`
   - Write `.env` with client-specific config (bot token, CRM credentials — all AES-encrypted in DB, decrypted at provision time and injected into droplet `.env`)
   - Write `agents/{clientId}/agent.yaml`
   - Enable `systemd` service for auto-restart

4. **Start agent** — `systemd` starts `pnpm run agent -- --agent {clientId}`

5. **Update client record** — `agent_status = 'active'`, store `droplet_id` and `droplet_ip`

6. **Notify client** — Agent sends welcome message on their channel

```
Provisioning timeline:
─────────────────────
0s:    POST /onboard received
2s:    Client record created in PostgreSQL
5s:    DO droplet creation requested
35s:   Droplet active, SSH provisioning starts
90s:   Agent installed and started
100s:  Welcome message sent to client's channel
```

---

## Billing Architecture

### Pay-per-lead model

- Default price: **$0.50 / lead** (configurable in control plane config)
- Monthly invoice generated on the 1st of each month via cron
- Trial period: 14 days free (configured in `clients.trial_ends_at`)

### Flow

```
1. Agent delivers leads
        ↓
2. Agent calls POST /usage/report
        ↓
3. Control plane inserts usage_event row
        ↓
4. Cron runs on 1st of month
        ↓
5. Sum usage_events WHERE billing_period = last month AND NOT billed
        ↓
6. Create Stripe invoice via API
        ↓
7. Stripe charges stored payment method
        ↓
8. Stripe webhook → POST /billing/webhook
        ↓
9. On invoice.paid: mark usage_events billed=true, update invoice status
   On payment_failed: set client billing_status = 'past_due', notify client
   On subscription.deleted: set billing_status = 'suspended', stop droplet
```

### Stripe Integration

- Each client gets a **Stripe Customer** created at onboarding
- Payment method collected via **Stripe Checkout** or **Payment Element** embedded in onboarding form
- Invoices created programmatically via `stripe.invoices.create()`
- Webhook signature verified using `stripe.webhooks.constructEvent()`

---

## Deployment Architecture (DigitalOcean)

```
┌─────────────────────────────────────────────┐
│  Control Plane Droplet  (s-2vcpu-4gb)        │
│  Region: ams3                                 │
│                                               │
│  ├── Control Plane API  (port 3000)           │
│  │   └── systemd: icpconnector-control.service│
│  ├── PostgreSQL  (port 5432, local only)      │
│  └── Cron: billing (1st of month, 00:00 UTC)  │
│       token-refresh (every 30 min)            │
└──────────────────┬──────────────────────────┘
                   │ DigitalOcean API
          ┌────────▼──────────┐
          │  DO Droplet Pool  │
          │                   │
          │  client-aaa ────▶ Droplet (s-1vcpu-1gb, ams3)
          │  client-bbb ────▶ Droplet (s-1vcpu-1gb, ams3)
          │  client-ccc ────▶ Droplet (s-1vcpu-1gb, fra1)
          │  …                                │
          └───────────────────────────────────┘
```

**Networking:**
- Control plane droplet has a firewall allowing 80/443 inbound (onboarding form) and 22 (SSH from control plane only)
- Client droplets: no public HTTP ports. Only SSH (from control plane IP only) and outbound to channel APIs (Telegram, Slack, WhatsApp) and CRM APIs.
- Control plane calls client agents via `/usage/report` — agents call back to control plane, not the other way around

**Scaling:**
- Vertical: each client droplet can be resized via DO API without reprovisioning
- Horizontal: naturally scaled — each client is isolated, adding clients is just adding droplets
- Control plane: single droplet initially; can be moved behind a DO Load Balancer if needed

---

## Security Model

| Concern | Solution |
|---------|----------|
| CRM/channel credentials at rest | AES-256-GCM encryption in PostgreSQL JSONB columns |
| CRM/channel credentials in transit | HTTPS only; decrypted only at provision time, written to droplet `.env` |
| Agent-to-control-plane auth | Shared `AGENT_REPORT_SECRET` in droplet `.env`, passed as `Authorization: Bearer` |
| OAuth token storage | Separate `oauth_tokens` table, encrypted; refresh handled by cron |
| Stripe webhook auth | `stripe.webhooks.constructEvent()` verifies `Stripe-Signature` header |
| Client isolation | Each client on its own droplet; no shared process, no shared SQLite |
| SSH access to droplets | Control plane's SSH key only; no password auth |

---

## Open Questions / Next Steps

1. **Onboarding UI** — The web form at `website/` needs Stripe Payment Element integration and OAuth initiation buttons (HubSpot, Google). Tracked in separate task.

2. **Droplet sizing** — `s-1vcpu-1gb` ($6/mo) is the starting point. Clients with high message volume may need `s-1vcpu-2gb`. Consider monitoring CPU/memory via DO metrics.

3. **Agent update strategy** — When core code changes, how do we roll out to existing droplets? Options: git pull + restart via control plane SSH, or build a Docker image and `docker pull`. Recommend git-pull approach initially for simplicity.

4. **Multi-region** — Control plane is ams3. Consider letting clients choose their region at onboarding for latency.

5. **Google Sheets skill** — `skills/google_sheets_export/` is referenced in this architecture but not yet implemented. Tracked in [ICP-10](/ICP/issues/ICP-10) area.

6. **Trial-to-paid conversion** — Need a flow to collect payment method after trial. Could be Stripe Checkout link sent via channel.
