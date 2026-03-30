# Pipedrive Export Skill

Pushes enriched leads to Pipedrive CRM using the Pipedrive API v1.
Creates **persons** and **organizations**, then links each person to their organization.

## Actions

| Action   | Description                                 |
|----------|---------------------------------------------|
| `export` | Push a list of lead objects to Pipedrive    |
| `test`   | Dry-run with a single synthetic person      |

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
  ]
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

| Variable               | Required | Description                      |
|------------------------|----------|----------------------------------|
| `PIPEDRIVE_API_TOKEN`  | Yes      | Pipedrive personal API token     |

## Deduplication

Leads are deduplicated by email **before** any API calls.
For each lead, the skill:
1. Searches Pipedrive for an existing organization matching the company name
2. Creates the organization if not found
3. Searches for an existing person with the same email
4. Updates the person if found (linking to org); creates a new one otherwise

Leads without both an email and a name are skipped.

## Rate Limits

On a 429 response, the skill stops processing early and returns whatever was
created/updated up to that point. The `errors` field will contain a rate-limit message.
