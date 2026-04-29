"""Download an already-signed XPI from AMO when web-ext sign reports a version conflict."""
import hmac, hashlib, base64, json, time, uuid, os, urllib.request


def b64url(data):
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


iss = os.environ["AMO_JWT_ISSUER"]
sec = os.environ["AMO_JWT_SECRET"]
header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}))
now = int(time.time())
payload = b64url(json.dumps({"iss": iss, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 300}))
sig = b64url(hmac.new(sec.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
token = f"{header}.{payload}.{sig}"

manifest = json.load(open("dist/firefox/manifest.json"))
gecko_id = manifest["browser_specific_settings"]["gecko"]["id"]
version = manifest["version"]

req = urllib.request.Request(
    f"https://addons.mozilla.org/api/v5/addons/addon/{gecko_id}/versions/?filter=all_with_unlisted",
    headers={"Authorization": f"JWT {token}"},
)
data = json.loads(urllib.request.urlopen(req).read())
match = next((r for r in data["results"] if r["version"] == version), None)
if not match or not match["files"]:
    raise RuntimeError(f"No signed files for version {version} on AMO")

url = match["files"][0]["url"]
out = f"dist/haiilo_enhancer-{version}.xpi"
req2 = urllib.request.Request(url, headers={"Authorization": f"JWT {token}"})
with urllib.request.urlopen(req2) as resp, open(out, "wb") as f:
    f.write(resp.read())
print(f"Downloaded {out}")
