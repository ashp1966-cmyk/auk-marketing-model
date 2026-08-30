// One-off migration: sets plan_code = 'internal' on AUK's own tenant row.
// Part of CLAUDE-CODE-BRIEF-trial-gating.md — the trial-gating design exempts AUK's own
// tenant from trial caps/expiry via a `plan_code = 'internal'` sentinel, but as of
// 2026-08-28 that sentinel was never actually written anywhere: AUK's row (like every
// other tenant's) has plan_code = null and billing_status = 'trialing'. Without this
// backfill, AUK's own production tenant would gate itself out once trial-gating ships.
//
// Usage:
//   node scripts/backfill-internal-plan-code.mjs --list                       (read-only, default)
//   node scripts/backfill-internal-plan-code.mjs --tenant-id=<id> --write     (writes)
//
// Safe by design:
// - Defaults to --list: prints every row in `tenants` (id, name, plan_code, billing_status)
//   and exits. No writes happen without --write.
// - Requires an exact --tenant-id to write, no "just pick the AUK-looking row" auto-detection.
// - Only ever touches plan_code on the targeted row — no other column read or written.
//
// Intentionally uses the owner DATABASE_URL, not api/_lib/db.js's tenant_app role —
// admin/migration scripts are deliberately cross-tenant. See scripts/rls-tenant-isolation.sql.

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envLocal = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of envLocal.split('\n')) {
    const m = line.match(/^DATABASE_URL="?(.*?)"?\s*$/);
    if (m) return m[1];
  }
  throw new Error('DATABASE_URL not found in environment or .env.local');
}

const sql = neon(loadDatabaseUrl());

const args = process.argv.slice(2);
const write = args.includes('--write');
const tenantIdArg = args.find((a) => a.startsWith('--tenant-id='));
const tenantId = tenantIdArg ? tenantIdArg.split('=')[1] : null;

async function list() {
  const rows = await sql`select id, name, plan_code, billing_status from tenants order by created_at`;
  console.log('tenants:');
  for (const r of rows) {
    console.log(`  ${r.id}  ${r.name}  plan_code=${r.plan_code ?? 'null'}  billing_status=${r.billing_status}`);
  }
}

async function write_() {
  if (!tenantId) {
    console.error('--write requires an explicit --tenant-id=<id>');
    process.exit(1);
  }
  const { rows: before } = { rows: await sql`select id, name, plan_code from tenants where id = ${tenantId}` };
  if (before.length === 0) {
    console.error(`No tenant found with id ${tenantId}`);
    process.exit(1);
  }
  console.log('Before:', before[0]);
  const after = await sql`
    update tenants set plan_code = 'internal' where id = ${tenantId}
    returning id, name, plan_code
  `;
  console.log('After:', after[0]);
}

if (write) {
  await write_();
} else {
  await list();
}
