#!/usr/bin/env python3
"""
Re-submit emails that bounced while the KV blob was over the 10 MB limit
(≈ 2026-08-21 → 2026-09-04) by posting them straight to /api/inbound-email,
exactly as the Cloudflare Email Worker would have.

Usage:
  python3 scripts/reforward-emails.py <folder-of-.eml-files>            # dry run: parse + list, no network
  python3 scripts/reforward-emails.py <folder-of-.eml-files> --send     # post each one, write results JSON

Needs INBOUND_EMAIL_SECRET in the environment or in .env.production.local / .env.local.
Skips any email whose subject already exists as a meeting on the board (checked once via KV).
Accepted inputs in the folder:
  *.eml                      raw emails (Outlook for Mac: drag messages to a Finder folder)
  *.txt *.md *.docx *.pdf    Plaud exports (Transcript or Summary). Each file is wrapped as a synthetic
                             "[Plaud-AutoFlow] MM-DD <name>" email, exactly the shape AutoFlow sends, so it
                             lands on the board as an email-sourced meeting. Date comes from a leading
                             YYYY-MM-DD / MM-DD in the filename, else the file's modification time.
"""
import base64, email, json, os, sys, time, urllib.request, urllib.error
from email import policy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENDPOINT = os.environ.get("INBOUND_EMAIL_URL", "https://tasks.usdc.design/api/inbound-email")

def load_env():
    for name in (".env.production.local", ".env.local"):
        p = ROOT / name
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))

def kv(cmd, *args):
    url = os.environ["KV_REST_API_URL"] + "/" + "/".join([cmd, *map(str, args)])
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + os.environ["KV_REST_API_TOKEN"]})
    return json.load(urllib.request.urlopen(req))["result"]

def existing_subjects():
    try:
        ms = kv("get", "meetings")
        ms = json.loads(ms) if isinstance(ms, str) else (ms or [])
        subs = set()
        for m in ms:
            s = m.get("sourceFileName") or ""
            if s.startswith("Email: "):
                subs.add(s[len("Email: "):].strip().lower())
        return subs
    except Exception as e:
        print(f"warning: could not read existing meetings for dedupe ({e})")
        return set()

def parse_eml(path: Path):
    msg = email.message_from_bytes(path.read_bytes(), policy=policy.default)
    text = html = ""
    attachments = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        ctype = part.get_content_type()
        disp = (part.get_content_disposition() or "")
        if disp == "attachment" or part.get_filename():
            content = part.get_payload(decode=True) or b""
            attachments.append({
                "filename": part.get_filename() or "attachment",
                "mimeType": ctype,
                "size": len(content),
                "content": base64.b64encode(content).decode("ascii") if content else None,
            })
        elif ctype == "text/plain" and not text:
            text = part.get_content()
        elif ctype == "text/html" and not html:
            html = part.get_content()
    date = msg.get("Date")
    try:
        from email.utils import parsedate_to_datetime
        date_iso = parsedate_to_datetime(date).isoformat() if date else None
    except Exception:
        date_iso = None
    return {
        "from": str(msg.get("From") or ""),
        "to": str(msg.get("To") or ""),
        "subject": str(msg.get("Subject") or ""),
        "date": date_iso or time.strftime("%Y-%m-%dT%H:%M:%S"),
        "text": text or "",
        "html": html or "",
        "headers": {k: str(v) for k, v in msg.items()},
        "attachments": attachments,
    }

def docx_text(path: Path) -> str:
    import re, zipfile
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf8", errors="replace")
    xml = re.sub(r"</w:p>", "\n", xml)
    return re.sub(r"<[^>]+>", "", xml).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").strip()

def date_from_name(path: Path):
    import re, datetime
    m = re.search(r"(20\d{2})[-_.](\d{2})[-_.](\d{2})", path.stem)
    if m:
        return datetime.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"(\d{2})[-_.](\d{2})\b", path.stem)
    if m:
        y = datetime.date.today().year
        return datetime.date(y, int(m[1]), int(m[2]))
    return datetime.datetime.fromtimestamp(path.stat().st_mtime).date()

def parse_export(path: Path):
    """Wrap a Plaud export file as the email AutoFlow would have sent."""
    import re, datetime
    day = date_from_name(path)
    stem = re.sub(r"^(20\d{2}[-_.])?\d{2}[-_.]\d{2}[\s_-]*", "", path.stem).strip() or path.stem
    subject = f"[Plaud-AutoFlow] {day:%m-%d} {stem}"
    ext = path.suffix.lower()
    text, attachments = "", []
    if ext in (".txt", ".md"):
        text = path.read_text(errors="replace")
    elif ext == ".docx":
        text = docx_text(path)
    elif ext == ".pdf":
        content = path.read_bytes()
        attachments.append({"filename": path.name, "mimeType": "application/pdf", "size": len(content),
                            "content": base64.b64encode(content).decode("ascii")})
    return {
        "from": "recovery@d2-lab.com",
        "to": "import@d2-lab.com",
        "subject": subject,
        "date": datetime.datetime.combine(day, datetime.time(9, 0)).isoformat(),
        "text": text,
        "html": "",
        "headers": {"X-Recovery": "reforward-emails.py"},
        "attachments": attachments,
    }

def post(payload, secret):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(ENDPOINT, data=data, method="POST", headers={
        "Content-Type": "application/json",
        "X-Email-Secret": secret,
    })
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode(errors="replace")[:300]}

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    folder = Path(sys.argv[1]).expanduser()
    send = "--send" in sys.argv
    load_env()
    exts = {".eml", ".txt", ".md", ".docx", ".pdf"}
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in exts and not p.name.startswith("."))
    if not files:
        print(f"no .eml/.txt/.md/.docx/.pdf files in {folder}"); sys.exit(1)
    secret = os.environ.get("INBOUND_EMAIL_SECRET")
    if send and not secret:
        print("INBOUND_EMAIL_SECRET not set; refusing to send"); sys.exit(1)

    already = existing_subjects()
    print(f"{len(files)} files · {len(already)} email-sourced meetings already on the board\n")
    results = []
    for f in files:
        p = parse_eml(f) if f.suffix.lower() == ".eml" else parse_export(f)
        dup = p["subject"].strip().lower() in already
        flag = "SKIP (already on board)" if dup else ("SEND" if send else "would send")
        print(f"{flag:24} {p['date'][:10]}  {p['subject'][:70]}  [{len(p['text'])} chars, {len(p['attachments'])} att]")
        if dup or not send:
            results.append({"file": f.name, "subject": p["subject"], "status": "skipped" if dup else "dry-run"})
            continue
        status, body = post(p, secret)
        n = len(body.get("tasks", [])) if isinstance(body, dict) else "?"
        print(f"{'':24} → HTTP {status}  tasks={n}  {body.get('message') or body.get('error') or ''}")
        results.append({"file": f.name, "subject": p["subject"], "status": status, "tasks": n})
        time.sleep(1.0)   # be gentle with Gemini + KV read-modify-write
    out = ROOT / "scripts" / f"reforward-results-{time.strftime('%Y%m%dT%H%M%S')}.json"
    if send:
        out.write_text(json.dumps(results, indent=2))
        print(f"\nresults written to {out}")
    else:
        print("\nDry run. Add --send to post these to the board.")

if __name__ == "__main__":
    main()
