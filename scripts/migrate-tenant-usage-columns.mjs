// One-off migration: renames tenant_usage.ai_drafts -> outreach_drafts, adds
// campaign_drafts and trend_radar_scans columns. Same change already run and
// verified on the rls-test Neon branch (see CLAUDE-CODE-BRIEF-trial-gating.md
// Step 1) — this applies the identical statements to a target database.
//
// Usage:
//   node scripts/migrate-tenant-usage-columns.mjs --target-db-url=<owner connection string>              (read-only, default: prints current columns)
//   node scripts/migrate-tenant-usage-columns.mjs --target-db-url=<owner connection string> --write       (runs the migration)
//
// Safe by design:
// - Defaults to --list: prints tenant_usage's current columns and exits. No
//   writes without --write.
// - Only touches tenant_usage's column set — no data read or written.
// - Requires an explicit owner-role --target-db-url (no fallback to any local
//   env var) so this can never accidentally run against the wrong database.

import { neon } from '@neondatabase/serverless';

const args = process.argv.slice(2);
const write = args.includes('--write');
const targetArg = args.find((a) => a.startsWith('--target-db-url='));
if (!targetArg) {
  console.error('Usage: node scripts/migrate-tenant-usage-columns.mjs --target-db-url=<owner connection string> [--write]');
  process.exit(1);
}
const sql = neon(targetArg.slice('--target-db-url='.length));

async function listColumns() {
  const cols = await sql`select column_name, data_type from information_schema.columns where table_name = 'tenant_usage' order by ordinal_position`;
  console.log('tenant_usage columns:');
  for (const c of cols) console.log(`  ${c.column_name}  (${c.data_type})`);
  return cols;
}

async function migrate() {
  const before = await listColumns();
  const hasAiDrafts = before.some((c) => c.column_name === 'ai_drafts');
  const hasOutreachDrafts = before.some((c) => c.column_name === 'outreach_drafts');
  const hasCampaignDrafts = before.some((c) => c.column_name === 'campaign_drafts');
  const hasTrendRadarScans = before.some((c) => c.column_name === 'trend_radar_scans');

  if (hasAiDrafts && !hasOutreachDrafts) {
    console.log('Renaming ai_drafts -> outreach_drafts...');
    await sql`alter table tenant_usage rename column ai_drafts to outreach_drafts`;
  } else {
    console.log(`Skipping rename (ai_drafts present: ${hasAiDrafts}, outreach_drafts present: ${hasOutreachDrafts})`);
  }

  if (!hasCampaignDrafts) {
    console.log('Adding campaign_drafts...');
    await sql`alter table tenant_usage add column campaign_drafts integer not null default 0`;
  } else {
    console.log('Skipping campaign_drafts (already exists)');
  }

  if (!hasTrendRadarScans) {
    console.log('Adding trend_radar_scans...');
    await sql`alter table tenant_usage add column trend_radar_scans integer not null default 0`;
  } else {
    console.log('Skipping trend_radar_scans (already exists)');
  }

  console.log('\nAfter:');
  await listColumns();
}

if (write) {
  await migrate();
} else {
  await listColumns();
}
