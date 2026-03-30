"""
Shared Lead Model

Canonical Lead dataclass used across lead generation and enrichment skills.
Both skills/lead_generation and skills/apollo_enrichment import from here.
"""

from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class Lead:
    """Structured lead data shared across the pipeline."""

    # Contact info
    name: str = ""
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    email_status: str = ""
    phone: str = ""
    linkedin_url: str = ""

    # Job info
    job_title: str = ""
    seniority: str = ""
    department: str = ""

    # Company info
    company_name: str = ""
    company_domain: str = ""
    company_website: str = ""
    company_linkedin: str = ""
    company_size: str = ""
    company_industry: str = ""
    company_location: str = ""
    company_revenue: str = ""
    company_funding: str = ""

    # Location
    city: str = ""
    state: str = ""
    country: str = ""

    # Enrichment metadata
    enrichment_source: str = ""

    @classmethod
    def from_api_response(cls, data: dict, source: str = "apify") -> "Lead":
        """Create Lead from Apify API response item."""
        return cls(
            name=data.get("name", "") or data.get("full_name", ""),
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            email=data.get("email", "") or data.get("business_email", ""),
            email_status=data.get("email_status", ""),
            phone=data.get("phone", "") or data.get("mobile_number", "") or data.get("mobile_phone", "") or data.get("company_phone", ""),
            linkedin_url=data.get("linkedin_url", "") or data.get("linkedin", ""),
            job_title=data.get("title", "") or data.get("job_title", ""),
            seniority=data.get("seniority", ""),
            department=data.get("department", ""),
            company_name=data.get("company", "") or data.get("company_name", "") or data.get("organization_name", ""),
            company_domain=data.get("company_domain", "") or data.get("domain", ""),
            company_website=data.get("company_website", "") or data.get("website", ""),
            company_linkedin=data.get("company_linkedin_url", "") or data.get("organization_linkedin_url", ""),
            company_size=data.get("company_size", "") or data.get("employee_count", "") or data.get("organization_num_employees_ranges", ""),
            company_industry=data.get("company_industry", "") or data.get("industry", ""),
            company_location=data.get("company_location", "") or data.get("organization_hq_location", ""),
            company_revenue=data.get("company_revenue", "") or data.get("annual_revenue", ""),
            company_funding=data.get("funding", "") or data.get("latest_funding_stage", ""),
            city=data.get("city", ""),
            state=data.get("state", ""),
            country=data.get("country", ""),
            enrichment_source=source,
        )

    def is_enriched(self) -> bool:
        """Return True if this lead has at least email or phone from enrichment."""
        return bool(self.email or self.phone)

    def to_row(self) -> list:
        """Convert to list for Google Sheets row."""
        return [
            self.name,
            self.email,
            self.email_status,
            self.phone,
            self.job_title,
            self.company_name,
            self.company_size,
            self.company_industry,
            self.country,
            self.city,
            self.linkedin_url,
            self.company_website,
            self.company_revenue,
            self.company_funding,
            self.enrichment_source,
        ]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for JSON interchange between skills."""
        return {
            "name": self.name,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "email": self.email,
            "email_status": self.email_status,
            "phone": self.phone,
            "linkedin_url": self.linkedin_url,
            "job_title": self.job_title,
            "seniority": self.seniority,
            "department": self.department,
            "company_name": self.company_name,
            "company_domain": self.company_domain,
            "company_website": self.company_website,
            "company_linkedin": self.company_linkedin,
            "company_size": self.company_size,
            "company_industry": self.company_industry,
            "company_location": self.company_location,
            "company_revenue": self.company_revenue,
            "company_funding": self.company_funding,
            "city": self.city,
            "state": self.state,
            "country": self.country,
            "enrichment_source": self.enrichment_source,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Lead":
        """Deserialize from dictionary (inverse of to_dict)."""
        return cls(
            name=data.get("name", ""),
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            email=data.get("email", ""),
            email_status=data.get("email_status", ""),
            phone=data.get("phone", ""),
            linkedin_url=data.get("linkedin_url", ""),
            job_title=data.get("job_title", ""),
            seniority=data.get("seniority", ""),
            department=data.get("department", ""),
            company_name=data.get("company_name", ""),
            company_domain=data.get("company_domain", ""),
            company_website=data.get("company_website", ""),
            company_linkedin=data.get("company_linkedin", ""),
            company_size=data.get("company_size", ""),
            company_industry=data.get("company_industry", ""),
            company_location=data.get("company_location", ""),
            company_revenue=data.get("company_revenue", ""),
            company_funding=data.get("company_funding", ""),
            city=data.get("city", ""),
            state=data.get("state", ""),
            country=data.get("country", ""),
            enrichment_source=data.get("enrichment_source", ""),
        )


# Headers for Google Sheets (must match Lead.to_row() order)
LEAD_SHEET_HEADERS = [
    "Name",
    "Email",
    "Email Status",
    "Phone",
    "Job Title",
    "Company",
    "Company Size",
    "Industry",
    "Country",
    "City",
    "LinkedIn",
    "Website",
    "Revenue",
    "Funding",
    "Enrichment Source",
]
