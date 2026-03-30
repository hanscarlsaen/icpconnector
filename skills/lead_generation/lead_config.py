"""
Lead Generation Configuration

Centralized configuration for Apify Leads Finder integration.
Paths and API tokens read from environment variables (set via skillEnv in client config).
"""

import os
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional

# Add skills root to path so shared modules can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.lead_model import Lead, LEAD_SHEET_HEADERS  # noqa: E402

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

# Google Sheets Configuration (from skillEnv)
CREDENTIALS_FILE = Path(os.environ.get("GOOGLE_CREDENTIALS_PATH", PROJECT_ROOT / "google_auth.json"))
TOKEN_FILE = Path(os.environ.get("GOOGLE_TOKEN_PATH", PROJECT_ROOT / "token.json"))

# Default Google Drive folder for lead sheets (from skillEnv)
LEADS_DRIVE_FOLDER_ID = os.environ.get("LEADS_DRIVE_FOLDER_ID", "1nxR1sowpClw4ghNqdg6pzBDWgqmEJnqV")


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
