// One-off runner for scripts/rls-tenant-isolation.sql — generates a fresh tenant_app
// password at execution time, substitutes it into the SQL in memory only (never written
// back to the .sql file, never printed in full), and runs the statements against the
// target database.
//
// Usage:
//   node scripts/run-rls-setup.mjs --target-db-url=<owner connection string> --label=<name>
//   node scripts/run-rls-setup.mjs --target-db-url=<owner connection string> --label=<name> --rotate-only
//
// --rotate-only: skip the DDL (role/grants/policies already exist — e.g. re-running
// against rls-test after the first setup pass) and just issue a fresh
// `ALTER ROLE tenant_app WITH PASSWORD ...`.
//
// --target-db-url must be the existing owner-role connection string (same role
// scripts/backfill-auk-category-b.mjs and api/cron-follow-up.js use) — required
// explicitly, no default, so it's always clear which database is being targeted.
//
// Output: writes the resulting tenant_app connection string to .env.tenant_app-<label>
// (gitignored via the repo's existing `.env*` rule) as DATABASE_URL_TENANT_APP. Only a
// redacted confirmation (host + first 8 chars of the password) is ever printed.

import { neon } from '@neondatabase/serverless';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (arg.startsWith('--')) args[arg.slice(2)] = true;
  }
  return args;
}

const args = parseArgs();
if (!args['target-db-url'] || !args.label) {
  console.error('Usage: node scripts/run-rls-setup.mjs --target-db-url=<owner connection string> --label=<name> [--rotate-only]');
  process.exit(1);
}

const targetUrl = args['target-db-url'];
const label = args.label;
const rotateOnly = !!args['rotate-only'];
const password = randomBytes(24).toString('base64url');

const sql = neon(targetUrl);

async function run() {
  if (rotateOnly) {
    // ALTER ROLE ... PASSWORD doesn't support bind parameters, so the generated value is
    // interpolated directly here — it's a freshly-made random string, not user input.
    await sql.query(`alter role tenant_app with password '${password}'`);
    console.log('Rotated tenant_app password.');
  } else {
    const raw = readFileSync(new URL('./rls-tenant-isolation.sql', import.meta.url), 'utf8');
    if (!raw.includes('__TENANT_APP_PASSWORD__')) {
      throw new Error('Placeholder __TENANT_APP_PASSWORD__ not found in rls-tenant-isolation.sql — refusing to run against unexpected content.');
    }
    const substituted = raw.replace('__TENANT_APP_PASSWORD__', password);
    const noComments = substituted.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const stmts = noComments.split(';').map((s) => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await sql.query(stmt);
      console.log('OK:', stmt.slice(0, 70).replace(/\n/g, ' '));
    }
  }

  const outUrl = new URL(targetUrl);
  outUrl.username = 'tenant_app';
  outUrl.password = password;
  const outPath = new URL(`../.env.tenant_app-${label}`, import.meta.url);
  writeFileSync(outPath, `DATABASE_URL_TENANT_APP="${outUrl.toString()}"\n`);

  console.log(`\nWrote tenant_app connection string to .env.tenant_app-${label} (gitignored, not printed here).`);
  console.log(`Host: ${outUrl.hostname}  Password starts with: ${password.slice(0, 8)}...`);
}

run().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
