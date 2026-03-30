"""
Lead Scraper

Fetches leads from Apify Leads Finder API.
Handles API calls, response parsing, and local JSON backup.
"""

import json
import requests
from datetime import datetime
from typing import List

from lead_config import (
    Lead,
    SearchCriteria,
    APIFY_API_TOKEN,
    APIFY_API_URL,
    RAW_RESULTS_DIR,
    validate_criteria,
)


def fetch_leads(criteria: SearchCriteria, save_raw: bool = True) -> List[Lead]:
    """
    Fetch leads from Apify Leads Finder API.

    Returns:
        List of Lead objects
    """
    if not APIFY_API_TOKEN:
        raise ValueError(
            "APIFY_API_TOKEN not found in environment. "
            "Set it in the client config skillEnv."
        )

    warnings = validate_criteria(criteria)
    for warning in warnings:
        print(f"Warning: {warning}", flush=True)

    payload = criteria.to_api_payload()

    print(f"Fetching {criteria.fetch_count} leads from Apify...", flush=True)
    print(f"Run label: {criteria.file_name}", flush=True)

    response = requests.post(
        APIFY_API_URL,
        params={"token": APIFY_API_TOKEN},
        json=payload,
        timeout=300,
    )

    if response.status_code not in [200, 201]:
        error_detail = response.text[:500] if response.text else "No details"
        raise requests.RequestException(
            f"Apify API error {response.status_code}: {error_detail}"
        )

    raw_data = response.json()

    if save_raw:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{criteria.file_name}_{timestamp}.json"
        filepath = RAW_RESULTS_DIR / filename
        with open(filepath, "w") as f:
            json.dump(raw_data, f, indent=2)
        print(f"Raw response saved to: {filepath}", flush=True)

    leads = []
    for item in raw_data:
        try:
            lead = Lead.from_api_response(item)
            leads.append(lead)
        except Exception as e:
            print(f"Warning: Failed to parse lead: {e}", flush=True)

    print(f"Fetched {len(leads)} leads successfully", flush=True)
    return leads


def deduplicate_by_company(leads: List[Lead]) -> List[Lead]:
    """Keep one lead per company (first encountered wins)."""
    seen = {}
    unique = []
    for lead in leads:
        key = lead.company_name.strip().lower()
        if not key:
            unique.append(lead)
            continue
        if key not in seen:
            seen[key] = True
            unique.append(lead)

    removed = len(leads) - len(unique)
    if removed:
        print(f"Deduplication: {len(leads)} -> {len(unique)} leads ({removed} duplicate companies removed)", flush=True)
    return unique


def fetch_leads_from_dict(criteria_dict: dict, save_raw: bool = True) -> List[Lead]:
    """Fetch leads using a raw dictionary."""
    criteria = SearchCriteria(
        fetch_count=criteria_dict.get("fetch_count", 25),
        file_name=criteria_dict.get("file_name", "lead_search"),
        contact_job_title=criteria_dict.get("contact_job_title", []),
        contact_location=criteria_dict.get("contact_location", []),
        contact_not_location=criteria_dict.get("contact_not_location", []),
        email_status=criteria_dict.get("email_status", ["validated"]),
        company_website=criteria_dict.get("company_website", []),
        size=criteria_dict.get("size", []),
        company_industry=criteria_dict.get("company_industry", []),
        company_keywords=criteria_dict.get("company_keywords", []),
        min_revenue=criteria_dict.get("min_revenue"),
        max_revenue=criteria_dict.get("max_revenue"),
        funding=criteria_dict.get("funding", []),
    )
    return fetch_leads(criteria, save_raw)
