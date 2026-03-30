"""
Apollo Enrichment Module

Uses Apollo.io People Search API to enrich leads with additional
decision-maker contacts at companies discovered by Apify.

Pipeline: lead_generation (Apify) -> apollo_enrichment (Apollo) -> export skill
Each skill is independent and can be used alone or in sequence.

If APOLLO_API_KEY is not set, returns the original leads unchanged with a warning.
"""

import os
import sys
from pathlib import Path
from typing import List

import requests

# Add skills root to path so shared modules can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.lead_model import Lead  # noqa: E402

APOLLO_API_KEY = os.environ.get("APOLLO_API_KEY")

APOLLO_PEOPLE_SEARCH_URL = "https://api.apollo.io/v1/mixed_people/search"

# Decision-maker seniority levels to target
APOLLO_SENIORITY_LEVELS = [
    "owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager"
]

# Only return contacts with verified or likely-to-engage emails
APOLLO_EMAIL_STATUSES = ["verified", "likely_to_engage"]


def enrich_leads_with_apollo(leads: List[Lead], per_domain: int = 5) -> List[Lead]:
    """
    Enrich a lead list by adding Apollo People Search contacts for each company domain.

    For each unique company domain in the leads list, calls Apollo People Search
    to get decision-maker contacts. Returns the original leads plus any new contacts
    found by Apollo (deduped by email to avoid duplicates).

    Returns the input leads unchanged if APOLLO_API_KEY is not set.

    Args:
        leads: List of Lead objects from Apify
        per_domain: Max contacts to fetch per company domain (default 5)

    Returns:
        Original leads + Apollo-discovered contacts (merged, deduped by email)
    """
    if not APOLLO_API_KEY:
        print("APOLLO_API_KEY not set — skipping Apollo enrichment step", flush=True)
        return leads

    # Collect unique company domains from input leads
    domains = list({lead.company_domain for lead in leads if lead.company_domain})
    if not domains:
        print("No company domains in input leads — skipping Apollo enrichment", flush=True)
        return leads

    print(
        f"Apollo enrichment: querying {len(domains)} company domains "
        f"(up to {per_domain} decision-makers each)...",
        flush=True,
    )

    # Track existing emails to deduplicate new contacts
    existing_emails = {lead.email.lower() for lead in leads if lead.email}

    new_contacts: List[Lead] = []
    failed = 0

    for domain in domains:
        try:
            contacts = _search_people_at_domain(domain, per_domain)
            for contact in contacts:
                email_key = contact.email.lower() if contact.email else None
                if email_key and email_key in existing_emails:
                    continue  # skip duplicate
                if email_key:
                    existing_emails.add(email_key)
                new_contacts.append(contact)
        except RuntimeError as e:
            error_str = str(e)
            if "rate limit" in error_str.lower():
                print(f"Apollo rate limit hit — stopping enrichment early ({len(new_contacts)} contacts so far)", flush=True)
                break
            print(f"Warning: Apollo enrichment failed for {domain}: {e}", flush=True)
            failed += 1

    print(
        f"Apollo enrichment complete: {len(new_contacts)} new contacts added"
        + (f", {failed} domains failed" if failed else ""),
        flush=True,
    )
    return leads + new_contacts


def _search_people_at_domain(domain: str, per_page: int = 5) -> List[Lead]:
    """
    Call Apollo People Search for decision-makers at a given company domain.

    Returns a list of Lead objects tagged with enrichment_source="apollo".
    """
    payload = {
        "api_key": APOLLO_API_KEY,
        "q_organization_domains_fuzzy": [domain],
        "person_seniorities": APOLLO_SENIORITY_LEVELS,
        "contact_email_status": APOLLO_EMAIL_STATUSES,
        "per_page": per_page,
    }

    response = requests.post(
        APOLLO_PEOPLE_SEARCH_URL,
        headers={"Content-Type": "application/json", "Cache-Control": "no-cache"},
        json=payload,
        timeout=30,
    )

    if response.status_code == 429:
        raise RuntimeError("Apollo rate limit exceeded")
    if not response.ok:
        raise RuntimeError(
            f"Apollo API error {response.status_code}: {response.text[:200]}"
        )

    data = response.json()
    people = data.get("people", [])

    contacts: List[Lead] = []
    for person in people:
        org = person.get("organization") or {}

        # Extract first phone number if available
        phone_numbers = person.get("phone_numbers") or []
        phone = phone_numbers[0].get("sanitized_number", "") if phone_numbers else ""

        # Extract first department if available
        departments = person.get("departments") or []
        department = departments[0] if departments else ""

        first = person.get("first_name") or ""
        last = person.get("last_name") or ""
        full_name = f"{first} {last}".strip()

        contact = Lead(
            name=full_name,
            first_name=first,
            last_name=last,
            email=person.get("email") or "",
            email_status=person.get("email_status") or "",
            phone=phone,
            linkedin_url=person.get("linkedin_url") or "",
            job_title=person.get("title") or "",
            seniority=person.get("seniority") or "",
            department=department,
            company_name=org.get("name") or "",
            company_domain=domain,
            company_website=org.get("website_url") or "",
            company_linkedin=org.get("linkedin_url") or "",
            company_size=str(org.get("num_employees", "")) if org.get("num_employees") else "",
            company_industry=org.get("industry") or "",
            company_location=org.get("city") or "",
            city=person.get("city") or "",
            state=person.get("state") or "",
            country=person.get("country") or "",
            enrichment_source="apollo",
        )
        contacts.append(contact)

    return contacts
