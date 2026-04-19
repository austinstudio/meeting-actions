# Outlook Extractor — Recipient Capture Fix

**Where to apply this:** the `outlook-email-extractor` repo (Rust + AppleScript), NOT `meeting-actions`.

**Symptom:** Every email extracted into Redis has `"to": []` and `"cc": []` — the meeting-actions triage screen can't show "To: you" / "CC'd" badges because the data isn't there.

**Root cause:** `scripts/extract_emails.applescript` tries to collect recipients but the `address of (email address of r)` lookup chain silently fails on modern Outlook for Mac. Each recipient gets dropped inside a `try` block with no error surfaced, so the final list is always empty.

---

## The fix

Open `scripts/extract_emails.applescript` and replace the TO and CC collection blocks (roughly lines 57–81) with the versions below. The change: try `address of r` **first** (modern Outlook), fall back to `address of (email address of r)` (older Outlook).

### Replace the TO block

**Before:**

```applescript
-- Collect TO recipients
set toList to ""
try
    set toRecips to to recipients of msg
    repeat with r in toRecips
        try
            set rAddr to address of (email address of r)
            if toList is not "" then set toList to toList & ","
            set toList to toList & "\"" & rAddr & "\""
        end try
    end repeat
end try
```

**After:**

```applescript
-- Collect TO recipients
set toList to ""
try
    set toRecips to to recipients of msg
    repeat with r in toRecips
        set rAddr to ""
        try
            set rAddr to address of r
        end try
        if rAddr is "" then
            try
                set rAddr to address of (email address of r)
            end try
        end if
        if rAddr is not "" then
            if toList is not "" then set toList to toList & ","
            set toList to toList & "\"" & rAddr & "\""
        end if
    end repeat
end try
```

### Replace the CC block

**Before:**

```applescript
-- Collect CC recipients
set ccList to ""
try
    set ccRecips to cc recipients of msg
    repeat with r in ccRecips
        try
            set rAddr to address of (email address of r)
            if ccList is not "" then set ccList to ccList & ","
            set ccList to ccList & "\"" & rAddr & "\""
        end try
    end repeat
end try
```

**After:**

```applescript
-- Collect CC recipients
set ccList to ""
try
    set ccRecips to cc recipients of msg
    repeat with r in ccRecips
        set rAddr to ""
        try
            set rAddr to address of r
        end try
        if rAddr is "" then
            try
                set rAddr to address of (email address of r)
            end try
        end if
        if rAddr is not "" then
            if ccList is not "" then set ccList to ccList & ","
            set ccList to ccList & "\"" & rAddr & "\""
        end if
    end repeat
end try
```

Nothing else in the AppleScript or Rust side needs changing. The Rust `models.rs` already expects `to: Vec<String>` / `cc: Vec<String>`, and the JSON shape `"to":[...]` / `"cc":[...]` in the AppleScript output is unchanged.

---

## Verify it worked

From the extractor repo:

```bash
# 1. Rebuild / start the server (Outlook must be open)
RUST_LOG=info cargo run
```

In another terminal:

```bash
# 2. Re-extract — this upserts by outlook_id, so existing emails in Redis
#    will get their to/cc fields filled in without duplicates.
curl -X POST http://localhost:3001/api/extract \
  -H 'Content-Type: application/json' \
  -d '{"limit": 10}'
```

```bash
# 3. Check the result — you should see non-empty arrays
curl -s "http://localhost:3001/api/emails?per_page=3" | jq '.emails[] | {subject, to, cc}'
```

Expected output (something like):

```json
{
  "subject": "RE: Project Status Update",
  "to": ["coobrien@deloitte.com", "someone@deloitte.com"],
  "cc": ["manager@deloitte.com"]
}
```

If `to` and `cc` are still empty arrays, the address lookup is still failing — see Troubleshooting.

---

## Backfill existing emails

Emails already in Redis will have empty `to`/`cc` until they're re-extracted. The extractor upserts by `outlook_id`, so running a full extract of the same folder will overwrite:

```bash
# Replace 1000 with however many you have (default folder is Inbox)
curl -X POST http://localhost:3001/api/extract \
  -H 'Content-Type: application/json' \
  -d '{"limit": 1000, "folder": "Inbox"}'
```

Once that completes, the triage app on the other machine will see recipients on the next load of `/triage`. No re-analysis needed — the AI classification stays as-is; only the visual To/CC badges will appear.

---

## Troubleshooting

**Still empty after the fix:**

Run this mini test in Script Editor (macOS app) to see what fields the recipient objects actually expose:

```applescript
tell application "Microsoft Outlook"
    set msg to first message of inbox of first exchange account
    set r to first item of (to recipients of msg)
    return properties of r
end tell
```

Look at the dumped properties. You should see fields like `address`, `email address`, or `name`. If neither `address of r` nor `address of (email address of r)` resolves in your Outlook build, use whatever field is present and update the two `try` branches accordingly.

**"Classic Outlook" required:**

This extractor only works with **classic** Outlook for Mac, not the new/preview Outlook (which dropped AppleScript for Exchange accounts). If `tell application "Microsoft Outlook" ... first exchange account` returns empty, flip via `Help → Revert to Legacy Outlook`.

**Nothing changes at all:**

macOS caches compiled AppleScripts briefly. After editing the `.applescript` file, quit and re-launch the extractor (`cargo run`) to force a fresh compile.

---

## After verification

Commit the fix in the extractor repo:

```bash
git add scripts/extract_emails.applescript
git commit -m "fix(applescript): fall back to address of recipient when email address lookup fails"
```

No changes are needed in the meeting-actions repo — the triage UI is already wired to display recipient info and will pick it up the moment the data lands in Redis.
