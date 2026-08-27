# AUKPILOT — Multi-Tenant Scale Architecture
### Technical Design Spec · 300+ Tenant Target
### Prepared against the current live stack: Vercel (serverless) + Neon (Postgres) + Clerk (auth)

> Each task below is a self-contained module. Clear context between them when
> handing to Claude Code — they don't depend on each other's conversation
> history, only on this document.

---

# TASK 1 — Subscription Billing Architecture & Access Control

## 1.1 Webhooks & Gateway

**Gateway: Paystack** (Stripe-owned, SA-native, no merchant-account friction — Stripe itself doesn't operate for SA merchants).

```
POST /api/webhooks/paystack
```

**Event-driven flow:**
```
Paystack event → signature verify → idempotency check → fast 200 ACK → async business logic
```

- **Signature verification**: HMAC-SHA512 using the Paystack secret key, computed over the raw request body. Reject anything that doesn't match — non-negotiable, first line of the handler, before any parsing.
- **Idempotency**: Paystack redelivers on any non-2xx response. Store every processed `event.id` in a `webhook_events` table (`event_id primary key`) — check-and-insert before processing; a duplicate delivery is a silent no-op, not an error.
- **ACK fast, process async**: Paystack expects a response in seconds. The handler's only synchronous job is verify → dedupe → enqueue → return 200. Actual business logic (updating `billing_status`, sending a receipt email) runs from a lightweight jobs table processed by a Vercel Cron tick, not inline in the webhook handler — decouples webhook latency from downstream work entirely.

**Events to handle:**
| Event | Action |
|---|---|
| `charge.success` | Extend `tenants.paid_until`, set `billing_status = 'active'` |
| `subscription.create` | Insert/update subscription record |
| `subscription.disable` | `billing_status = 'canceled'`, schedule access downgrade |
| `invoice.payment_failed` | Enter dunning sequence (1.2) |
| `subscription.not_renew` | Flag for non-renewal, no immediate action |

```sql
create table webhook_events (
  event_id text primary key,
  provider text not null default 'paystack',
  payload jsonb not null,
  processed_at timestamptz default now()
);

create table billing_jobs (
  id bigserial primary key,
  tenant_id text references tenants(id),
  job_type text not null,
  payload jsonb,
  status text not null default 'pending', -- pending | done | failed
  created_at timestamptz default now()
);
```

## 1.2 Dunning & Access Restriction

**Principle: access restriction is an app-layer authorization gate, never a data or connection-level action.** No DB rows are deleted, locked, or migrated when a tenant goes past-due — restriction and full restoration are both instant and reversible.

```sql
alter table tenants add column billing_status text not null default 'trialing';
-- trialing | active | past_due | suspended | canceled
alter table tenants add column paid_until timestamptz;
```

**Dunning sequence** (triggered by `invoice.payment_failed`):
1. **Day 0**: `billing_status = 'past_due'`. Full access continues. Resend email #1.
2. **Day 3**: Retry charge (Paystack's own retry, or a scheduled re-attempt). Resend email #2.
3. **Day 7**: Retry again. Resend email #3 — final notice.
4. **Day 10**: `billing_status = 'suspended'`. **Reads allowed, writes blocked** — the tenant can still see their data (builds trust, avoids a support-ticket spike) but can't create/edit anything until payment resumes.
5. **On payment success at any point**: `billing_status = 'active'` immediately, full read/write restored, no data ever touched.

**Enforcement point** — `resolveOrgId()` (the existing shared auth helper) gains one additional check:
```js
// api/_lib/auth.js — extend existing resolveOrgId
const { billing_status } = await getTenantBillingStatus(orgId);
if (billing_status === 'suspended' && req.method !== 'GET') {
  return res.status(402).json({ error: 'Subscription inactive', billingStatus: billing_status });
}
```
One gate, one place, same pattern as the existing org-resolution check — no new middleware layer.

## 1.3 PCI Compliance — Zero Audit Footprint

**Rule: raw card data never touches AUK's servers, ever.**

- Card capture happens entirely in Paystack's hosted **Inline.js** / hosted checkout — tokenizes client-side, returns only a `reference`/`authorization_code` to the app.
- AUK's database stores only: `customer_code`, `subscription_code`, `authorization_code` (a reusable charge token, not card data), `card_last4`, `card_brand`. **Never**: full PAN, CVV, expiry.
- This keeps AUK at **SAQ A** (the simplest PCI self-assessment tier — "we never see card data") rather than requiring SAQ D infrastructure (network segmentation, quarterly scans, full audit).

---

# TASK 2 — 24/7 Availability & Disaster Recovery

## 2.1 High Availability Layout

**This is largely already true of the current stack — the task is hardening what exists, not replacing it:**

- **Compute (Vercel)**: serverless functions are multi-region by default, no single point of failure at the compute layer. Nothing to build here.
- **Database (Neon)**: currently a single primary. **Gap**: no read replica. At 300-tenant scale, add a **Neon read replica** for reporting/dashboard-heavy queries (MIS charts, Business Plan aggregates) — routes read-only traffic off the primary write path, protects write latency under load.
- **Auth (Clerk)**: managed, multi-region by Clerk itself — no action needed.

## 2.2 Zero-Downtime Deployment

**Vercel's deployment model is already effectively atomic blue-green** — confirmed directly during tonight's incident: any single request is served entirely by the old deployment or entirely by the new one, never a mix. No canary infrastructure needs building for *code* deploys.

**The real risk is database schema changes — proven tonight, not theoretical.** Tonight's incident happened because a client's in-memory state predated a field the database migration added. The structural fix, going forward, for *every* future schema change:

**Expand/Contract pattern, mandatory for any schema change:**
1. **Expand**: add the new column/field, nullable, no code depends on it yet
2. **Deploy code** that can read *both* old and new shape (exactly what the merge-based `POST /api/tenant-data` now does)
3. **Backfill** data into the new field, with zero open client sessions for affected tenants (the operational rule already added to `CLAUDE.md` tonight)
4. **Contract**: only once every client is confirmed on new-shape-aware code, remove old-shape fallback logic

No migration ships that isn't backward-compatible for at least one full deploy cycle.

## 2.3 Health Monitoring & Automated Failover

```
GET /api/health
```
Checks, in order, fails fast on first failure:
- Neon connectivity (`select 1`)
- Clerk reachability (lightweight API ping)
- Resend/HubSpot/Anthropic — non-blocking checks, reported but don't fail the overall health check (these are feature-level, not platform-level, dependencies)

**External uptime monitor** (e.g., Better Uptime, UptimeRobot) pings `/api/health` every 60s, alerts on 2 consecutive failures. Given serverless has no persistent process to "restart," failover is inherent to the platform (Vercel routes around a failing region automatically) — the monitor's job is **alerting a human**, not triggering recovery.

**Connection pool exhaustion — a real risk at 300-tenant serverless scale**: each function invocation can open a new Postgres connection; at high concurrency this exhausts Neon's connection limit fast. **Mandatory**: use Neon's built-in **pooled connection string** (`-pooler` suffix) for all serverless function DB access, not the direct connection string.

---

# TASK 3 — Multi-Tenant Data Engineering & Storage

## 3.1 Storage Calculations (300 tenants, 1-year steady state)

**Light-usage tenant** (typical service-business usage — CRM, prospecting, planning, no heavy documents):

| Data | Volume/year | Size |
|---|---|---|
| CRM contacts | ~200 rows | 100KB |
| Prospects + research | ~2,000 rows | 1.6MB |
| Outreach emails | ~500 rows | 1MB |
| Activity log | ~2,000 rows | 400KB |
| Strategy/portfolio content | mostly static | 200KB |
| **Total per tenant** | | **~3.3MB/year** |

**At 300 light-usage tenants: ~1GB/year of relational data.** Trivial for managed Postgres — this is nowhere near a scale where Postgres itself is the constraint.

**Heavy-usage tenant** (audit/inspection-style — real documents, high research volume):

| Data | Volume/year | Size |
|---|---|---|
| Structured data (as above, 10x volume) | | ~15MB |
| **PDF reports/proposals** | ~500 files × 3MB avg | **~1.5GB** |

**At even 60 heavy tenants (20% of 300): ~90GB/year in documents.** This must never live in Postgres — confirms Task 3.3 below is not optional at this scale.

**Does managed Postgres scale for this?** Yes, easily, for the *relational* data — even millions of rows per table is routine for Postgres with proper indexing; 300 tenants' worth of CRM/prospect/MIS rows is orders of magnitude below where Postgres becomes the bottleneck. **The document volume is the actual scaling concern**, and it's solved by not putting it in Postgres at all (3.3).

## 3.2 Multi-Tenancy Strategy

| Approach | Isolation | Ops cost at 300 tenants | Verdict |
|---|---|---|---|
| **DB-per-tenant** | Strongest | 300 separate databases, 300 connection pools, 300 migration runs per schema change | Too heavy operationally at this scale |
| **Schema-per-tenant** | Strong | 300 schemas in one instance; Postgres catalog bloat and autovacuum overhead climb meaningfully past a few hundred schemas | Marginal, doesn't clearly beat the alternative below |
| **Shared DB, `tenant_id` column** | App-enforced only, *today* | One schema, one migration path, trivial to operate | **Recommended — with one critical addition below** |

**Recommendation: Shared DB, `tenant_id`-scoped — but add Postgres Row-Level Security (RLS), which does not exist today.**

This is the single most important recommendation in this document, and it's directly evidenced by tonight's real incident: isolation today is enforced *entirely in application code* (`resolveOrgId()` + `WHERE tenant_id = ...` on every query). That's exactly the kind of thing a code review can miss — and tonight's session spent real effort manually verifying it wasn't missed. **RLS makes tenant isolation a database-engine guarantee, not an application-code discipline** — even a future query that forgets its `WHERE` clause physically cannot return another tenant's rows.

```sql
alter table tenant_data enable row level security;

create policy tenant_isolation on tenant_data
  using (tenant_id = current_setting('app.current_tenant_id', true));
```
Set `app.current_tenant_id` once per request, right after `resolveOrgId()` confirms the caller's org — every subsequent query in that request is automatically scoped, with no per-query `WHERE` discipline required at all.

**Second recommendation: retire the single-JSONB-blob-per-tenant pattern for the entities that grow unboundedly.**

Today, `tenant_data.data` is one JSONB column holding the tenant's *entire* app state. Fine at current scale; genuinely doesn't hold up at 300 tenants × years of accumulated CRM/prospect/outreach history — every save is a full read-modify-write of the whole document, and there's no way to query "all prospects with status=new across the tenant" without pulling the entire blob into app memory.

**Migrate high-growth entities to proper normalized tables** (already partially done — `prospects`, `outreach_emails`, `tenant_activity` are already separate tables; extend the same pattern to `crm_contacts` and `mis_actuals`). Keep the JSONB blob only for genuinely low-volume, rarely-changing config (services, budget, strategy content) — that part of the pattern is fine as-is.

## 3.3 Storage Decoupling Pipeline

**Rule: no binary file ever touches Postgres.**

```
Client → presigned upload URL → direct-to-object-storage upload → object key + metadata → Postgres
```

- **Provider**: Vercel Blob (native S3-compatible integration, zero new infrastructure) or AWS S3 directly if finer-grained lifecycle control is needed later.
- **Presigned URLs, always**: large files never proxy through a serverless function (avoids payload size limits and function timeout entirely).
- **Metadata index**:
```sql
create table documents (
  id bigserial primary key,
  tenant_id text references tenants(id),
  s3_key text not null,
  filename text not null,
  category text,
  size_bytes bigint,
  created_at timestamptz default now()
);
```
- **Auto-archiving lifecycle**: >90 days untouched → Infrequent Access tier; >1 year → cold archive. Pure cost optimization, no code change needed once the lifecycle policy is set on the bucket.

**Backup / RPO / RTO:**

| | Target | How |
|---|---|---|
| Database RPO | < 1 hour | Neon's continuous WAL archiving / point-in-time recovery (already available on Neon, not yet actively used) |
| Database RTO | < 1 hour | Neon branch-based restore — spin up a branch at any historical timestamp, near-instant |
| Object storage RPO | < 24 hours | Versioning + cross-region replication on the bucket |
| Object storage RTO | < 4 hours | Re-sync from replicated region |

**Directly evidenced by tonight**: the actual data-recovery process tonight was a manually-written, manually-verified backfill script — because point-in-time recovery wasn't set up as an active practice. With Neon PITR properly configured, tonight's recovery would have been a single branch-restore command instead of a multi-hour manual diagnosis-and-recovery session. **Concrete, low-effort win: enable and test Neon PITR before onboarding a second real tenant.**
