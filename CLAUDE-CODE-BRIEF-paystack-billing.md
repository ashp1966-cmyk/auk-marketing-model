# Paystack Billing Integration — Build Brief

## Goal
Turn the three pricing tiers (Starter R950 / Growth R2,400 / Agency
R6,500) into real, working subscriptions — a tenant can subscribe, get
billed monthly, and lose write access (never data) if payment fails and
isn't resolved.

## Real test setup already in place
- Test Client Co (org_3IUNkYsn1EVYdsSylkRCiNU3M1M) — genuine second
  tenant, already proven for HubSpot separation testing. Use it as the
  real subscriber for this build too.
- Paystack account in Test Mode — test secret/public keys available,
  three plan codes to be created (Starter/Growth/Agency), webhook URL
  already pre-configured at
  https://marketing.auk-maritime.com/api/webhooks/paystack (currently
  404s since the endpoint doesn't exist yet — that's expected until
  Step 2 ships).

## Plan — build in checkpoints, same discipline as every session tonight

### Checkpoint 1 — Schema
```sql
alter table tenants add column if not exists billing_status text not null default 'trialing';
-- trialing | active | past_due | suspended | canceled
alter table tenants add column if not exists paid_until timestamptz;
alter table tenants add column if not exists paystack_customer_code text;
alter table tenants add column if not exists paystack_subscription_code text;
alter table tenants add column if not exists plan_code text;

create table if not exists webhook_events (
  event_id text primary key,
  provider text not null default 'paystack',
  payload jsonb not null,
  processed_at timestamptz default now()
);
```
Show this DDL for review before running, test on `rls-test` first
(`tenants` already has RLS from tonight's earlier work — confirm the new
columns are covered by the existing policy, no new grants should be
needed). `webhook_events` is provider-facing, not tenant-scoped — decide
whether it needs RLS at all or should sit on the owner-role connection
like `cron-follow-up.js` does (it's genuinely cross-tenant by nature).

### Checkpoint 2 — Webhook handler
`api/webhooks/paystack.js`:
- Verify Paystack's HMAC-SHA512 signature on the raw request body first,
  before any parsing — reject anything that doesn't match.
- Check `webhook_events` for the event ID; if already processed, ACK
  200 and do nothing (idempotency — Paystack retries on non-2xx).
- Handle at minimum: `charge.success` (set `active`, extend
  `paid_until`), `subscription.disable` (`canceled`), `invoice.payment_failed`
  (`past_due`, start the dunning clock).
- Respond fast (verify → dedupe → update → 200) — no slow synchronous
  work in the handler itself.

Test locally first by using Paystack's own webhook test-event sender
(available in their dashboard) pointed at a local tunnel, or by manually
POSTing a correctly-signed test payload — show me which approach before
building it.

### Checkpoint 3 — Subscribe flow
A simple "Billing" tab/section:
- Shows the three plans, current `billing_status`.
- "Subscribe" button per plan → redirects to Paystack's hosted checkout
  (simplest, safest integration — no card data ever touches our
  servers, keeps AUK at PCI SAQ A).
- On successful checkout, Paystack redirects back and the webhook
  (Checkpoint 2) confirms and activates — don't trust the redirect
  alone, the webhook is the source of truth.

### Checkpoint 4 — Access gate
Extend the existing auth check (same place `resolveOrgId()` already
runs) to also check `billing_status`:
- `active` or `trialing` → normal access.
- `past_due` → normal access (grace period, per the dunning design).
- `suspended` → GET requests succeed (read-only), non-GET requests
  return 402 with a clear "subscription inactive" message. Never delete
  or lock any data.

### Checkpoint 5 — Dunning (simplified for now)
Extend the existing Vercel Cron (already running for outreach
follow-ups) to also check: any tenant `past_due` for more than 10 days
→ flip to `suspended`. That's the whole mechanism for now — the
webhook already handles the "payment recovered → back to active"
direction instantly.

### Checkpoint 6 — Real test, Test Client Co
- Subscribe Test Client Co to the Starter plan using a Paystack test
  card (Paystack provides standard test card numbers for exactly this).
- Confirm `billing_status` flips to `active` via the real webhook, not
  a manual DB edit.
- Manually trigger a `invoice.payment_failed` test event (Paystack's
  dashboard supports sending test webhook events on demand) — confirm
  `past_due`, confirm writes still work (grace period).
- Manually flip to `suspended` via the same cron logic, confirm reads
  still work and writes correctly return 402.
- Resolve payment again, confirm the webhook restores `active`
  immediately.

## Security notes
- Never store card data — Paystack's hosted checkout handles that
  entirely.
- Webhook signature verification is non-negotiable — no processing
  without it passing first.
- Same credential-handling rule as every other secret tonight —
  Paystack secret key goes into Vercel env vars (all three scopes,
  registered in one pass this time), never typed into chat.

## Testing discipline
Schema reviewed before running, tested on `rls-test` first. Webhook
tested with real Paystack test events, not fabricated payloads assumed
to match Paystack's real format. Production only touched after
Checkpoint 6 passes cleanly on the test setup. Domain re-pointing
ritual applies to every deploy in this build too, no exceptions.
