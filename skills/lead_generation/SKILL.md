---
name: lead_generation
description: Search for B2B leads via Apify and export results to Google Sheets. Supports filtering by job title, location, industry, company size, revenue, and funding stage.
allowed-tools: Bash($PROJECT_ROOT/scripts/run-skill.sh lead_generation *)
---

# Lead Generation Skill

## Purpose

B2B lead discovery pipeline: **Apify → Google Sheets**

1. **Apify** — discovers companies and contacts matching ICP criteria
2. **Google Sheets** — exports all leads with a Summary tab (counts, enrichment rate)

For Apollo contact enrichment, use the separate `apollo_enrichment` skill after this one.

## How to Invoke

Always use the wrapper script:

```bash
$PROJECT_ROOT/scripts/run-skill.sh lead_generation '<json_input>'
```

## Input Format

JSON object with the following fields:

### ICP / Search Criteria

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `"search"` or `"test"` | Yes | `search` runs full query, `test` fetches 5 sample leads |
| `fetch_count` | integer | No (default 25) | Number of leads to fetch from Apify (max 100 on free plan) |
| `file_name` | string | No | Label for this run (used in Google Sheet name) |
| `contact_job_title` | string[] | No | Target job titles, e.g. `["CEO", "CTO", "Founder"]` |
| `contact_location` | string[] | No | Target locations (lowercase), e.g. `["denmark", "sweden"]` |
| `contact_not_location` | string[] | No | Locations to exclude |
| `email_status` | string[] | No (default `["validated"]`) | Email validation filter |
| `size` | string[] | No | Company size ranges, e.g. `["1-10", "11-50"]` |
| `company_industry` | string[] | No | Industries (lowercase), e.g. `["saas", "fintech"]` |
| `company_keywords` | string[] | No | Keywords in company description |
| `has_phone` | boolean | No | Only return leads with phone numbers |
| `min_revenue` | string | No | Minimum revenue filter |
| `max_revenue` | string | No | Maximum revenue filter |
| `funding` | string[] | No | Funding stage filter |
| `deduplicate` | boolean | No | One lead per company (dedup before export) |

### Sheet Options

| Field | Type | Description |
|-------|------|-------------|
| `spreadsheet_id` | string | If set, appends to an existing sheet instead of creating a new one |

## Example

User says: "Find 10 CEO leads in Denmark in SaaS companies with 11-50 employees"

Invoke:
```bash
$PROJECT_ROOT/scripts/run-skill.sh lead_generation '{"action":"search","fetch_count":10,"file_name":"dk_saas_ceos","contact_job_title":["CEO"],"contact_location":["denmark"],"company_industry":["saas"],"size":["11-50"]}'
```

## Output

```json
{
  "status": "success",
  "leads_count": 10,
  "sheet_url": "https://docs.google.com/spreadsheets/d/...",
  "file_name": "dk_saas_ceos",
  "spreadsheet_id": "..."
}
```

On error:
```json
{
  "status": "error",
  "error": "Description of what went wrong"
}
```

## Workflow

1. Parse the user's natural language request into search criteria
2. **Present the criteria to the user for confirmation before running** — always confirm
3. After confirmation, invoke `run-skill.sh` with the JSON input
4. Return the Google Sheets link and a summary:
   - Total leads
   - Enrichment rate (% with email or phone)
   - Sheet URL

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APIFY_API_TOKEN` | Yes | Apify API token for the leads-finder actor |
| `GOOGLE_CREDENTIALS_PATH` | Yes | Path to Google OAuth credentials JSON |
| `GOOGLE_TOKEN_PATH` | Yes | Path to Google OAuth token JSON |
| `LEADS_DRIVE_FOLDER_ID` | No | Google Drive folder ID to save sheets into |

## Important

- ALWAYS confirm criteria with the user before running the search
- ALWAYS use `$PROJECT_ROOT/scripts/run-skill.sh` to invoke — never call handler.py directly
- If the user says "test", use `{"action":"test"}` for a quick 5-lead sample
- For Apollo enrichment of results, use the `apollo_enrichment` skill separately
