# Per-Tenant HubSpot Separation — Build Brief

## Goal
Right now, api/hubspot-sync.js uses one hardcoded HUBSPOT_ACCESS_TOKEN
env var — every tenant's qualified prospects sync into AUK's own HubSpot
portal. This needs to become per-tenant: each organization connects its
own HubSpot account, and sync uses whichever token belongs to the
signed-in tenant.

## Real test setup already in place
- AUK's org (org_3Hwfnq2gjUUsuE9StI4Hl45G2rO) — existing HubSpot
  connection, existing HUBSPOT_ACCESS_TOKEN env var.
- A genuine second test tenant: "Test Client Co"
  (org_3IUNkYsn1EVYdsSylkRCiNU3M1M), with its own real, separate HubSpot
  private-app token already created (scopes: crm.objects.companies.read/
  write, crm.objects.contacts.read/write) — not a mock, a real second
  HubSpot portal to sync into and verify against.

## Plan

1. **Schema**: add a `hubspot_token` column to `tenants` (nullable —
   AUK's existing row won't have one yet, needs backfilling separately;
   a tenant with no token means sync is simply unavailable for them,
   not broken). Show me the exact DDL before running it, same review
   process as the RLS work — test on `rls-test` first if this touches
   any existing data shape.

2. **Settings UI**: a simple screen (new tab, or a section on an
   existing settings-style page) where a signed-in tenant can paste
   their own HubSpot private-app token. Store it via the same
   `withTenant()`/RLS-protected pattern as everything else — this field
   lives in the `tenants` table, which already has RLS policies from
   tonight's earlier work (scoped by `id`, not `tenant_id` — same
   pattern already in place there).

3. **Rewire api/hubspot-sync.js**: instead of reading the single
   `HUBSPOT_ACCESS_TOKEN` env var, look up the signed-in tenant's own
   `hubspot_token` from the `tenants` table first. If it's not set,
   return a clear, friendly error ("Connect your HubSpot account first")
   rather than a generic failure.

4. **Backfill AUK's own row**: once the column exists, set AUK's
   existing `HUBSPOT_ACCESS_TOKEN` value as `tenants.hubspot_token` for
   AUK's own org specifically — so AUK's existing sync keeps working
   uninterrupted through this change, same "existing tenant unaffected"
   requirement as the earlier Category B work.

5. **Real test, not mocked**: sign in as "Test Client Co", paste in its
   real HubSpot token via the new settings screen, run a research query
   under that tenant, sync a candidate to HubSpot — confirm it actually
   lands in the *second* HubSpot portal (Test Client Co's own account),
   not AUK's. Then confirm, separately, that AUK's own sync still
   correctly lands in AUK's portal, unaffected.

## Security note
`hubspot_token` is a real, sensitive credential, same category as any
other API key in this system — never log it, never include it in any
error message, mask it in any UI display after it's saved (show only
last 4 characters, same convention as how HubSpot itself displays its
own tokens).

## Testing discipline
Same as every session: schema changes reviewed and shown before running,
test on an isolated branch first if touching existing data shapes,
production only touched after explicit confirmation the test-tenant
sync genuinely landed in the correct, separate HubSpot portal.
