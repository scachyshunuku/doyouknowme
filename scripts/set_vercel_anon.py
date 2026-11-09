#!/usr/bin/env python3
"""Fetch the Supabase anon/publishable key and set it as a Vercel env var.

Never prints the key. Prints only the Vercel env var id, key name, and targets.
Usage: set_vercel_anon.py <supabase-project-ref> <vercel-project-id-or-name>
"""
import json, subprocess, sys, urllib.request, urllib.error
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

BASE = "https://api.supabase.com"
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused")

def main():
    if len(sys.argv) != 3:
        print("usage: set_vercel_anon.py <supabase-ref> <vercel-project>", file=sys.stderr)
        return 2
    ref, project = sys.argv[1], sys.argv[2]
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
        print("anon key not found in api-keys response", file=sys.stderr)
        return 1
    print(f"found anon key, length {len(anon)}")
    args = {
        "idOrName": project,
        "requestBody": {
            "key": "NEXT_PUBLIC_SUPABASE_ANON_KEY",
            "value": anon,
            "type": "plain",
            "target": ["production", "preview"],
        },
        "upsert": "true",
    }
    proc = subprocess.run(
        ["/opt/hatch/bin/vercel", "call-tool", "--name", "create_project_env",
         "--arguments-json", json.dumps(args)],
        capture_output=True, text=True, timeout=120,
    )
    out = proc.stdout + proc.stderr
    # Vercel returns the created env var including its value; strip it before printing.
    try:
        data = json.loads(proc.stdout)
        text = data["result"]["content"][0]["text"]
        created = json.loads(text)["result"]["created"]
        print(json.dumps({"id": created.get("id"), "key": created.get("key"), "target": created.get("target")}))
        return 0
    except Exception:
        print("Vercel call failed or response unparsable; not printing raw output", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
