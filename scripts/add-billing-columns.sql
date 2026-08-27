-- Paystack billing columns + webhook_events table
-- (CLAUDE-CODE-BRIEF-paystack-billing.md, Checkpoint 1).
-- NOT YET RUN ANYWHERE. Review before executing.
--
-- Run order: rls-test Neon branch first, only then production, after explicit approval.
--
-- billing_status default 'trialing': every existing tenant row (AUK, Test Client Co) gets
-- normal access on this migration, not immediate suspension -- billing enforcement doesn't
-- exist yet (that's Checkpoint 4), so there's no access-check reading this column yet
-- either way.
--
-- No new grants/policies needed on `tenants`: same reasoning as add-hubspot-token-column.sql
-- -- it already has row-level security scoped by `id` and `tenant_app` already holds
-- select/insert/update/delete on the whole table, so these new columns are automatically
-- covered.
alter table tenants add column if not exists billing_status text not null default 'trialing';
alter table tenants add column if not exists paid_until timestamptz;
alter table tenants add column if not exists paystack_customer_code text;
alter table tenants add column if not exists paystack_subscription_code text;
alter table tenants add column if not exists plan_code text;

-- webhook_events is provider-facing, not tenant-owned content -- it records "did we already
-- process Paystack event X," which by definition spans every tenant at once (a single
-- webhook delivery can't be scoped to one tenant_id ahead of parsing it). Deliberately NOT
-- given RLS or a tenant_id column, and NOT granted to tenant_app -- same reasoning as
-- cron-follow-up.js's cross-tenant queries: the webhook handler (api/webhooks/paystack.js)
-- runs on the owner-role connection (DATABASE_URL / POSTGRES_URL), same as cron and the
-- one-off scripts, not through withTenant().
create table if not exists webhook_events (
  event_id text primary key,
  provider text not null default 'paystack',
  payload jsonb not null,
  processed_at timestamptz default now()
);
