-- Row-Level Security for tenant isolation (AUKPILOT-scale-architecture-spec.md, Task 3.2).
-- NOT YET RUN ANYWHERE. Review before executing.
--
-- Run order: rls-test Neon branch first (validate with scripts/rls-tenant-isolation-test.mjs
-- or equivalent), only then production, after explicit approval.
--
-- Why a new role: the existing `neondb_owner` role owns every table below (confirmed via
-- pg_tables.tableowner on the rls-test branch). Postgres RLS policies do NOT apply to a
-- table's owner by default -- enabling RLS while all app traffic still runs as the owner
-- would be a silent no-op. `tenant_app` is a new, non-owner, NOSUPERUSER, NOBYPASSRLS role
-- so policies actually bind to it. The owner role keeps working unrestricted for
-- api/cron-follow-up.js and scripts/*.mjs, which are deliberately cross-tenant.
--
-- __TENANT_APP_PASSWORD__ is a placeholder, not a real value -- run this file only via
-- scripts/run-rls-setup.mjs, which substitutes a freshly-generated password in memory at
-- execution time and never writes it back to this file. Do not hand-edit this placeholder
-- to a literal password and commit that.

create role tenant_app with login password '__TENANT_APP_PASSWORD__' nosuperuser nocreatedb nocreaterole nobypassrls;

grant connect on database neondb to tenant_app;
grant usage on schema public to tenant_app;

grant select, insert, update, delete on
  tenant_data, tenant_activity, prospects, prospect_runs, outreach_emails, tenant_usage, tenants
  to tenant_app;

-- id columns are bigserial (nextval-backed) on these five tables -- tenant_app needs
-- sequence USAGE to insert. tenants.id and tenant_data have no serial id, nothing needed.
grant usage, select on sequence
  tenant_activity_id_seq, prospect_runs_id_seq, prospects_id_seq, outreach_emails_id_seq, tenant_usage_id_seq
  to tenant_app;

-- --- RLS policies ---
-- FOR ALL + WITH CHECK on every table: the spec's example only showed USING, which
-- constrains what tenant_app can SELECT/UPDATE/DELETE but leaves INSERT unchecked -- a
-- request could still write a row tagged with a different tenant_id even though it could
-- never read that row back. WITH CHECK closes that: an insert/update whose tenant_id
-- doesn't match app.current_tenant_id is rejected outright, not just hidden later.
--
-- `current_setting('app.current_tenant_id', true)` -- the `true` (missing_ok) makes an
-- unset GUC return NULL instead of raising, so a connection that forgot to call
-- set_config() sees tenant_id = NULL for every row, i.e. rejected/empty, not "everything."

alter table tenant_data enable row level security;
create policy tenant_isolation on tenant_data
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true))
  with check (tenant_id = current_setting('app.current_tenant_id', true));

alter table tenant_activity enable row level security;
create policy tenant_isolation on tenant_activity
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true))
  with check (tenant_id = current_setting('app.current_tenant_id', true));

alter table prospects enable row level security;
create policy tenant_isolation on prospects
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true))
  with check (tenant_id = current_setting('app.current_tenant_id', true));

alter table prospect_runs enable row level security;
create policy tenant_isolation on prospect_runs
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true))
  with check (tenant_id = current_setting('app.current_tenant_id', true));

alter table outreach_emails enable row level security;
create policy tenant_isolation on outreach_emails
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true))
  with check (tenant_id = current_setting('app.current_tenant_id', true));

alter table tenant_usage enable row level security;
create policy tenant_isolation on tenant_usage
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true))
  with check (tenant_id = current_setting('app.current_tenant_id', true));

-- tenants uses `id`, not `tenant_id` -- it's the tenant registry itself, not tenant-owned
-- content, but the app still reads/writes its own row via this role (tenant-data.js's
-- upsert, send-outreach.js's `select name from tenants`), so it needs the same scoping.
alter table tenants enable row level security;
create policy tenant_isolation on tenants
  for all
  using (id = current_setting('app.current_tenant_id', true))
  with check (id = current_setting('app.current_tenant_id', true));
