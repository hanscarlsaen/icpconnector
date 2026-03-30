"""
Lead Sheets Manager

Creates or updates Google Sheets for lead generation output.
Supports creating new spreadsheets or appending to existing ones.
"""

from datetime import datetime
from typing import List, Tuple, Optional

from googleapiclient.discovery import build

from google_auth import get_credentials
from lead_config import (
    Lead,
    SearchCriteria,
    LEAD_SHEET_HEADERS,
    LEADS_DRIVE_FOLDER_ID,
)


def _col_letter(n: int) -> str:
    """Convert column number (1-indexed) to letter."""
    result = ""
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _get_sheet_id_by_name(sheet_metadata: dict, name: str) -> Optional[int]:
    """Return sheetId for a given sheet tab name, or None if not found."""
    for sheet in sheet_metadata["sheets"]:
        if sheet["properties"]["title"] == name:
            return sheet["properties"]["sheetId"]
    return None


def create_leads_sheet(run_label: str, folder_id: Optional[str] = None) -> Tuple[str, str]:
    """
    Create a new Google Sheet for leads with Leads, Criteria, and Summary tabs.

    Returns:
        Tuple of (spreadsheet_id, spreadsheet_url)
    """
    if folder_id is None:
        folder_id = LEADS_DRIVE_FOLDER_ID

    creds = get_credentials()
    sheets_service = build("sheets", "v4", credentials=creds)
    drive_service = build("drive", "v3", credentials=creds)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    title = f"Leads - {run_label} - {timestamp}"

    spreadsheet_body = {
        "properties": {"title": title},
        "sheets": [
            {
                "properties": {
                    "title": "Leads",
                    "gridProperties": {"frozenRowCount": 1},
                }
            },
            {
                "properties": {
                    "title": "Criteria",
                    "gridProperties": {"frozenRowCount": 1},
                }
            },
            {
                "properties": {
                    "title": "Summary",
                    "gridProperties": {"frozenRowCount": 1},
                }
            },
        ],
    }

    print(f"Creating spreadsheet: {title}", flush=True)
    spreadsheet = sheets_service.spreadsheets().create(body=spreadsheet_body).execute()
    spreadsheet_id = spreadsheet["spreadsheetId"]
    spreadsheet_url = spreadsheet["spreadsheetUrl"]

    # Add headers to Leads tab
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'Leads'!A1:{_col_letter(len(LEAD_SHEET_HEADERS))}1",
        valueInputOption="RAW",
        body={"values": [LEAD_SHEET_HEADERS]},
    ).execute()

    # Format headers
    sheet_metadata = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    leads_sheet_id = _get_sheet_id_by_name(sheet_metadata, "Leads")
    summary_sheet_id = _get_sheet_id_by_name(sheet_metadata, "Summary")

    format_requests = [
        # Bold + grey background for Leads header row
        {
            "repeatCell": {
                "range": {"sheetId": leads_sheet_id, "startRowIndex": 0, "endRowIndex": 1},
                "cell": {
                    "userEnteredFormat": {
                        "textFormat": {"bold": True},
                        "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9},
                    }
                },
                "fields": "userEnteredFormat(textFormat,backgroundColor)",
            }
        },
        # Column widths for Leads tab
        {"updateDimensionProperties": {"range": {"sheetId": leads_sheet_id, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1}, "properties": {"pixelSize": 180}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": leads_sheet_id, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 2}, "properties": {"pixelSize": 250}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": leads_sheet_id, "dimension": "COLUMNS", "startIndex": 4, "endIndex": 5}, "properties": {"pixelSize": 200}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": leads_sheet_id, "dimension": "COLUMNS", "startIndex": 5, "endIndex": 6}, "properties": {"pixelSize": 200}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": leads_sheet_id, "dimension": "COLUMNS", "startIndex": 10, "endIndex": 11}, "properties": {"pixelSize": 250}, "fields": "pixelSize"}},
        # Bold + grey background for Summary header row
        {
            "repeatCell": {
                "range": {"sheetId": summary_sheet_id, "startRowIndex": 0, "endRowIndex": 1},
                "cell": {
                    "userEnteredFormat": {
                        "textFormat": {"bold": True},
                        "backgroundColor": {"red": 0.85, "green": 0.93, "blue": 0.83},
                    }
                },
                "fields": "userEnteredFormat(textFormat,backgroundColor)",
            }
        },
        {"updateDimensionProperties": {"range": {"sheetId": summary_sheet_id, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1}, "properties": {"pixelSize": 200}, "fields": "pixelSize"}},
        {"updateDimensionProperties": {"range": {"sheetId": summary_sheet_id, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 2}, "properties": {"pixelSize": 150}, "fields": "pixelSize"}},
    ]

    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id, body={"requests": format_requests}
    ).execute()

    # Move to folder
    if folder_id:
        try:
            drive_service.files().update(
                fileId=spreadsheet_id,
                addParents=folder_id,
                removeParents="root",
                fields="id, parents",
            ).execute()
            print(f"Moved to folder: {folder_id}", flush=True)
        except Exception as e:
            print(f"Warning: Could not move to folder: {e}", flush=True)

    print(f"Created spreadsheet: {spreadsheet_url}", flush=True)
    return spreadsheet_id, spreadsheet_url


def add_leads(leads: List[Lead], sheet_id: str) -> dict:
    """Append leads to an existing Google Sheet and update the Summary tab."""
    if not leads:
        return {"added": 0, "errors": 0}

    creds = get_credentials()
    sheets_service = build("sheets", "v4", credentials=creds)

    rows = []
    errors = 0
    for lead in leads:
        try:
            rows.append(lead.to_row())
        except Exception as e:
            print(f"Warning: Failed to convert lead: {e}", flush=True)
            errors += 1

    if not rows:
        return {"added": 0, "errors": errors}

    print(f"Adding {len(rows)} leads to sheet...", flush=True)
    sheets_service.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range=f"'Leads'!A:{ _col_letter(len(LEAD_SHEET_HEADERS))}",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()

    print(f"Added {len(rows)} leads to sheet", flush=True)

    # Update summary after adding leads
    update_summary(leads, sheet_id, sheets_service)

    return {"added": len(rows), "errors": errors}


def update_summary(leads: List[Lead], spreadsheet_id: str, sheets_service=None) -> None:
    """
    Write/overwrite the Summary tab with aggregate stats.

    Stats:
    - Total leads
    - Enrichment rate (% with email or phone)
    - Leads with email
    - Leads with phone
    - Leads with LinkedIn URL
    - Export timestamp
    """
    if sheets_service is None:
        creds = get_credentials()
        sheets_service = build("sheets", "v4", credentials=creds)

    total = len(leads)
    enriched = sum(1 for l in leads if l.is_enriched())
    with_email = sum(1 for l in leads if l.email)
    with_phone = sum(1 for l in leads if l.phone)
    with_linkedin = sum(1 for l in leads if l.linkedin_url)
    enrichment_rate = f"{(enriched / total * 100):.1f}%" if total > 0 else "N/A"

    rows = [
        ["Metric", "Value"],
        ["Total Leads", total],
        ["Enrichment Rate (email or phone)", enrichment_rate],
        ["Leads with Email", with_email],
        ["Leads with Phone", with_phone],
        ["Leads with LinkedIn URL", with_linkedin],
        ["", ""],
        ["Export Timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
    ]

    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'Summary'!A1:B{len(rows)}",
        valueInputOption="RAW",
        body={"values": rows},
    ).execute()

    print(f"Summary tab updated: {total} leads, enrichment rate {enrichment_rate}", flush=True)


def get_existing_sheet_url(spreadsheet_id: str) -> str:
    """Return the URL of an existing spreadsheet."""
    creds = get_credentials()
    sheets_service = build("sheets", "v4", credentials=creds)
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    return meta.get("spreadsheetUrl", f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}")


def add_criteria(criteria: SearchCriteria, spreadsheet_id: str) -> None:
    """Populate the Criteria tab with the search parameters used."""
    creds = get_credentials()
    sheets_service = build("sheets", "v4", credentials=creds)

    rows = [
        ["Parameter", "Value"],
        ["fetch_count", str(criteria.fetch_count)],
        ["file_name", criteria.file_name],
        ["contact_job_title", ", ".join(criteria.contact_job_title) if criteria.contact_job_title else ""],
        ["contact_location", ", ".join(criteria.contact_location) if criteria.contact_location else ""],
        ["contact_not_location", ", ".join(criteria.contact_not_location) if criteria.contact_not_location else ""],
        ["email_status", ", ".join(criteria.email_status) if criteria.email_status else ""],
        ["size", ", ".join(criteria.size) if criteria.size else ""],
        ["company_industry", ", ".join(criteria.company_industry) if criteria.company_industry else ""],
        ["company_keywords", ", ".join(criteria.company_keywords) if criteria.company_keywords else ""],
        ["has_phone", str(criteria.has_phone)],
        ["min_revenue", criteria.min_revenue or ""],
        ["max_revenue", criteria.max_revenue or ""],
        ["funding", ", ".join(criteria.funding) if criteria.funding else ""],
        ["company_website", ", ".join(criteria.company_website) if criteria.company_website else ""],
        ["", ""],
        ["Run timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
    ]

    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'Criteria'!A1:B{len(rows)}",
        valueInputOption="RAW",
        body={"values": rows},
    ).execute()

    # Format the Criteria tab header
    sheet_metadata = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    criteria_sheet_id = _get_sheet_id_by_name(sheet_metadata, "Criteria")

    if criteria_sheet_id is not None:
        sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={
                "requests": [
                    {
                        "repeatCell": {
                            "range": {"sheetId": criteria_sheet_id, "startRowIndex": 0, "endRowIndex": 1},
                            "cell": {
                                "userEnteredFormat": {
                                    "textFormat": {"bold": True},
                                    "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9},
                                }
                            },
                            "fields": "userEnteredFormat(textFormat,backgroundColor)",
                        }
                    },
                    {"updateDimensionProperties": {"range": {"sheetId": criteria_sheet_id, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1}, "properties": {"pixelSize": 180}, "fields": "pixelSize"}},
                    {"updateDimensionProperties": {"range": {"sheetId": criteria_sheet_id, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 2}, "properties": {"pixelSize": 500}, "fields": "pixelSize"}},
                ]
            },
        ).execute()

    print("Criteria tab populated", flush=True)
