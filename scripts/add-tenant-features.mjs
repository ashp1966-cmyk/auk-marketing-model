// One-off runner for scripts/add-tenant-features.sql (CLAUDE-CODE-BRIEF-trend-radar-switch.md).
//
// Usage:
//   node scripts/add-tenant-features.mjs --target-db-url=<owner connection string>            (dry run)
//   node scripts/add-tenant-features.mjs --target-db-url=<owner connection string> --write
//
// Dry run by default. BOTH modes first run a read-only PREFLIGHT against the target and abort if it fails:
// Postgres version (printed), tenants table present, role tenant_app present (the grant needs it), NO default
// ACL granting tenant_app anything (it could silently add write privileges to the new table), and
// tenant_features NOT already there (create-if-not-exists would skip it and the policy would then fail).
// --write then runs the statements one at a time (neon-http executes one statement per call), stops at the
// first error naming the statement, and finishes with verify(), which ASSERTS and exits 1 on any mismatch:
// row level security on and NOT forced (the admin endpoint writes as the owner), exactly one policy
// (tenant_reads_own), tenant_app's EFFECTIVE privileges (has_table_privilege: SELECT true; INSERT, UPDATE,
// DELETE, TRUNCATE, REFERENCES, TRIGGER false; has_any_column_privilege INSERT and UPDATE false), and 0 rows.
// Prints only the host and the first 8 characters of the connected role: never the connection string.
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
  console.error('Usage: node scripts/add-tenant-features.mjs --target-db-url=<owner connection string> [--write]');
  process.exit(1);
}

const raw = readFileSync(new URL('./add-tenant-features.sql', import.meta.url), 'utf8');
const statements = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

console.log('Target host:', new URL(args['target-db-url']).host);
const sql = neon(args['target-db-url']);

async function preflight() {
  const problems = [];
  const [{ v }] = await sql.query("select current_setting('server_version') as v");
  console.log(`Postgres version: ${v}`);
  const [{ role }] = await sql.query('select current_user as role');
  console.log(`Connected as role starting: ${role.slice(0, 8)}`);

  const [{ tn }] = await sql.query("select to_regclass('public.tenants') as tn");
  console.log(`tenants table exists: ${tn !== null}`);
  if (tn === null) problems.push('tenants table is missing (isFeatureEnabled joins it)');

  const ta = await sql.query("select 1 from pg_roles where rolname = 'tenant_app'");
  console.log(`role tenant_app exists: ${ta.length === 1}`);
  if (ta.length !== 1) problems.push('role tenant_app does not exist (the grant would fail)');

  const acl = await sql.query("select 1 from pg_default_acl where defaclacl::text like '%tenant_app%'");
  console.log(`default ACLs mentioning tenant_app: ${acl.length}`);
  if (acl.length > 0) problems.push('a default ACL grants tenant_app privileges on new tables (could add write access)');

  const [{ t }] = await sql.query("select to_regclass('public.tenant_features') as t");
  console.log(`tenant_features already exists: ${t !== null}`);
  if (t !== null) problems.push('tenant_features already exists on this database');
  return problems;
}

// Prints what it finds, then ASSERTS. Returns the list of mismatches.
async function verify() {
  const bad = [];
  console.log('\nVerification:');
  const cols = await sql.query("select column_name from information_schema.columns where table_name = 'tenant_features' order by ordinal_position");
  console.log('  columns:', cols.map((c) => c.column_name).join(', '));

  const [{ rls, forced }] = await sql.query("select relrowsecurity as rls, relforcerowsecurity as forced from pg_class where relname = 'tenant_features'");
  console.log(`  row level security: enabled=${rls} forced=${forced}`);
  if (rls !== true) bad.push('row level security is not enabled');
  if (forced !== false) bad.push('row level security is FORCED (the admin endpoint writes as the owner and would be blocked)');

  const pol = await sql.query("select policyname, cmd from pg_policies where tablename = 'tenant_features' order by policyname");
  console.log(`  policies (${pol.length}):`, pol.map((p) => `${p.policyname}/${p.cmd}`).join(', '));
  if (pol.length !== 1 || pol[0].policyname !== 'tenant_reads_own' || pol[0].cmd !== 'SELECT') bad.push('expected exactly one policy: tenant_reads_own (SELECT)');

  // Explicit grant rows, printed for information only: NOT relied on, because they miss privileges that
  // arrive through PUBLIC or role membership.
  const g = await sql.query("select privilege_type from information_schema.role_table_grants where table_name = 'tenant_features' and grantee = 'tenant_app' order by privilege_type");
  console.log('  explicit grants to tenant_app (informational):', g.map((x) => x.privilege_type).join(', ') || '(none)');

  // What is ASSERTED: the EFFECTIVE privileges. has_table_privilege counts everything tenant_app can
  // actually do on the table, however it got there.
  const eff = {};
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
    const [{ ok }] = await sql.query("select has_table_privilege('tenant_app', 'public.tenant_features', $1::text) as ok", [p]);
    eff[p] = ok;
  }
  console.log('  tenant_app EFFECTIVE table privileges:', Object.entries(eff).map(([k, v]) => `${k}=${v}`).join(' '));
  if (eff.SELECT !== true) bad.push('tenant_app does not have effective SELECT');
  for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
    if (eff[p] !== false) bad.push(`tenant_app has effective ${p} privilege (must be false)`);
  }
  // Column-level grants can allow writes even when the table-level privilege is false.
  for (const p of ['INSERT', 'UPDATE']) {
    const [{ ok }] = await sql.query("select has_any_column_privilege('tenant_app', 'public.tenant_features', $1::text) as ok", [p]);
    console.log(`  has_any_column_privilege('tenant_app', 'tenant_features', '${p}'):`, ok);
    if (ok !== false) bad.push(`tenant_app has a column-level ${p} privilege (must be false)`);
  }

  const [{ n }] = await sql.query('select count(*)::int as n from tenant_features');
  console.log('  rows:', n);
  if (n !== 0) bad.push(`expected 0 rows, found ${n}`);
  return bad;
}

async function main() {
  const problems = await preflight();
  if (problems.length) {
    console.error('\nPREFLIGHT FAILED, nothing was changed:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('Preflight OK.');

  if (!args.write) {
    console.log('\nDRY RUN -- would execute:\n');
    statements.forEach((s, i) => console.log(`${i + 1}. ${s};`));
    console.log('\nRe-run with --write to actually apply this.');
    return;
  }
  for (let i = 0; i < statements.length; i++) {
    try {
      await sql.query(statements[i]);
      console.log(`OK (${i + 1}/${statements.length}):`, statements[i].split('\n')[0]);
    } catch (e) {
      console.error(`FAILED at statement ${i + 1}/${statements.length}: ${e.message}\n  ${statements[i].split('\n')[0]}`);
      process.exit(1);
    }
  }
  const bad = await verify();
  if (bad.length) {
    console.error('\nVERIFY FAILED:\n - ' + bad.join('\n - '));
    process.exit(1);
  }
  console.log('\nVerify OK.');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
