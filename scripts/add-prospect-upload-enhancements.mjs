// One-off runner for scripts/add-prospect-upload-enhancements.sql
// (CLAUDE-CODE-BRIEF-manual-prospect-upload.md — optional service at upload + website field).
//
// Usage:
//   node scripts/add-prospect-upload-enhancements.mjs --target-db-url=<owner connection string>
//   node scripts/add-prospect-upload-enhancements.mjs --target-db-url=<owner connection string> --write
//
// Defaults to a dry run (prints the DDL it would execute, touches nothing). Pass --write
// to actually run it. --target-db-url must be the owner-role connection string (same
// role scripts/backfill-auk-category-b.mjs and api/cron-follow-up.js use) -- required
// explicitly, no default, so it's always clear which database is being targeted.
// Runs each statement separately -- the neon-http driver's sql.query() executes one
// statement per call, not a semicolon-delimited batch.

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
  console.error('Usage: node scripts/add-prospect-upload-enhancements.mjs --target-db-url=<owner connection string> [--write]');
  process.exit(1);
}

const raw = readFileSync(new URL('./add-prospect-upload-enhancements.sql', import.meta.url), 'utf8');
const statements = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

if (!args.write) {
  console.log('DRY RUN -- would execute:\n');
  statements.forEach((s, i) => console.log(`${i + 1}. ${s};`));
  console.log('\nRe-run with --write to actually apply this.');
  process.exit(0);
}

const sql = neon(args['target-db-url']);

async function run() {
  for (const stmt of statements) {
    await sql.query(stmt);
    console.log('OK:', stmt);
  }
}

run().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
