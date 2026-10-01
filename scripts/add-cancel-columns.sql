-- Self-service subscription cancellation columns
-- (CLAUDE-CODE-BRIEF-subscription-cancellation.md, Steps 2-4).
-- NOT YET RUN ANYWHERE. Review before executing.
--
-- Run order: rls-test Neon branch first, only then production, after explicit approval.
-- Run the migration BEFORE deploying the code that reads/writes these columns (all three are
-- nullable/defaulted, so the migration is safe on its own; the reverse order would make
-- /api/billing/status, /api/billing/cancel and the webhook's subscription.* branches fail
-- against missing columns).
--
-- cancel_at_period_end: true once a cancellation is pending (access continues through
--   paid_until, no further charges). billing_status deliberately stays 'active' until the
--   period-end job flips it.
-- cancel_reason: optional one-line churn signal from the client, never required.
-- cancel_requested_at: when the pending cancellation was recorded.
--
-- No new grants/policies needed on `tenants`: same reasoning as add-billing-columns.sql --
-- it already has row-level security scoped by `id` and `tenant_app` already holds
-- select/insert/update/delete on the whole table, so these new columns are automatically
-- covered.
alter table tenants add column if not exists cancel_at_period_end boolean not null default false;
alter table tenants add column if not exists cancel_reason text;
alter table tenants add column if not exists cancel_requested_at timestamptz;
