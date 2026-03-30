"""
HubSpot Export Skill Handler

Entry point called by the ClaudeClaw skill registry.
Reads SKILL_INPUT from env, dispatches export or test action,
returns JSON result to stdout.
"""

import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hubspot_client import (
    find_contact_by_email,
    create_contact,
    update_contact,
    find_company_by_domain,
    create_company,
    associate_contact_with_company,
    HUBSPOT_API_KEY,
)

# Sample data used for the test action
_TEST_LEADS = [
    {
        "name": "Jane Test",
        "first_name": "Jane",
        "last_name": "Test",
        "email": "jane.test@example-icp-test.com",
        "phone": "+1-555-0001",
        "job_title": "CEO",
        "company_name": "Test Corp",
        "company_domain": "example-icp-test.com",
        "company_website": "https://example-icp-test.com",
        "company_industry": "technology",
        "enrichment_source": "test",
    }
]


def run_export(leads: list, owner_id: str | None = None) -> dict:
    """Push a list of lead dicts to HubSpot and return a summary."""
    if not HUBSPOT_API_KEY:
        return {"status": "error", "error": "HUBSPOT_API_KEY is not set"}

    created = updated = skipped = failed = 0
    errors: list[str] = []

    # Deduplicate input by email — keep last occurrence
    seen: dict[str, dict] = {}
    for lead in leads:
        key = (lead.get("email") or "").lower().strip()
        if key:
            seen[key] = lead
        else:
            seen[id(lead)] = lead  # no email — include but can't dedup

    for lead in seen.values():
        email = lead.get("email", "").strip()

        try:
            # Upsert contact
            existing_contact_id = find_contact_by_email(email) if email else None
            if existing_contact_id:
                update_contact(existing_contact_id, lead, owner_id)
                contact_id = existing_contact_id
                updated += 1
            elif email:
                contact_id = create_contact(lead, owner_id)
                created += 1
            else:
                skipped += 1
                continue  # no email — skip CRM write

            # Upsert company and associate
            domain = lead.get("company_domain", "").strip()
            if domain:
                company_id = find_company_by_domain(domain)
                if not company_id and lead.get("company_name"):
                    company_id = create_company(lead)
                if company_id:
                    associate_contact_with_company(contact_id, company_id)

        except RuntimeError as e:
            error_str = str(e)
            if "rate limit" in error_str.lower():
                errors.append(f"Rate limit hit after {created + updated} contacts — stopping early")
                break
            errors.append(f"{email or 'unknown'}: {e}")
            failed += 1

    result = {
        "status": "success" if not errors or (created + updated) > 0 else "error",
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
        "total_input": len(leads),
    }
    if errors:
        result["errors"] = errors[:10]  # cap to avoid huge payloads
    return result


def run_test() -> dict:
    """Dry-run with a single synthetic contact."""
    return run_export(_TEST_LEADS)


def main():
    raw_input = os.environ.get("SKILL_INPUT", "{}")
    try:
        params = json.loads(raw_input)
    except json.JSONDecodeError as e:
        print(json.dumps({"status": "error", "error": f"Invalid SKILL_INPUT JSON: {e}"}))
        sys.exit(1)

    action = params.get("action", "export")

    try:
        if action == "test":
            result = run_test()
        elif action == "export":
            leads = params.get("leads", [])
            owner_id = params.get("owner_id")
            result = run_export(leads, owner_id)
        else:
            result = {"status": "error", "error": f"Unknown action: {action}"}
    except Exception as e:
        result = {"status": "error", "error": str(e)}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
