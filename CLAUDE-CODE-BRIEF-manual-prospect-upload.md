# Manual Prospect Upload (CSV/Excel) — Build Brief

## Why this exists
AI-powered research (Prospecting's "Run research") has a low real-world
contact-verification rate — testing showed 0/8 verified contacts on a
real run, consistent with the AI's deliberate refusal to guess emails
it can't confirm via web search. Manually-sourced lists (e.g. via
LinkedIn tools, Google Colab scraping, purchased lists) reliably
outperform this on contactability, at zero per-run cost. This adds a
manual upload path as a first-class alternative to AI research — not a
replacement, both remain available side by side.

## Design decisions, confirmed
- Uploaded prospects skip AI peer-detection entirely — the person
  compiling their own list has already done that judgment. They go
  straight to usable prospects, `verified: true`, `is_peer: false`.
- Uploads have **zero AI cost**, therefore **do not count against
  trial-gating's `research_runs` cap** — that cap exists specifically
  to protect AI spend, which doesn't apply here. Do not wire
  `checkTrialGate` into this path.
- Everything downstream (HubSpot sync, outreach drafting, the review
  queue, sending) stays completely unchanged — it already operates on
  prospect records regardless of how they were created.

## Plan

### Step 1 — Upload UI
A drop area (or simple file input) in the Prospecting tab, alongside
the existing "Run research" card — same service-selection dropdown
already there, now with two paths: "Run AI research" (existing) or
"Upload your own list" (new).

Accepted formats: `.csv`, `.xlsx`. Use `papaparse` for CSV,
`xlsx`/SheetJS for Excel — both already available, both work
client-side in the browser (no need to send the raw file to the
server).

### Step 2 — Column mapping
Minimum required columns: **company name**, **contact email**.
Optional: **contact name**.

Auto-detect common header names on upload (`Company`, `Company Name`,
`Email`, `Contact Email`, `Name`, `Contact Name`, etc., case-insensitive).
If auto-detection can't confidently map all required fields, show a
simple manual mapping UI (dropdown per column: "this is Company Name,"
"this is Email," "ignore this column") before proceeding.

Basic validation before accepting: email format check (simple regex),
skip rows with a missing company name or malformed email, show a summary
("47 of 50 rows imported, 3 skipped — invalid email") rather than
silently dropping or hard-failing on bad rows.

Cap at 500 rows per upload — reasonable ceiling, avoids an accidental
huge import.

### Step 3 — Server-side save
New endpoint (or extend `api/prospects.js`) that accepts the parsed,
validated array and:
- Creates a `prospect_runs` row (`service` = selected service,
  `criteria = { source: 'manual_upload', filename }`) — so uploaded
  batches show up in "Saved runs" exactly like AI research runs do
  today, same UI pattern, no new display logic needed.
- Inserts each row into `prospects` with `verified: true`,
  `is_peer: false`, `rationale: null` (or a generic "Manually
  uploaded" note).
- Standard `withTenant()`/RLS-protected pattern, same as every other
  write in this build.

### Step 4 — Real test
Upload a real small CSV (5-10 rows, mix of valid and deliberately
invalid rows to test the skip/summary behavior) as Test Client Co.
Confirm:
- Correct rows land as prospects, `verified: true`.
- Invalid rows are skipped with an accurate count shown.
- The batch appears in Saved Runs correctly.
- HubSpot sync works identically on these as on AI-researched
  prospects.
- `tenant_usage.research_runs` is NOT incremented by this action
  (confirm directly via DB query, not assumed).

## Testing discipline
Same as every checkpoint in this build: schema/code shown before
writing, tested on `rls-test` first with Test Client Co, production
only touched after a clean pass.
