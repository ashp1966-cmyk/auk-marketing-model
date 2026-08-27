// One-off runner for scripts/add-hubspot-token-column.sql
// (CLAUDE-CODE-BRIEF-hubspot-per-tenant.md, Step 1).
//
// Usage:
//   node scripts/add-hubspot-token-column.mjs --target-db-url=<owner connection string>
//   node scripts/add-hubspot-token-column.mjs --target-db-url=<owner connection string> --write
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
  console.error('Usage: node scripts/add-hubspot-token-column.mjs --target-db-url=<owner connection string> [--write]');
  process.exit(1);
}

const raw = readFileSync(new URL('./add-hubspot-token-column.sql', import.meta.url), 'utf8');
const stmt = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .trim();

if (!args.write) {
  console.log('DRY RUN -- would execute:\n');
  console.log(stmt);
  console.log('\nRe-run with --write to actually apply this.');
  process.exit(0);
}

const sql = neon(args['target-db-url']);

async function run() {
  await sql.query(stmt);
  console.log('OK:', stmt.replace(/\n/g, ' '));
}

run().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
