"""Fix BusyBox wget loopback health probes in our local Supabase containers.

BusyBox ignores NO_PROXY. This wrapper bypasses proxies ONLY for loopback URLs;
all non-loopback requests keep the inherited proxy and TLS behavior.
"""
import json
import subprocess
import tempfile
import os

WRAPPER = r'''#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    http://127.0.0.1:*/*|http://localhost:*/*)
      exec /usr/bin/wget -Y off "$@" ;;
  esac
done
exec /usr/bin/wget "$@"
'''

for name in ["supabase_auth_Nextapp", "supabase_storage_Nextapp"]:
    result = subprocess.run(["docker", "inspect", name], capture_output=True, text=True)
    if result.returncode:
        continue
    info = json.loads(result.stdout)[0]
    command = " ".join(info["Config"].get("Healthcheck", {}).get("Test", []))
    if "wget" not in command or "127.0.0.1" not in command:
        continue
    subprocess.run(["docker", "exec", "--user", "0", name, "sh", "-c",
                    "[ -d /usr/local/bin ] || mkdir -p /usr/local/bin"], check=True)
    with tempfile.NamedTemporaryFile(mode="w", prefix="glowtrace-health-", delete=False) as handle:
        handle.write(WRAPPER)
        path = handle.name
    try:
        os.chmod(path, 0o755)
        subprocess.run(["docker", "cp", path, name + ":/usr/local/bin/wget"], check=True)
    finally:
        os.unlink(path)
    print(f"{name}: loopback health probe corrected; external proxy preserved")
