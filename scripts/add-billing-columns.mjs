// One-off runner for scripts/add-billing-columns.sql
// (CLAUDE-CODE-BRIEF-paystack-billing.md, Checkpoint 1).
//
// Usage:
//   node scripts/add-billing-columns.mjs --target-db-url=<owner connection string>
//   node scripts/add-billing-columns.mjs --target-db-url=<owner connection string> --write
//
// Defaults to a dry run (prints the DDL it would execute, touches nothing). Pass --write
// to actually run it. --target-db-url must be the owner-role connection string (same
// role scripts/backfill-auk-category-b.mjs and api/cron-follow-up.js use) -- required
// explicitly, no default, so it's always clear which database is being targeted.

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

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
if (!args['target-db-url']) {
  console.error('Usage: node scripts/add-billing-columns.mjs --target-db-url=<owner connection string> [--write]');
  process.exit(1);
}

const raw = readFileSync(new URL('./add-billing-columns.sql', import.meta.url), 'utf8');
const noComments = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const stmts = noComments.split(';').map((s) => s.trim()).filter(Boolean);

if (!args.write) {
  console.log('DRY RUN -- would execute:\n');
  for (const stmt of stmts) console.log(stmt + ';\n');
  console.log('Re-run with --write to actually apply this.');
  process.exit(0);
}

const sql = neon(args['target-db-url']);

async function run() {
  for (const stmt of stmts) {
    await sql.query(stmt);
    console.log('OK:', stmt.slice(0, 70).replace(/\n/g, ' '));
  }
}

run().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
