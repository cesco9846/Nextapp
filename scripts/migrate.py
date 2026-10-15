"""Apply versioned migrations through the same ledger locally and via Management API.

No application secrets are written to SQL, files, arguments, or output.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

PROJECT = "mexokvvvxdyekauupwvt"
ROOT = Path(__file__).resolve().parent.parent


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def migration_query(path):
    body = path.read_text()
    checksum = hashlib.sha256(body.encode()).hexdigest()
    version = path.stem.split("_", 1)[0]
    tag = "$glowtrace_sql_" + checksum[:16] + "$"
    if tag in body:
        raise RuntimeError("Unexpected SQL delimiter")
    return f"""begin;
select pg_advisory_xact_lock(hashtextextended('glowtrace:migrations', 0));
create schema if not exists app_private;
create table if not exists app_private.schema_migrations (
 version text primary key, checksum text not null, name text not null,
 applied_at timestamptz not null default now()
);
revoke all on app_private.schema_migrations from public, anon, authenticated;
do $glowtrace_migration$
begin
 if exists(select 1 from app_private.schema_migrations where version={literal(version)} and checksum<>{literal(checksum)}) then
  raise exception 'Migration checksum mismatch: %', {literal(version)};
 elsif not exists(select 1 from app_private.schema_migrations where version={literal(version)}) then
  execute {tag}{body}{tag};
  insert into app_private.schema_migrations(version,checksum,name)
  values({literal(version)},{literal(checksum)},{literal(path.name)});
 end if;
end;
$glowtrace_migration$;
commit;
"""


def main():
    parser = argparse.ArgumentParser()
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--local", action="store_true")
    target.add_argument("--project-ref", choices=[PROJECT])
    parser.add_argument("--apply", action="store_true", help="Apply; without this flag list the plan only")
    args = parser.parse_args()
    paths = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    if not paths:
        raise SystemExit("No migrations found")
    for path in paths:
        if not args.apply:
            print(f"Plan: {path.name} -> {'local test database' if args.local else args.project_ref}")
            continue
        query = migration_query(path)
        if args.local:
            result = subprocess.run(["docker", "exec", "-i", "supabase_db_Nextapp", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], input=query, text=True, capture_output=True)
            if result.returncode:
                raise SystemExit("Local migration failed:\n" + result.stderr)
        else:
            token = os.environ.get("Nextapp_token_access") or os.environ.get("SUPABASE_ACCESS_TOKEN")
            if not token:
                raise SystemExit("Management token is not available")
            request = urllib.request.Request("https://api.supabase.com/v1/projects/" + args.project_ref + "/database/query",
                data=json.dumps({"query": query}).encode(), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    response.read()
            except urllib.error.HTTPError as error:
                message = error.read().decode(errors="replace")
                for name in ["Nextapp_token_access", "SUPABASE_ACCESS_TOKEN", "supabase_secret", "supabase_service_role_secret"]:
                    value = os.environ.get(name)
                    if value:
                        message = message.replace(value, "[redacted]")
                raise SystemExit(f"Remote migration failed (HTTP {error.code}): {message[:1500]}")
        print(f"Verified/applied: {path.name}; target={'local' if args.local else args.project_ref}")


if __name__ == "__main__":
    main()
