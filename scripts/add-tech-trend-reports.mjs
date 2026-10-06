// One-off runner for scripts/add-tech-trend-reports.sql (CLAUDE-CODE-BRIEF-tech-trend.md).
//
// Usage:
//   node scripts/add-tech-trend-reports.mjs --target-db-url=<owner connection string>            (dry run)
//   node scripts/add-tech-trend-reports.mjs --target-db-url=<owner connection string> --write
//
// Dry run by default. BOTH modes first run a read-only PREFLIGHT against the target and abort if it fails:
// Postgres 13 or later with gen_random_uuid() actually callable, tenants.plan_code present (the write policies
// reference it), role tenant_app present (the grant needs it), NO default ACL mentioning tenant_app (it could
// silently add privileges such as TRUNCATE to the new table), and tech_trend_reports NOT already there
// (create-if-not-exists would skip it and the policies would then fail or duplicate).
// --write then runs the statements one at a time (neon-http executes one statement per call), stops at the first
// error naming the statement, and finishes with verify(), which ASSERTS and exits 1 on any mismatch:
//   - exactly the 10 expected columns, in order
//   - row level security on and NOT forced
//   - exactly 4 policies: any_tenant_read (SELECT), internal_insert (INSERT), internal_update (UPDATE),
//     internal_delete (DELETE)
//   - tenant_app's EFFECTIVE privileges via has_table_privilege: SELECT, INSERT, UPDATE, DELETE true;
//     TRUNCATE, REFERENCES, TRIGGER false
//   - 0 rows
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
  console.error('Usage: node scripts/add-tech-trend-reports.mjs --target-db-url=<owner connection string> [--write]');
  process.exit(1);
}

const raw = readFileSync(new URL('./add-tech-trend-reports.sql', import.meta.url), 'utf8');
const statements = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const EXPECTED_COLUMNS = ['id', 'title', 'topic', 'body', 'sources', 'as_of', 'published_by', 'published_at', 'updated_by', 'updated_at'];
const EXPECTED_POLICIES = [['any_tenant_read', 'SELECT'], ['internal_delete', 'DELETE'], ['internal_insert', 'INSERT'], ['internal_update', 'UPDATE']];

console.log('Target host:', new URL(args['target-db-url']).host);
const sql = neon(args['target-db-url']);

async function preflight() {
  const problems = [];
  const [{ v }] = await sql.query("select current_setting('server_version') as v");
  const major = parseInt(v, 10);
  console.log(`Postgres version: ${v}`);
  if (!(major >= 13)) problems.push(`Postgres ${v} is older than 13 (gen_random_uuid() is built in from 13)`);

  let uuidOk = false;
  try { const [{ u }] = await sql.query('select gen_random_uuid()::text as u'); uuidOk = /^[0-9a-f-]{36}$/.test(u); } catch { uuidOk = false; }
  console.log(`gen_random_uuid() callable: ${uuidOk}`);
  if (!uuidOk) problems.push('gen_random_uuid() is not available');

  const [{ role }] = await sql.query('select current_user as role');
  console.log(`Connected as role starting: ${role.slice(0, 8)}`);

  const col = await sql.query("select 1 from information_schema.columns where table_name = 'tenants' and column_name = 'plan_code'");
  console.log(`tenants.plan_code exists: ${col.length === 1}`);
  if (col.length !== 1) problems.push('tenants.plan_code is missing (the write policies reference it)');

  const ta = await sql.query("select 1 from pg_roles where rolname = 'tenant_app'");
  console.log(`role tenant_app exists: ${ta.length === 1}`);
  if (ta.length !== 1) problems.push('role tenant_app does not exist (the grant would fail)');

  const acl = await sql.query("select 1 from pg_default_acl where defaclacl::text like '%tenant_app%'");
  console.log(`default ACLs mentioning tenant_app: ${acl.length}`);
  if (acl.length > 0) problems.push('a default ACL grants tenant_app privileges on new tables (could add privileges such as TRUNCATE)');

  const [{ t }] = await sql.query("select to_regclass('public.tech_trend_reports') as t");
  console.log(`tech_trend_reports already exists: ${t !== null}`);
  if (t !== null) problems.push('tech_trend_reports already exists on this database');
  return problems;
}

// Prints what it finds, then ASSERTS. Returns the list of mismatches.
async function verify() {
  const bad = [];
  console.log('\nVerification:');

  const cols = (await sql.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'tech_trend_reports' order by ordinal_position")).map((c) => c.column_name);
  console.log(`  columns (${cols.length}):`, cols.join(', '));
  if (cols.length !== 10 || cols.join(',') !== EXPECTED_COLUMNS.join(',')) bad.push(`expected exactly these 10 columns in order: ${EXPECTED_COLUMNS.join(', ')}`);

  // Types, nullability and defaults, straight from information_schema.columns.
  const meta = Object.fromEntries((await sql.query(
    "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'tech_trend_reports'"
  )).map((c) => [c.column_name, c]));
  const show = (c) => `${c?.data_type ?? '(missing)'} ${c?.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'} default=${c?.column_default ?? 'none'}`;
  for (const name of EXPECTED_COLUMNS) console.log(`  ${name.padEnd(13)} ${show(meta[name])}`);
  const expectType = (name, type, nullable) => {
    const c = meta[name];
    if (!c) { bad.push(`column ${name} is missing`); return; }
    if (c.data_type !== type) bad.push(`${name} must be ${type}, found ${c.data_type}`);
    if ((c.is_nullable === 'YES') !== nullable) bad.push(`${name} must be ${nullable ? 'nullable' : 'NOT NULL'}, found ${c.is_nullable === 'YES' ? 'nullable' : 'NOT NULL'}`);
  };
  expectType('id', 'uuid', false);
  if (!String(meta.id?.column_default ?? '').includes('gen_random_uuid')) bad.push(`id default must contain gen_random_uuid, found ${meta.id?.column_default ?? 'none'}`);
  for (const name of ['title', 'topic', 'body']) expectType(name, 'text', false);
  expectType('sources', 'jsonb', false);
  expectType('as_of', 'date', false);
  expectType('published_at', 'timestamp with time zone', false);
  expectType('updated_at', 'timestamp with time zone', true);
  if (meta.updated_at?.column_default != null) bad.push(`updated_at must have no default, found ${meta.updated_at.column_default}`);
  for (const name of ['published_by', 'updated_by']) expectType(name, 'text', true);
  // The array check on sources must exist among the table's CHECK constraints.
  const checks = (await sql.query("select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.tech_trend_reports'::regclass and contype = 'c'")).map((r) => r.def);
  console.log('  check constraints:', checks.join(' | ') || '(none)');
  if (!checks.some((d) => d.includes('jsonb_typeof(sources)') && d.includes("'array'"))) bad.push("no CHECK constraint (jsonb_typeof(sources) = 'array') found on the table");

  const [{ rls, forced }] = await sql.query("select relrowsecurity as rls, relforcerowsecurity as forced from pg_class where oid = 'public.tech_trend_reports'::regclass");
  console.log(`  row level security: enabled=${rls} forced=${forced}`);
  if (rls !== true) bad.push('row level security is not enabled');
  if (forced !== false) bad.push('row level security is FORCED (must stay unforced)');

  const pol = (await sql.query("select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'tech_trend_reports' order by policyname")).map((p) => [p.policyname, p.cmd]);
  console.log(`  policies (${pol.length}):`, pol.map((p) => `${p[0]}/${p[1]}`).join(', '));
  if (pol.length !== 4 || JSON.stringify(pol) !== JSON.stringify(EXPECTED_POLICIES)) bad.push('expected exactly 4 policies: any_tenant_read/SELECT, internal_delete/DELETE, internal_insert/INSERT, internal_update/UPDATE');

  // EFFECTIVE privileges (has_table_privilege counts everything tenant_app can actually do, however it got there).
  const eff = {};
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
    const [{ ok }] = await sql.query("select has_table_privilege('tenant_app', 'public.tech_trend_reports', $1::text) as ok", [p]);
    eff[p] = ok;
  }
  console.log('  tenant_app EFFECTIVE table privileges:', Object.entries(eff).map(([k, v]) => `${k}=${v}`).join(' '));
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) if (eff[p] !== true) bad.push(`tenant_app lacks effective ${p}`);
  for (const p of ['TRUNCATE', 'REFERENCES', 'TRIGGER']) if (eff[p] !== false) bad.push(`tenant_app has effective ${p} (must be false)`);

  const [{ n }] = await sql.query('select count(*)::int as n from tech_trend_reports');
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
