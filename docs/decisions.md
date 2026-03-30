# ICPConnector -- Decision Log

> All architectural, product, and operational decisions made during the ICPConnector build. Organized by domain.

---

## 1. Orchestration Layer

**Decision:** Use Paperclip as the AI company orchestration platform.

- Runs locally at `localhost:3100` in `local_trusted` mode (no auth).
- Company entity: ICPConnector (ID: `725c9458-4317-4524-a4c8-e3bd058042d5`).
- Full Paperclip documentation saved in `/Users/jacobslotpetersen/Noworkr Workspace (DOE)/Paperclip/`.

---

## 2. Product Definition

**Decision:** ICPConnector is a lead generation product for SDR/sales teams.

- **No login, no app, no dashboard.** The product lives entirely inside the client's existing communication tools (Telegram, Slack, or WhatsApp).
- Clients onboard via a web form, then everything is chat-based with their personal AI agent.
- Pay-per-lead pricing, billed monthly via Stripe.
- Each client gets their own dedicated agent running on their own DigitalOcean droplet.
- **Never expose backend technology names** (Apollo, Apify, etc.) to clients. The product is presented as "ICPConnector" without revealing the stack.

---

## 3. Onboarding Flow

**Decision:** Self-serve, fully automated, zero human touch.

The onboarding sequence:

1. **Payment** -- Stripe checkout.
2. **Pick chat channel** -- Telegram, Slack, or WhatsApp.
3. **Pick lead destination** -- Google Sheets, HubSpot, or Pipedrive.
4. **Agent spawns** -- dedicated bot is assigned and deployed.
5. **Client chats with agent** -- ICP is defined in conversation, not during onboarding.

Additional details:
- Client chooses a custom bot name during onboarding (bot is renamed via Telegram `setMyName` API).
- ICP definition happens conversationally after the agent is live, not through form fields.

---

## 4. Repository Structure

**Decision:** Monorepo. Everything in one repo.

- GitHub: `github.com/hanscarlsaen/icpconnector`
- Local: `/Users/jacobslotpetersen/icpconnector`

Directory layout:

```
icpconnector/
  skills/          # Hot-swappable Python skill modules
  src/             # Core platform code
  website/         # Next.js homepage + onboarding
  clients/         # Per-client configurations
  agents/          # Agent definitions
  docs/            # Architecture docs, specs, this file
  control-plane/   # Provisioning, billing, admin
```

Code was merged from the original `lead_generation` repo (`github.com/markusOlsen1/lead_generation`) into this monorepo.

---

## 5. Skills Architecture

**Decision:** Skills are hot-swappable, modular Python subprocesses.

- Each skill is a standalone Python module in `skills/`.
- Skills can be added, updated, or removed without restarting the agent.
- The `lead_generation` skill was split into two separate skills:
  - `lead_generation` -- Apify scraper (finds companies matching ICP).
  - `apollo_enrichment` -- Apollo.io enrichment (finds contact details for leads).
- A shared `Lead` data model lives in `skills/shared/` for consistency across skills.

---

## 6. Channel Abstraction

**Decision:** Telegram, Slack, and WhatsApp are interchangeable adapters.

- Channel logic is abstracted behind a common interface.
- Adding a new channel means writing a new adapter, not changing core logic.
- Clients pick their channel during onboarding; the same agent code runs regardless.

---

## 7. Telegram Bot Pool

**Decision:** Pre-create a pool of Telegram bots. Each client gets their own uniquely named bot.

- Pool starts with 20 bots created manually via BotFather.
- On client onboarding, a bot is assigned from the pool and renamed via `setMyName`.
- When available bots drop below 10, a Slack notification is sent to the admin (`ADMIN_SLACK_WEBHOOK_URL`).
- Admin creates more bots manually and adds tokens via an admin API endpoint.
- **No shared bot** -- every client has their own bot identity.

---

## 8. Anthropic API Keys

**Decision:** Each client gets their own Anthropic API key for isolation.

- Keys are auto-created via the Anthropic Admin API during onboarding.
- Naming format: `icpconnector-client-{clientId}`.
- Per-client token usage is tracked for cost attribution.
- AI costs are factored into billing (baked into per-lead price or as a separate line item).
- Key is revoked when a client cancels.

---

## 9. Deployment and Infrastructure

**Decision:** Everything on DigitalOcean.

- One control plane droplet runs the admin/billing/provisioning services.
- Each client gets their own droplet, auto-provisioned during onboarding.
- Agent provisioning: control plane creates a droplet, deploys the agent code, injects client-specific `.env`, starts the agent.

Other infrastructure:
- Paperclip: `localhost:3100`
- Website dev server: `localhost:3000`
- GitHub: `hanscarlsaen` account

---

## 10. Billing

**Decision:** Pay-per-lead, monthly invoicing via Stripe.

- Stripe handles payment collection and subscription management.
- Usage is tracked per client (leads delivered, tokens consumed).
- Monthly invoice includes lead costs and optionally AI usage costs.

---

## 11. Org Chart (Paperclip Agents)

**Decision:** Five agents, $150/mo total budget.

| Agent | Role | Model | Budget | Reports To |
|-------|------|-------|--------|------------|
| CEO | Strategic oversight | claude-sonnet-4-6 | $20/mo | -- |
| Founding Engineer | Technical lead, all implementation | claude-opus-4-6 | $50/mo | CEO |
| Frontend Designer | Homepage, onboarding UI | claude-sonnet-4-6 | $30/mo | Founding Engineer |
| Platform Architect | Architecture, scalability | claude-sonnet-4-6 | $30/mo | Founding Engineer |
| Security Engineer | Code review, vulnerability scanning | claude-sonnet-4-6 | $20/mo | Founding Engineer |

All agents:
- Use `claude_local` adapter.
- Have `workDir` set to `/Users/jacobslotpetersen/icpconnector`.
- Have `find-skills` skill and must search for existing skills before building new ones.
- Require board approval before installing new skills.
- Have `dangerouslySkipPermissions: true`.
- Have core Paperclip skills synced (heartbeat, agent creation, plugin creation, memory files).

Security Engineer has a 30-minute heartbeat interval (all others: 60 minutes).

---

## 12. Skill Discovery Order

**Decision:** Agents must follow this order before building anything new:

1. Check Paperclip-synced skills.
2. Check the project `skills/` directory.
3. Run `npx skills find` to search the registry.
4. If nothing found, request board approval to build a new skill.

---

## 13. Cancelled Work

These tasks were auto-generated by the CEO agent and cancelled because they were not requested:

- ICP-5: UI builder
- ICP-6: Scoring engine v1 (rule-based ICP matching)
- ICP-7: Scoring engine v2 (signal-based scoring with intent data)

---

## 14. Security Findings (Open)

Two security issues were identified and remain as open tasks:

- **ICP-18:** API tokens exposed in URL query parameters (Pipedrive + internal API key).
- **ICP-19:** Timing-unsafe API key comparison, open CORS, missing rate limiting.

---

## 15. Key IDs Reference

| Entity | ID |
|--------|----|
| Company | `725c9458-4317-4524-a4c8-e3bd058042d5` |
| CEO Agent | `effdcb64-cf4f-4bb5-a626-9f3e2cb5efb4` |
| Founding Engineer | `d3a60187-66db-4379-b638-7b94cb682b3f` |
| Frontend Designer | `97e613ec-6a77-4d01-a12c-4ce4265abd09` |
| Platform Architect | `1f41911d-60c9-4894-878d-a77edd8f5895` |
| Security Engineer | `4ba6f640-0793-48f6-9eab-4138a99a87d1` |
| Project | `1d84b8df-5a1d-46d3-8cae-95e6b13ff075` |
| Main Goal | `59b49465-a771-48e7-9a21-21f3b1bf81ec` |

---

## 16. Key Repos

| Repo | Location |
|------|----------|
| ICPConnector monorepo | `github.com/hanscarlsaen/icpconnector` (local: `/Users/jacobslotpetersen/icpconnector`) |
| Original ClaudeClaw/lead_generation | `github.com/markusOlsen1/lead_generation` (local: `/Users/jacobslotpetersen/lead_generation`) |
