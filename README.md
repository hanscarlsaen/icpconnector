# ICPConnector

AI-powered lead generation for SDR and sales teams. Define your Ideal Customer Profile, and our agents find, enrich, and deliver leads wherever you need them.

## How It Works

1. **Define your ICP** — industry, headcount, geography, tech stack, funding stage
2. **Agent finds leads** — Apify scraper discovers matching companies
3. **Leads get enriched** — Apollo adds contact emails, phones, titles, LinkedIn
4. **Delivered to you** — Google Sheets, HubSpot, Pipedrive, or via chat (Telegram/WhatsApp/Slack)

## Project Structure

```
icpconnector/
├── skills/      — Agent skills (Python): lead scraping, enrichment, CRM export
├── src/         — Backend / agent runtime
├── website/     — Homepage and landing pages
├── clients/     — Per-client configuration
└── docs/        — Documentation
```

## Skills

| Skill | Status | Description |
|-------|--------|-------------|
| Lead Generation (Apify) | Built | B2B lead scraping by ICP criteria |
| Apollo Enrichment | In Progress | Contact data enrichment |
| Google Sheets Export | Partial | Lead delivery to Sheets |
| HubSpot Export | Planned | CRM delivery to HubSpot |
| Pipedrive Export | Planned | CRM delivery to Pipedrive |

## Integrations

- **Data Sources:** Apify, Apollo.io
- **CRM Delivery:** Google Sheets, HubSpot, Pipedrive
- **Chat Delivery:** Telegram, WhatsApp, Slack (via ClaudeClaw)

## Development

This project is orchestrated via [Paperclip](https://github.com/paperclipai/paperclip) with AI agents handling development tasks.
