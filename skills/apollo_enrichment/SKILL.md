---
name: apollo_enrichment
description: Enrich leads with Apollo.io People Search — adds decision-maker contacts (emails, phones, LinkedIn, titles) per company domain. Accepts leads JSON array, returns enriched leads.
allowed-tools: Bash($PROJECT_ROOT/scripts/run-skill.sh apollo_enrichment *)
---

# Apollo Enrichment Skill

## Purpose

Enrich a list of leads with additional decision-maker contacts from Apollo.io People Search. Designed to work as the second step in the lead pipeline:

```
lead_generation (Apify) → apollo_enrichment (Apollo) → export skill
```

Can also be used standalone with any list of leads that have `company_domain` fields.

## How to Invoke

Always use the wrapper script:

```bash
$PROJECT_ROOT/scripts/run-skill.sh apollo_enrichment '<json_input>'
```

## Input Format

JSON object with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `leads` | object[] | Yes | Array of lead objects. Each should have at minimum `company_domain`. |
| `per_domain` | integer | No (default 5) | Max decision-maker contacts to fetch per company domain |

Lead objects use the shared Lead model format — see `skills/shared/lead_model.py`.

## Example

Enrich leads from a previous lead_generation run:

```bash
$PROJECT_ROOT/scripts/run-skill.sh apollo_enrichment '{"leads": [{"company_domain": "stripe.com", "company_name": "Stripe"}, {"company_domain": "notion.so", "company_name": "Notion"}], "per_domain": 3}'
```

## Output

```json
{
  "status": "success",
  "leads": [ ... ],
  "original_count": 2,
  "apollo_count": 6,
  "total_count": 8
}
```

- `leads` — full array of enriched lead objects (original + Apollo contacts)
- `original_count` — number of input leads
- `apollo_count` — new contacts added by Apollo
- `total_count` — total leads in output

On error:
```json
{
  "status": "error",
  "error": "Description of what went wrong"
}
```

## Pipeline Usage

Typical two-step workflow:

1. Run `lead_generation` to get Apify leads → returns `spreadsheet_id`
2. Take the leads from step 1 and pass them to `apollo_enrichment` for contact enrichment
3. Export enriched leads to the same sheet or a new one

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APOLLO_API_KEY` | Yes | Apollo.io API key for People Search |

## Apollo Search Behavior

- Targets decision-maker seniority: owner, founder, c_suite, partner, vp, head, director, manager
- Only returns contacts with verified or likely-to-engage emails
- Deduplicates by email against input leads
- Stops early if rate-limited (returns partial results)

## Important

- ALWAYS use `$PROJECT_ROOT/scripts/run-skill.sh` to invoke — never call handler.py directly
- If `APOLLO_API_KEY` is not set, returns input leads unchanged with a warning
- Each domain costs 1 Apollo API credit — be mindful of per_domain setting
