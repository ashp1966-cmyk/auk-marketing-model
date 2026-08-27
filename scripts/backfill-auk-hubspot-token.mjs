// One-off: copy the existing HUBSPOT_ACCESS_TOKEN env value into AUK's own
// tenants.hubspot_token row, so AUK's sync keeps working uninterrupted once
// api/hubspot-sync.js stops reading the env var directly
// (CLAUDE-CODE-BRIEF-hubspot-per-tenant.md, Step 4).
//
// Usage:
//   HUBSPOT_ACCESS_TOKEN=<AUK's real token> node scripts/backfill-auk-hubspot-token.mjs \
//     --target-db-url=<owner connection string> --tenant-id=org_3Hwfnq2gjUUsuE9StI4Hl45G2rO
//   ...same, plus --write to actually apply.
//
// Defaults to dry run (confirms the target row exists and whether it already has a
// token, touches nothing). --tenant-id is required explicitly, no default -- this must
// never silently target "the only row" per this repo's migration-script convention.
// The token itself is read from HUBSPOT_ACCESS_TOKEN (never passed as a CLI arg, which
// would land in shell history) and is never printed, only its length and last 4 chars.

import { neon } from '@neondatabase/serverless';

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
if (!args['target-db-url'] || !args['tenant-id']) {
  console.error('Usage: node scripts/backfill-auk-hubspot-token.mjs --target-db-url=<owner connection string> --tenant-id=<org id> [--write]');
  process.exit(1);
}

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) {
  console.error('HUBSPOT_ACCESS_TOKEN is not set in the environment.');
  process.exit(1);
}

const sql = neon(args['target-db-url']);

async function run() {
  const rows = await sql`select id, name, hubspot_token from tenants where id = ${args['tenant-id']}`;
  if (!rows.length) {
    console.error(`No tenant row found for id ${args['tenant-id']}`);
    process.exit(1);
  }
  const row = rows[0];
  console.log(`Target: ${row.id} (${row.name}) -- currently ${row.hubspot_token ? 'HAS' : 'has NO'} hubspot_token set.`);
  console.log(`Backfill value: length ${token.length}, ends in ...${token.slice(-4)}`);

  if (!args.write) {
    console.log('\nDRY RUN -- re-run with --write to actually apply this.');
    return;
  }

  await sql`update tenants set hubspot_token = ${token} where id = ${args['tenant-id']}`;
  console.log('OK: backfilled hubspot_token for', row.id);
}

run().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
