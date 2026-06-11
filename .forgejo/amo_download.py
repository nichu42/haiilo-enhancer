"""Download a signed XPI from AMO.

Handles two scenarios:
- Version already exists on AMO (re-release / retry)
- Extension pending AMO review (web-ext sign timed out waiting for approval)

AMO signs listed extensions immediately after automated validation passes,
even before human review. The signed XPI is available via the authenticated API,
just not yet publicly listed on addons.mozilla.org.
"""

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request
import uuid
from typing import Any


def b64url(data: str | bytes) -> str:
    """Base64url-encode data without padding (JWT-safe)."""
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_jwt(iss: str, secret: str) -> str:
    """Create a short-lived HS256 JWT for AMO API authentication."""
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}))
    now = int(time.time())
    payload = b64url(
        json.dumps({"iss": iss, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 300})
    )
    sig_input = f"{header}.{payload}".encode()
    sig = b64url(hmac.new(secret.encode(), sig_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def load_manifest() -> dict[str, Any]:
    """Load the Firefox manifest from the build output directory."""
    with open("dist/firefox/manifest.json") as f:
        return json.load(f)


def api_get(token: str, url: str) -> dict[str, Any]:
    """Make an authenticated GET request to the AMO API."""
    req = urllib.request.Request(url, headers={"Authorization": f"JWT {token}"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def find_version(results: list[dict[str, Any]], version: str) -> dict[str, Any] | None:
    """Return the first result matching the given version string."""
    return next((r for r in results if r["version"] == version), None)


def download_file(token: str, url: str, dest: str) -> None:
    """Download a signed XPI to a local file."""
    req = urllib.request.Request(url, headers={"Authorization": f"JWT {token}"})
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    print(f"Downloaded {dest}")


def main() -> None:
    """Entry point: locate and download the signed XPI for the current version.

    Retries up to 3 times with 30-second delays, because AMO may need a
    moment to finish processing a freshly submitted version.
    """
    iss = os.environ["AMO_JWT_ISSUER"]
    sec = os.environ["AMO_JWT_SECRET"]
    token = make_jwt(iss, sec)

    manifest = load_manifest()
    gecko_id = manifest["browser_specific_settings"]["gecko"]["id"]
    version = manifest["version"]

    url = (
        f"https://addons.mozilla.org/api/v5/addons/addon/{gecko_id}/versions/"
        f"?filter=all_with_unlisted"
    )

    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        data = api_get(token, url)
        match = find_version(data["results"], version)

        if match and match.get("file"):
            break

        if attempt < max_attempts:
            print(
                f"Version {version} not yet available on AMO (attempt {attempt}/{max_attempts}). "
                f"Waiting 30 seconds before retry..."
            )
            time.sleep(30)
            token = make_jwt(iss, sec)  # Refresh JWT (5-min lifetime)
        else:
            msg = f"No signed file for version {version} on AMO after {max_attempts} attempts"
            raise RuntimeError(msg)

    download_url: str = match["file"]["url"]
    out = f"dist/haiilo_enhancer-{version}.xpi"
    download_file(token, download_url, out)


if __name__ == "__main__":
    main()
