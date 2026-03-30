"""
Google Authentication Helper

Handles OAuth authentication for Google APIs.
Credential paths read from environment variables (set via skillEnv in client config).
"""

import json
from pathlib import Path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from lead_config import CREDENTIALS_FILE, TOKEN_FILE

# OAuth scopes needed for lead generation
SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]


def get_credentials(scopes: list = None) -> Credentials:
    """
    Get valid Google OAuth credentials.

    Reads credential/token paths from lead_config (which reads from env vars).
    """
    if scopes is None:
        scopes = SCOPES

    creds = None

    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), scopes)

    if creds and creds.valid and creds.scopes and not set(scopes).issubset(set(creds.scopes)):
        print(f"Token missing scopes: {set(scopes) - set(creds.scopes)}", flush=True)
        creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing expired token...", flush=True)
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                raise FileNotFoundError(
                    f"Google credentials not found at {CREDENTIALS_FILE}\n"
                    "Set GOOGLE_CREDENTIALS_PATH in the client config skillEnv."
                )

            print("Starting OAuth flow...", flush=True)

            with open(CREDENTIALS_FILE, "r") as f:
                creds_data = json.load(f)

            ports_to_try = [8080, 8000, 5000] if "web" in creds_data else [0]

            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_FILE), scopes
            )

            creds = None
            for port in ports_to_try:
                try:
                    creds = flow.run_local_server(
                        port=port,
                        open_browser=True,
                        redirect_uri_trailing_slash=False
                    )
                    break
                except OSError as e:
                    if "Address already in use" in str(e):
                        continue
                    raise

            if creds is None:
                raise RuntimeError("All ports in use. Close other applications and try again.")

        # Save token for future use
        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())
        print(f"Token saved to {TOKEN_FILE}", flush=True)

    return creds
