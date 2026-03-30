"""
Pipedrive Export Skill Handler

Entry point called by the ClaudeClaw skill registry.
Reads SKILL_INPUT from env, dispatches export or test action,
returns JSON result to stdout.
"""

import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pipedrive_client import (
    find_organization_by_name,
    create_organization,
    find_person_by_email,
    create_person,
    update_person,
    PIPEDRIVE_API_TOKEN,
)

# Sample data used for the test action
_TEST_LEADS = [
    {
        "name": "John Test",
        "first_name": "John",
        "last_name": "Test",
        "email": "john.test@example-icp-test.com",
        "phone": "+1-555-0002",
        "job_title": "CEO",
        "company_name": "Test Corp",
        "company_domain": "example-icp-test.com",
        "company_website": "https://example-icp-test.com",
        "company_industry": "technology",
        "enrichment_source": "test",
    }
]


def run_export(leads: list) -> dict:
    """Push a list of lead dicts to Pipedrive and return a summary."""
    if not PIPEDRIVE_API_TOKEN:
        return {"status": "error", "error": "PIPEDRIVE_API_TOKEN is not set"}

    created = updated = skipped = failed = 0
    errors: list[str] = []

    # Deduplicate input by email — keep last occurrence
    seen: dict[str, dict] = {}
    for lead in leads:
        key = (lead.get("email") or "").lower().strip()
        if key:
            seen[key] = lead
        else:
            seen[id(lead)] = lead  # no email — include, can't dedup

    for lead in seen.values():
        email = lead.get("email", "").strip()

        try:
            # Upsert organization first so we can link the person to it
            org_id = None
            company_name = lead.get("company_name", "").strip()
            if company_name:
                org_id = find_organization_by_name(company_name)
                if org_id is None:
                    org_id = create_organization(lead)

            # Upsert person
            existing_person_id = find_person_by_email(email) if email else None
            if existing_person_id:
                update_person(existing_person_id, lead, org_id)
                updated += 1
            elif email or lead.get("name"):
                create_person(lead, org_id)
                created += 1
            else:
                skipped += 1
                continue

        except RuntimeError as e:
            error_str = str(e)
            if "rate limit" in error_str.lower():
                errors.append(f"Rate limit hit after {created + updated} persons — stopping early")
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
        result["errors"] = errors[:10]
    return result


def run_test() -> dict:
    """Dry-run with a single synthetic person."""
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
            result = run_export(leads)
        else:
            result = {"status": "error", "error": f"Unknown action: {action}"}
    except Exception as e:
        result = {"status": "error", "error": str(e)}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
