-- Playbook marketing-document capture (CLAUDE-CODE-BRIEF-playbook-search.md, Part 2).
-- One document per (tenant, category): a new upload replaces the last via upsert.
-- Dedicated table, deliberately NOT tenant_data -- avoids the full-snapshot autosave /
-- stale-tab overwrite gap documented in CLAUDE.md.
create table if not exists playbook_documents (
  tenant_id   text not null,
  category    text not null,
  filename    text not null,
  mime_type   text not null,
  content     text not null,
  char_count  integer not null,
  truncated   boolean not null default false,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  primary key (tenant_id, category)
);

alter table playbook_documents enable row level security;
create policy tenant_isolation on playbook_documents
  for all
  using (tenant_id = current_setting('app.current_tenant_id', true))
  with check (tenant_id = current_setting('app.current_tenant_id', true));

grant select, insert, update, delete on playbook_documents to tenant_app;
