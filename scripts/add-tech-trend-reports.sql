-- Tech Trend: shared reports (CLAUDE-CODE-BRIEF-tech-trend.md). Platform-authored, tenant-visible: NO
-- tenant_id. Every tenant reads; only a caller whose OWN tenants row has plan_code = 'internal' (AUK) may
-- write. Same access model as playbook_documents. Do not copy this pattern for tenant-owned data.
create table if not exists tech_trend_reports (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  topic        text not null default '',
  body         text not null,
  sources      jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  as_of        date not null,
  published_by text,
  published_at timestamptz not null default now(),
  updated_by   text,
  updated_at   timestamptz
);

alter table tech_trend_reports enable row level security;

create policy any_tenant_read on tech_trend_reports
  for select
  using (nullif(current_setting('app.current_tenant_id', true), '') is not null);

create policy internal_insert on tech_trend_reports
  for insert
  with check (exists (select 1 from tenants where id = current_setting('app.current_tenant_id', true) and plan_code = 'internal'));

create policy internal_update on tech_trend_reports
  for update
  using      (exists (select 1 from tenants where id = current_setting('app.current_tenant_id', true) and plan_code = 'internal'))
  with check (exists (select 1 from tenants where id = current_setting('app.current_tenant_id', true) and plan_code = 'internal'));

create policy internal_delete on tech_trend_reports
  for delete
  using (exists (select 1 from tenants where id = current_setting('app.current_tenant_id', true) and plan_code = 'internal'));

-- Start from nothing, then grant exactly what is needed: no TRUNCATE, REFERENCES or TRIGGER, whatever the
-- database's default privileges might have handed out. The write policies above still restrict who can write.
revoke all on tech_trend_reports from tenant_app;
grant select, insert, update, delete on tech_trend_reports to tenant_app;
