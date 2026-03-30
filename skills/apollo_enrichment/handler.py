"""
Apollo Enrichment Skill Handler

Entry point called by the ClaudeClaw skill registry.
Reads SKILL_INPUT from env, accepts a list of leads as JSON,
enriches them via Apollo People Search, and returns enriched leads to stdout.
"""

import os
import sys
import json
from pathlib import Path

# Add skill directory to path so co-located modules can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Add skills root to path so shared modules can be imported
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.lead_model import Lead  # noqa: E402
from apollo_enrichment import enrich_leads_with_apollo  # noqa: E402


def run_enrich(params: dict) -> dict:
    """Enrich a list of leads with Apollo People Search contacts.

    Accepts leads as a JSON array. Returns the original leads plus
    any new Apollo-discovered contacts, deduped by email.
    """
    leads_data = params.get("leads", [])
    per_domain = int(params.get("per_domain", 5))

    if not leads_data:
        return {"status": "error", "error": "No leads provided. Pass a 'leads' array."}

    # Deserialize leads from JSON dicts
    leads = [Lead.from_dict(ld) for ld in leads_data]

    original_count = len(leads)
    enriched = enrich_leads_with_apollo(leads, per_domain=per_domain)
    apollo_count = len(enriched) - original_count

    # Serialize back to dicts for JSON output
    enriched_dicts = [lead.to_dict() for lead in enriched]

    return {
        "status": "success",
        "leads": enriched_dicts,
        "original_count": original_count,
        "apollo_count": apollo_count,
        "total_count": len(enriched),
    }


def main():
    raw_input = os.environ.get("SKILL_INPUT", "{}")
    try:
        params = json.loads(raw_input)
    except json.JSONDecodeError as e:
        print(json.dumps({"status": "error", "error": f"Invalid SKILL_INPUT JSON: {e}"}))
        sys.exit(1)

    try:
        result = run_enrich(params)
    except Exception as e:
        result = {"status": "error", "error": str(e)}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
