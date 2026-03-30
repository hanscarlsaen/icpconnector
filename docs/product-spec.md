# ICPConnector — Product Specification

## What It Is

ICPConnector is a lead generation product for SDR and sales teams. Clients chat with an AI agent in their existing communication tool (Telegram, Slack, or WhatsApp), tell it their Ideal Customer Profile, and get verified leads delivered to their CRM or spreadsheet.

**No login. No app. No dashboard.** The product is invisible — it lives inside the client's existing tools.

## How It Works (Client Perspective)

1. Client goes to icpconnector.com
2. Clicks "Get Started"
3. Adds payment method (pay-per-lead, billed monthly)
4. Picks their chat channel (Telegram / Slack / WhatsApp) and connects it
5. Picks their lead destination (Google Sheets / HubSpot / Pipedrive) and connects it
6. Done. Agent spawns automatically.
7. Client opens their chosen channel, chats with the agent
8. Tells the agent their ICP ("B2B SaaS in the US, 50-200 employees")
9. Agent finds and delivers leads
10. Client can change ICP anytime, ask for more leads, etc.

## Pricing

- Pay per lead delivered
- Billed monthly based on usage
- Payment via Stripe (card, Google Pay, Apple Pay)

## Architecture Principles

- **No backend tech exposed to clients.** Never mention Apify, Apollo, or any tool we use internally. Clients see "AI-powered search" and "verified contact data."
- **Each client gets their own agent** on their own DigitalOcean droplet. Full isolation.
- **Skills are hot-swappable.** Adding a new integration (e.g., Salesforce export) should not require restarting existing agents.
- **Channels are abstracted.** Telegram/Slack/WhatsApp are interchangeable adapters. Adding a new channel doesn't touch agent core.
- **Everything deploys to DigitalOcean.**

## Deployment

- **Website:** Static Next.js site (Vercel or DO App Platform)
- **Client agents:** Each on their own DigitalOcean droplet
- **Database:** Central DB for client records, usage tracking, billing
- **Stripe:** Webhooks for payment events

## Tech Stack

- **Agent runtime:** ClaudeClaw (TypeScript, Claude Code SDK)
- **Skills:** Python subprocess-based (lead scraping, enrichment, CRM export)
- **Website:** Next.js + Tailwind CSS
- **Database:** SQLite per agent + central Postgres for platform data
- **Billing:** Stripe (usage-based metered billing)
- **Deployment:** DigitalOcean droplets
