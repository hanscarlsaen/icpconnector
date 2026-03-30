# HubSpot Export Skill

Pushes enriched leads to HubSpot CRM using the HubSpot API v3.
Creates or updates **contacts** and **companies**, then creates a contact→company association.

## Actions

| Action   | Description                                 |
|----------|---------------------------------------------|
| `export` | Push a list of lead objects to HubSpot      |
| `test`   | Dry-run with a single synthetic contact     |

## Input Parameters

```json
{
  "action": "export",
  "leads": [
    {
      "name": "Jane Smith",
      "first_name": "Jane",
      "last_name": "Smith",
      "email": "jane@acmecorp.com",
      "phone": "+1-555-1234",
      "job_title": "VP Sales",
      "linkedin_url": "https://linkedin.com/in/janesmith",
      "company_name": "Acme Corp",
      "company_domain": "acmecorp.com",
      "company_website": "https://acmecorp.com",
      "company_size": "51-100",
      "company_industry": "technology",
      "company_location": "San Francisco, CA",
      "enrichment_source": "apollo"
    }
  ],
  "owner_id": "12345678"
}
```

## Output

```json
{
  "status": "success",
  "created": 8,
  "updated": 2,
  "skipped": 0,
  "failed": 0,
  "total_input": 10
}
```

## Environment Variables

| Variable          | Required | Description                                  |
|-------------------|----------|----------------------------------------------|
| `HUBSPOT_API_KEY` | Yes      | HubSpot Private App access token (Bearer)    |

## Deduplication

Leads are deduplicated by email **before** any API calls.
For each lead, the skill:
1. Searches HubSpot for an existing contact with the same email
2. Updates the contact if found; creates a new one otherwise
3. Searches for a company by domain; creates one if missing
4. Associates the contact with the company

Contacts without an email are skipped (counted as `skipped`).

## Rate Limits

On a 429 response, the skill stops processing early and returns whatever was
created/updated up to that point. The `errors` field will contain a rate-limit message.
