# Prospecting → Outreach Pipeline — Build Brief
### Stage 1 of the plan agreed with Ashwani: pipeline first, then a second tenant, then billing.

Hand this to Claude Code in the auk-marketing-deploy folder. The full design
reasoning lives in AUKPILOT-prospecting-outreach-pricing-design.md (same
folder, or ask Ashwani to add it) — this brief is the concrete build plan
against that design, now that Clerk + Neon are confirmed live in production.

**Build this in the checkpoints below, in order. Stop and report back after
each checkpoint rather than continuing straight through — there are three
new external services involved (HubSpot's app-level API, Resend, Vercel
Cron), and today's Clerk/Neon session showed how much hides in environment
wiring specifically. Confirm each piece works before building the next.**

---

## Before starting — one clarification to get from Ashwani, not to assume
HubSpot is currently connected to Claude (the chat assistant) via MCP, for
Ashwani to query directly in conversation. That is a **different connection**
from what this brief needs: the **app itself** (api/ serverless functions)
needs its own HubSpot API access (a private app token or OAuth), independent
of the MCP connection. Confirm this distinction with Ashwani before Checkpoint 2.

---

## Checkpoint 1 — Schema + research agent (no external sends yet)

Add to the existing Neon database (tenant_data, tenants, tenant_activity
already live):

```sql
create table prospect_runs (
  id            bigserial primary key,
  tenant_id     text references tenants(id) on delete cascade,
  service_name  text not null,
  criteria      jsonb not null,
  status        text not null default 'running',
  created_at    timestamptz default now()
);

create table prospects (
  id            bigserial primary key,
  run_id        bigint references prospect_runs(id) on delete cascade,
  tenant_id     text references tenants(id) on delete cascade,
  company_name  text not null,
  contact_name  text,
  contact_email text,
  hubspot_id    text,
  verified      boolean default false,
  status        text not null default 'new',
  created_at    timestamptz default now()
);
```

Build a new tab in the app — "Prospecting" — modeled directly on the existing
**AI Trend Radar** (same web-search-via-Claude-API pattern already proven and
live). Input: pick one of the tenant's own services (reuses `s.mkt.audience`,
`s.mkt.geo` already in the data model — do not invent new targeting fields).
Output: a list of candidate companies with a short rationale each, written
into `prospect_runs` + `prospects`. **No contact emails are invented** — if
web search can't find a verifiable contact, leave `contact_email` null and
`verified` false; never guess a plausible-looking address.

Stop here and confirm with Ashwani that the research output quality looks
right before building anything that touches HubSpot or sends anything.

---

## Checkpoint 2 — HubSpot qualification

Requires a HubSpot **private app access token** (Ashwani creates this in
HubSpot's own settings — Settings → Integrations → Private Apps — separate
from the MCP connection). Add `HUBSPOT_ACCESS_TOKEN` to Vercel env vars,
**scoped to Production, Preview, AND Development this time** — don't repeat
today's three-separate-trips mistake; add all three scopes in one pass per
variable from the start.

New serverless function `api/hubspot-sync.js`: for each prospect marked
`status = 'new'`, check if a matching company already exists in HubSpot
(search by domain/name), and if not, create a new Company + Contact record.
Store the returned HubSpot record ID back on the `prospects` row. Update
`prospects.status` to `'queued'` once synced.

Stop here and confirm the HubSpot records actually appear correctly (get
Ashwani to check HubSpot directly) before building the email draft/send stage.

---

## Checkpoint 3 — Draft + review queue

```sql
create table outreach_emails (
  id            bigserial primary key,
  prospect_id   bigint references prospects(id) on delete cascade,
  tenant_id     text references tenants(id) on delete cascade,
  subject       text,
  body          text,
  approved_by   text,
  sent_at       timestamptz,
  follow_up_of  bigint references outreach_emails(id),
  created_at    timestamptz default now()
);
```

AI drafts a cold outreach email per qualified prospect (same API proxy
pattern as the existing Campaign & AI tab's social post generator — new
prompt, same underlying mechanism). Drafts land in a review queue in the UI.
**Nothing sends automatically — every email requires a human click to
approve before Checkpoint 4 can touch it.** This matches the review-before-send
decision already made; do not build an auto-send path in this checkpoint.

Stop here and get Ashwani to review draft quality on a handful of real
prospects before wiring up actual sending.

---

## Checkpoint 4 — Resend integration + Cron follow-up

Requires `RESEND_API_KEY` in Vercel (Ashwani already has a Resend account —
get the key from there). Same three-environment-scope note as Checkpoint 2.

New serverless function `api/send-outreach.js`: takes an approved
`outreach_emails` row, sends via Resend, records `sent_at`, updates
`prospects.status` to `'sent'`.

Vercel Cron job (add to vercel.json): runs daily, checks for prospects with
`status = 'sent'` and no reply after 5 days (start with a hardcoded number;
make it configurable later), drafts a follow-up email (linked via
`follow_up_of`), and adds it to the same review queue — never auto-sends
the follow-up either.

```sql
create table tenant_usage (
  id            bigserial primary key,
  tenant_id     text references tenants(id) on delete cascade,
  month         date not null,
  research_runs int not null default 0,
  emails_sent   int not null default 0,
  ai_drafts     int not null default 0,
  unique (tenant_id, month)
);
```
Increment the relevant counter in `tenant_usage` at each of the three action
points above (research run, AI draft, email sent) — no enforcement/limits
yet, just counting, ready for the billing work that comes after this.

---

## Testing checklist (repeat the same rigor as the multi-tenant migration)
- [ ] Run a real research query against one of AUK's own services, confirm candidates look sensible
- [ ] Confirm a prospect correctly appears as a new record in HubSpot itself
- [ ] Confirm a draft email reads naturally before approving it
- [ ] Send ONE real test email to an address Ashwani controls, confirm it arrives
- [ ] Confirm tenant_usage counters increment correctly after each action
- [ ] Test all of this locally first, exactly like the Clerk/Neon migration — do not push straight to production

## Do NOT do in this pass
- No auto-send, at any stage, for outreach or follow-ups
- No billing enforcement (tenant_usage counts only, no blocking yet)
- No second tenant yet — this is built and tested against AUK's own data only
