"""Create ignored local app config using only the official public Supabase key."""
import json
import os
from pathlib import Path
import tempfile
import urllib.request

root = Path(__file__).resolve().parent.parent
target = root / ".env.local"
if target.exists():
    print("Existing .env.local preserved.")
    raise SystemExit(0)
token = os.environ.get("Nextapp_token_access") or os.environ.get("SUPABASE_ACCESS_TOKEN")
if not token:
    raise SystemExit("Management token missing: configure Nextapp_token_access securely in environment settings.")
ref = "mexokvvvxdyekauupwvt"
request = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/api-keys", headers={"Authorization": "Bearer " + token})
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        keys = json.load(response)
except Exception:
    raise SystemExit("Cannot retrieve the public project key. Check Management API access.")
key = next((k["api_key"] for k in keys if k.get("type") == "publishable"), None)
if not key:
    key = next((k["api_key"] for k in keys if k.get("name") == "anon"), None)
if not key or "\n" in key or "\r" in key:
    raise SystemExit("No valid public key available. No configuration was written.")
content = f"NEXT_PUBLIC_SUPABASE_URL=https://{ref}.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY={key}\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n"
with tempfile.NamedTemporaryFile(mode="w", dir=root, prefix=".env-setup-", delete=False) as handle:
    os.chmod(handle.name, 0o600)
    handle.write(content)
    temp = Path(handle.name)
try:
    # Exclusive target creation avoids overwriting a concurrent user configuration.
    os.link(temp, target)
finally:
    temp.unlink()
print("Created ignored .env.local with public configuration only; no privileged keys stored.")
