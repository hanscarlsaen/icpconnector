"""
Lead Generation Configuration

Centralized configuration for Apify Leads Finder integration.
Paths and API tokens read from environment variables (set via skillEnv in client config).
"""

import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional

# Paths - use project .tmp dir for storage, skill dir as fallback
PROJECT_ROOT = Path(os.environ.get("PROJECT_ROOT", Path(__file__).parent.parent.parent.parent))
TMP_DIR = PROJECT_ROOT / ".tmp"
LEADS_DIR = TMP_DIR / "leads"
RAW_RESULTS_DIR = LEADS_DIR / "raw_results"

# Ensure directories exist
TMP_DIR.mkdir(exist_ok=True)
LEADS_DIR.mkdir(exist_ok=True)
RAW_RESULTS_DIR.mkdir(exist_ok=True)

# API Configuration (from skillEnv)
APIFY_API_TOKEN = os.environ.get("APIFY_API_TOKEN")
APIFY_API_URL = "https://api.apify.com/v2/acts/code_crafter~leads-finder/run-sync-get-dataset-items"

# Apollo.io API Configuration (optional — used for People Search enrichment after Apify)
APOLLO_API_KEY = os.environ.get("APOLLO_API_KEY")

# Google Sheets Configuration (from skillEnv)
CREDENTIALS_FILE = Path(os.environ.get("GOOGLE_CREDENTIALS_PATH", PROJECT_ROOT / "google_auth.json"))
TOKEN_FILE = Path(os.environ.get("GOOGLE_TOKEN_PATH", PROJECT_ROOT / "token.json"))

# Default Google Drive folder for lead sheets (from skillEnv)
LEADS_DRIVE_FOLDER_ID = os.environ.get("LEADS_DRIVE_FOLDER_ID", "1nxR1sowpClw4ghNqdg6pzBDWgqmEJnqV")


@dataclass
class Lead:
    """Structured lead data from Apify response."""
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


@dataclass
class SearchCriteria:
    """Search criteria for Apify Leads Finder API."""
    fetch_count: int = 25
    file_name: str = "lead_search"

    # Contact filters
    contact_job_title: List[str] = field(default_factory=list)
    contact_location: List[str] = field(default_factory=list)
    contact_not_location: List[str] = field(default_factory=list)

    # Email filter
    email_status: List[str] = field(default_factory=lambda: ["validated"])

    # Company filters
    company_website: List[str] = field(default_factory=list)
    size: List[str] = field(default_factory=list)
    company_industry: List[str] = field(default_factory=list)
    company_keywords: List[str] = field(default_factory=list)

    # Revenue filters
    min_revenue: Optional[str] = None
    max_revenue: Optional[str] = None

    # Funding filter
    funding: List[str] = field(default_factory=list)

    # Phone filter
    has_phone: bool = False

    def to_api_payload(self) -> dict:
        """Convert to API request payload, excluding empty fields."""
        payload = {}
        payload["fetch_count"] = self.fetch_count
        payload["file_name"] = self.file_name

        if self.contact_job_title:
            payload["contact_job_title"] = self.contact_job_title
        if self.contact_location:
            payload["contact_location"] = self.contact_location
        if self.contact_not_location:
            payload["contact_not_location"] = self.contact_not_location
        if self.email_status:
            payload["email_status"] = self.email_status
        if self.company_website:
            payload["company_website"] = self.company_website
        if self.size:
            payload["size"] = self.size
        if self.company_industry:
            payload["company_industry"] = self.company_industry
        if self.company_keywords:
            payload["company_keywords"] = self.company_keywords
        if self.funding:
            payload["funding"] = self.funding
        if self.min_revenue:
            payload["min_revenue"] = self.min_revenue
        if self.max_revenue:
            payload["max_revenue"] = self.max_revenue
        if self.has_phone:
            payload["has_phone"] = True

        return payload


AVAILABLE_SIZES = [
    "1-10", "11-20", "21-50", "51-100", "101-200", "201-500",
    "501-1000", "1001-2000", "2001-5000", "5001-10000", "10001-20000",
    "20001-50000", "50000+",
]

AVAILABLE_EMAIL_STATUS = ["validated", "guessed", "unavailable"]

AVAILABLE_FUNDING_STAGES = [
    "angel", "seed", "series_a", "series_b", "series_c", "series_d",
    "series_e", "private_equity", "other",
]


def validate_criteria(criteria: SearchCriteria) -> list:
    """Validate search criteria, return list of warnings."""
    warnings = []
    if criteria.fetch_count > 100:
        warnings.append("Free Apify plan limited to 100 leads per run")
    if not criteria.contact_job_title and not criteria.company_keywords:
        warnings.append("Consider adding job titles or keywords for better targeting")
    for size in criteria.size:
        if size not in AVAILABLE_SIZES:
            warnings.append(f"Unknown size '{size}'. Available: {AVAILABLE_SIZES}")
    return warnings
