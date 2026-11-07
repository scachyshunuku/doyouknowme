#!/usr/bin/env python3
"""Run one SQL statement/file against a Supabase project via the Management API.

Usage: supabase_query.py <project-ref> <sql-file>
Prints only the HTTP status and the JSON response (truncated). Never prints
credentials. The Management API /database/query endpoint was verified Nov 7, 2026.
"""
import json, sys, urllib.request, urllib.error
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

BASE = "https://api.supabase.com"
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused")

def main():
    if len(sys.argv) != 3:
        print("usage: supabase_query.py <project-ref> <sql-file>", file=sys.stderr)
        return 2
    ref, sql_path = sys.argv[1], sys.argv[2]
    with open(sql_path) as f:
        query = f.read()
    body = json.dumps({"query": query}).encode()
    req = urllib.request.Request(
        f"{BASE}/v1/projects/{ref}/database/query",
        data=body, headers={"Content-Type": "application/json"}, method="POST",
    )
    add_surrogate_to_request(req, "custom.supabase", allowed_hosts=["api.supabase.com"])
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=60) as r:
            data = read_json_response(r)
            print(f"HTTP {r.status}")
            print(json.dumps(data, indent=2)[:4000])
            return 0
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read()[:2000]}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
