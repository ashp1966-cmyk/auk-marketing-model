-- Playbook marketing-document capture (CLAUDE-CODE-BRIEF-playbook-search.md, Part 2).
-- Platform-authored, tenant-visible: deliberately has NO tenant_id. Every tenant reads the same
-- rows; only a caller whose OWN tenants row has plan_code = 'internal' (AUK) may write. This is
-- the one table in the app that is intentionally NOT tenant-isolated. Do not copy this pattern
-- for tenant-owned data. One document per category; upload replaces via upsert.
create table if not exists playbook_documents (
  category    text primary key,
  filename    text not null,
  mime_type   text not null,
  content     text not null,
  char_count  integer not null,
  truncated   boolean not null default false,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

alter table playbook_documents enable row level security;

-- READ: any session with a tenant context set. Fails closed if none is set (or if it settled on '').
create policy any_tenant_read on playbook_documents
  for select
  using (nullif(current_setting('app.current_tenant_id', true), '') is not null);

-- WRITE: only if the CALLER's own tenants row is internal. RLS on tenants scopes the subquery to the
-- caller's own row, so another tenant's plan_code can't be consulted or spoofed.
create policy internal_insert on playbook_documents
  for insert
  with check (exists (select 1 from tenants where id = current_setting('app.current_tenant_id', true) and plan_code = 'internal'));

create policy internal_update on playbook_documents
  for update
  using      (exists (select 1 from tenants where id = current_setting('app.current_tenant_id', true) and plan_code = 'internal'))
  with check (exists (select 1 from tenants where id = current_setting('app.current_tenant_id', true) and plan_code = 'internal'));

create policy internal_delete on playbook_documents
  for delete
  using (exists (select 1 from tenants where id = current_setting('app.current_tenant_id', true) and plan_code = 'internal'));

grant select, insert, update, delete on playbook_documents to tenant_app;
