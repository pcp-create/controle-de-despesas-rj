"""Check column existence using empty SELECTs; never read rows or mutate Supabase."""
import concurrent.futures
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

root = Path(__file__).resolve().parents[2]
env = dict(line.split("=", 1) for line in (root / ".env.local").read_text().splitlines()
           if "=" in line and not line.startswith("#"))
url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
key = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
tables = json.loads(Path(__file__).with_name("schema-reference.json").read_text())


def check(item):
    table, columns = item
    query = urllib.parse.urlencode({"select": ",".join(columns), "limit": "0"})
    request = urllib.request.Request(f"{url}/rest/v1/{table}?{query}", headers={
        "apikey": key, "Authorization": f"Bearer {key}",
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            # limit=0 deliberately returns no business records.
            response.read()
            return {"table": table, "status": response.status, "columns": len(columns)}
    except urllib.error.HTTPError as error:
        return {"table": table, "status": error.code,
                "error": json.loads(error.read().decode())}


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(check, tables.items()))
relation = check(('despesas', ['id', 'responsavel:profiles!despesas_gestor_aprovador_id_fkey(nome)']))
relation['check'] = 'approver_relationship'
results.append(relation)
print(json.dumps({"project": urllib.parse.urlparse(url).hostname, "checks": results},
                 ensure_ascii=False, indent=2))
raise SystemExit(0 if all(r["status"] == 200 for r in results) else 1)
