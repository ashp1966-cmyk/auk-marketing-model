-- Manual prospect upload enhancements (CLAUDE-CODE-BRIEF-manual-prospect-upload.md):
-- 1. Optional service at upload time — an uploaded batch may have no service_name yet.
-- 2. Per-contact service override — set only when a service is chosen at draft time
--    for a prospect whose run has no service_name of its own.
-- 3. Website field on the upload path, synced to HubSpot's standard `website` property.
alter table prospect_runs alter column service_name drop not null;
alter table prospects add column if not exists service_name text;
alter table prospects add column if not exists website text;
