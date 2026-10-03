-- Per-tenant feature switches (CLAUDE-CODE-BRIEF-trend-radar-switch.md). A feature is OFF unless the tenant's
-- own row says enabled (a missing row means off). tenant_app may only READ its own rows: there is no insert,
-- update or delete grant or policy, so a tenant cannot switch anything on for itself even through a bug in an
-- endpoint. Writes use the OWNER connection in the admin endpoint only, which works because row level
-- security is deliberately NOT forced on this table (the owner bypasses it): do not add FORCE ROW LEVEL
-- SECURITY here without changing how the admin endpoint writes. Generic table; the allowed keys are enforced
-- in api/_lib/feature-flags.js ('trend_radar' only for now).
create table if not exists tenant_features (
  tenant_id  text not null,
  feature    text not null,
  enabled    boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature)
);

alter table tenant_features enable row level security;

create policy tenant_reads_own on tenant_features
  for select
  using (tenant_id = current_setting('app.current_tenant_id', true));

revoke all on tenant_features from tenant_app;
grant select on tenant_features to tenant_app;
