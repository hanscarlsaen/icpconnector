"""
Pipedrive CRM Client

Uses Pipedrive API v1 to create persons and organizations from enriched lead data.
Config via PIPEDRIVE_API_TOKEN environment variable.
"""

import os
import requests
from typing import Optional

PIPEDRIVE_API_TOKEN = os.environ.get("PIPEDRIVE_API_TOKEN")
PIPEDRIVE_BASE_URL = "https://api.pipedrive.com/v1"


def _params() -> dict:
    if not PIPEDRIVE_API_TOKEN:
        raise RuntimeError("PIPEDRIVE_API_TOKEN environment variable is not set")
    return {"api_token": PIPEDRIVE_API_TOKEN}


# ---------------------------------------------------------------------------
# Organization operations
# ---------------------------------------------------------------------------

def find_organization_by_name(name: str) -> Optional[int]:
    """Search for an organization by name and return its id, or None if not found."""
    if not name:
        return None
    url = f"{PIPEDRIVE_BASE_URL}/organizations/search"
    resp = requests.get(
        url,
        params={**_params(), "term": name, "exact_match": True, "limit": 1},
        timeout=20,
    )
    if resp.status_code == 429:
        raise RuntimeError("Pipedrive rate limit exceeded")
    resp.raise_for_status()
    items = resp.json().get("data", {}).get("items", [])
    return items[0]["item"]["id"] if items else None


def create_organization(lead: dict) -> int:
    """Create a new organization and return its id."""
    props = _lead_to_org_fields(lead)
    url = f"{PIPEDRIVE_BASE_URL}/organizations"
    resp = requests.post(url, params=_params(), json=props, timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("Pipedrive rate limit exceeded")
    resp.raise_for_status()
    return resp.json()["data"]["id"]


def _lead_to_org_fields(lead: dict) -> dict:
    fields = {
        "name": lead.get("company_name", ""),
    }
    # Optional fields (omit blanks to avoid overwriting existing data)
    if lead.get("company_website") or lead.get("company_domain"):
        fields["web_url"] = lead.get("company_website") or f"https://{lead.get('company_domain')}"
    if lead.get("company_location"):
        fields["address"] = lead.get("company_location")
    return {k: v for k, v in fields.items() if v}


# ---------------------------------------------------------------------------
# Person operations
# ---------------------------------------------------------------------------

def find_person_by_email(email: str) -> Optional[int]:
    """Search for a person by email and return their id, or None if not found."""
    if not email:
        return None
    url = f"{PIPEDRIVE_BASE_URL}/persons/search"
    resp = requests.get(
        url,
        params={**_params(), "term": email, "fields": "email", "exact_match": True, "limit": 1},
        timeout=20,
    )
    if resp.status_code == 429:
        raise RuntimeError("Pipedrive rate limit exceeded")
    resp.raise_for_status()
    items = resp.json().get("data", {}).get("items", [])
    return items[0]["item"]["id"] if items else None


def create_person(lead: dict, org_id: Optional[int] = None) -> int:
    """Create a new Pipedrive person and return their id."""
    fields = _lead_to_person_fields(lead, org_id)
    url = f"{PIPEDRIVE_BASE_URL}/persons"
    resp = requests.post(url, params=_params(), json=fields, timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("Pipedrive rate limit exceeded")
    resp.raise_for_status()
    return resp.json()["data"]["id"]


def update_person(person_id: int, lead: dict, org_id: Optional[int] = None) -> None:
    """Update an existing Pipedrive person with fresh lead data."""
    fields = _lead_to_person_fields(lead, org_id)
    url = f"{PIPEDRIVE_BASE_URL}/persons/{person_id}"
    resp = requests.put(url, params=_params(), json=fields, timeout=20)
    if resp.status_code == 429:
        raise RuntimeError("Pipedrive rate limit exceeded")
    resp.raise_for_status()


def _lead_to_person_fields(lead: dict, org_id: Optional[int] = None) -> dict:
    name = lead.get("name") or (
        f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
    ) or lead.get("email", "")

    fields: dict = {"name": name}

    if lead.get("email"):
        fields["email"] = [{"value": lead["email"], "primary": True}]
    if lead.get("phone"):
        fields["phone"] = [{"value": lead["phone"], "primary": True}]
    if lead.get("job_title"):
        fields["job_title"] = lead["job_title"]
    if org_id:
        fields["org_id"] = org_id

    return fields
