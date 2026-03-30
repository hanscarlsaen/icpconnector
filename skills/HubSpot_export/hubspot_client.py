"""
HubSpot CRM Client

Uses HubSpot API v3 to create or update contacts and companies from enriched lead data.
Config via HUBSPOT_API_KEY environment variable.
"""

import os
import requests
from typing import Optional

HUBSPOT_BASE_URL = "https://api.hubapi.com"
HUBSPOT_API_KEY = os.environ.get("HUBSPOT_API_KEY")


def _headers() -> dict:
    if not HUBSPOT_API_KEY:
        raise RuntimeError("HUBSPOT_API_KEY environment variable is not set")
    return {
        "Authorization": f"Bearer {HUBSPOT_API_KEY}",
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# Contact operations
# ---------------------------------------------------------------------------

def find_contact_by_email(email: str) -> Optional[str]:
    """Return the HubSpot contact id for a given email, or None if not found."""
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search"
    payload = {
        "filterGroups": [{
            "filters": [{
                "propertyName": "email",
                "operator": "EQ",
                "value": email,
            }]
        }],
        "properties": ["email"],
        "limit": 1,
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("HubSpot rate limit exceeded")
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return results[0]["id"] if results else None


def create_contact(lead: dict, owner_id: Optional[str] = None) -> str:
    """Create a new HubSpot contact and return its id."""
    props = _lead_to_contact_props(lead, owner_id)
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/contacts"
    resp = requests.post(url, headers=_headers(), json={"properties": props}, timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("HubSpot rate limit exceeded")
    resp.raise_for_status()
    return resp.json()["id"]


def update_contact(contact_id: str, lead: dict, owner_id: Optional[str] = None) -> None:
    """Update an existing HubSpot contact with fresh lead data."""
    props = _lead_to_contact_props(lead, owner_id)
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/contacts/{contact_id}"
    resp = requests.patch(url, headers=_headers(), json={"properties": props}, timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("HubSpot rate limit exceeded")
    resp.raise_for_status()


def _lead_to_contact_props(lead: dict, owner_id: Optional[str] = None) -> dict:
    props = {
        "email": lead.get("email", ""),
        "firstname": lead.get("first_name", "") or _split_first(lead.get("name", "")),
        "lastname": lead.get("last_name", "") or _split_last(lead.get("name", "")),
        "phone": lead.get("phone", ""),
        "jobtitle": lead.get("job_title", ""),
        "hs_linkedin_url": lead.get("linkedin_url", ""),
        "company": lead.get("company_name", ""),
        "website": lead.get("company_website", "") or lead.get("company_domain", ""),
        "lead_gen_source": lead.get("enrichment_source", ""),
    }
    if owner_id:
        props["hubspot_owner_id"] = owner_id
    # Remove empty strings so we don't blank out existing properties
    return {k: v for k, v in props.items() if v}


# ---------------------------------------------------------------------------
# Company operations
# ---------------------------------------------------------------------------

def find_company_by_domain(domain: str) -> Optional[str]:
    """Return the HubSpot company id for a given domain, or None if not found."""
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/companies/search"
    payload = {
        "filterGroups": [{
            "filters": [{
                "propertyName": "domain",
                "operator": "EQ",
                "value": domain,
            }]
        }],
        "properties": ["domain"],
        "limit": 1,
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("HubSpot rate limit exceeded")
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return results[0]["id"] if results else None


def create_company(lead: dict) -> str:
    """Create a new HubSpot company and return its id."""
    props = _lead_to_company_props(lead)
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/companies"
    resp = requests.post(url, headers=_headers(), json={"properties": props}, timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("HubSpot rate limit exceeded")
    resp.raise_for_status()
    return resp.json()["id"]


def associate_contact_with_company(contact_id: str, company_id: str) -> None:
    """Create a contact→company association in HubSpot."""
    url = (
        f"{HUBSPOT_BASE_URL}/crm/v3/objects/contacts/{contact_id}"
        f"/associations/companies/{company_id}/contact_to_company"
    )
    resp = requests.put(url, headers=_headers(), timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("HubSpot rate limit exceeded")
    # 200 or 204 both indicate success; 404 can happen if IDs are stale
    if not resp.ok and resp.status_code != 404:
        resp.raise_for_status()


def _lead_to_company_props(lead: dict) -> dict:
    props = {
        "name": lead.get("company_name", ""),
        "domain": lead.get("company_domain", ""),
        "website": lead.get("company_website", ""),
        "industry": lead.get("company_industry", ""),
        "city": lead.get("company_location", ""),
        "numberofemployees": _parse_employee_count(lead.get("company_size", "")),
    }
    return {k: v for k, v in props.items() if v}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _split_first(full_name: str) -> str:
    parts = full_name.strip().split(None, 1)
    return parts[0] if parts else ""


def _split_last(full_name: str) -> str:
    parts = full_name.strip().split(None, 1)
    return parts[1] if len(parts) > 1 else ""


def _parse_employee_count(size_str: str) -> str:
    """Extract a rough midpoint from a range string like '11-20' or return as-is."""
    if not size_str:
        return ""
    if "-" in size_str:
        parts = size_str.split("-")
        try:
            return str((int(parts[0]) + int(parts[1])) // 2)
        except ValueError:
            return ""
    return size_str.replace("+", "").strip()
