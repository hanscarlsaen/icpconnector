"""
Lead Generation Skill Handler

Entry point called by the ClaudeClaw skill registry.
Reads SKILL_INPUT from env, dispatches search or test action,
returns JSON result to stdout.
"""

import os
import sys
import json

# Add skill directory to path so co-located modules can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lead_config import SearchCriteria
from lead_scraper import fetch_leads, fetch_leads_from_dict, deduplicate_by_company
from lead_sheets import create_leads_sheet, add_leads, add_criteria, get_existing_sheet_url


def run_search(params: dict) -> dict:
    """Run a lead search with the given parameters.

    Pipeline:
      1. Apify lead scanner  — discovers companies + contacts matching ICP criteria
      2. Google Sheets       — exports all leads and writes a Summary tab
    """
    fetch_count = params.get("fetch_count", 25)
    file_name = params.get("file_name", "lead_search")
    existing_sheet_id = params.get("spreadsheet_id")  # optional: append to existing sheet

    criteria = SearchCriteria(
        fetch_count=fetch_count,
        file_name=file_name,
        contact_job_title=params.get("contact_job_title", []),
        contact_location=params.get("contact_location", []),
        contact_not_location=params.get("contact_not_location", []),
        email_status=params.get("email_status", ["validated"]),
        size=params.get("size", []),
        company_industry=params.get("company_industry", []),
        company_keywords=params.get("company_keywords", []),
        min_revenue=params.get("min_revenue"),
        max_revenue=params.get("max_revenue"),
        funding=params.get("funding", []),
        has_phone=params.get("has_phone", False),
    )

    # Step 1: Apify — discover leads matching ICP criteria
    leads = fetch_leads(criteria)

    if params.get("deduplicate", False):
        leads = deduplicate_by_company(leads)

    # Step 2: Google Sheets — export all leads
    if existing_sheet_id:
        sheet_id = existing_sheet_id
        sheet_url = get_existing_sheet_url(sheet_id)
        print(f"Appending to existing sheet: {sheet_url}", flush=True)
    else:
        sheet_id, sheet_url = create_leads_sheet(file_name)

    add_leads(leads, sheet_id)
    add_criteria(criteria, sheet_id)

    return {
        "status": "success",
        "leads_count": len(leads),
        "sheet_url": sheet_url,
        "file_name": file_name,
        "spreadsheet_id": sheet_id,
    }


def run_test() -> dict:
    """Run a minimal test search (5 leads)."""
    return run_search({
        "fetch_count": 5,
        "file_name": "test_run",
        "contact_job_title": ["CEO", "Founder"],
        "contact_location": ["denmark"],
        "email_status": ["validated"],
    })


def main():
    raw_input = os.environ.get("SKILL_INPUT", "{}")
    try:
        params = json.loads(raw_input)
    except json.JSONDecodeError as e:
        print(json.dumps({"status": "error", "error": f"Invalid SKILL_INPUT JSON: {e}"}))
        sys.exit(1)

    action = params.get("action", "search")

    try:
        if action == "test":
            result = run_test()
        elif action == "search":
            result = run_search(params)
        else:
            result = {"status": "error", "error": f"Unknown action: {action}"}
    except Exception as e:
        result = {"status": "error", "error": str(e)}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
