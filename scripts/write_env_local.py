#!/usr/bin/env python3
"""Write NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.

Fetches the anon key from the Supabase Management API and writes it to the
file without ever printing it. Usage: write_env_local.py <supabase-ref>
"""
import sys, urllib.request, urllib.error
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

BASE = "https://api.supabase.com"
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused")

def main():
    ref = sys.argv[1]
    req = urllib.request.Request(f"{BASE}/v1/projects/{ref}/api-keys")
    add_surrogate_to_request(req, "custom.supabase", allowed_hosts=["api.supabase.com"])
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=30) as r:
            keys = read_json_response(r)
    except urllib.error.HTTPError as e:
        print(f"Supabase api-keys HTTP {e.code}", file=sys.stderr)
        return 1
    anon = None
    items = keys if isinstance(keys, list) else keys.get("api_keys", []) if isinstance(keys, dict) else []
    for item in items:
        name = str(item.get("name", "")).lower()
        if "anon" in name or "publishable" in name:
            anon = item.get("api_key") or item.get("key")
            break
    if not anon:
        print("anon key not found", file=sys.stderr)
        return 1
    with open("/home/hatch/workspace/doyouknowme-build/.env.local", "w") as f:
        f.write(f"NEXT_PUBLIC_SUPABASE_URL=https://{ref}.supabase.co\n")
        f.write(f"NEXT_PUBLIC_SUPABASE_ANON_KEY={anon}\n")
    print("wrote .env.local (url + anon key, values not printed)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
