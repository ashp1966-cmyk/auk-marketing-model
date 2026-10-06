// RLS test for tech_trend_reports (CLAUDE-CODE-BRIEF-tech-trend.md). Runs against the rls-test branch only.
//
// Usage: node scripts/tech-trend-rls-test.mjs
//
// tenant_app HAS select/insert/update/delete grants on this table, so what blocks a non-internal tenant is the ROW
// LEVEL SECURITY POLICIES, not a missing privilege: an INSERT is rejected by the policy (SQLSTATE 42501, "new row
// violates row-level security policy"), and an UPDATE or DELETE simply matches zero rows. So those cases assert
// the policy rejection / zero rows AND that the rows are byte-identical afterwards. TRUNCATE is not attempted
// (RLS does not apply to it): it is checked with has_table_privilege.
// Checks run as tenant_app (DATABASE_URL_TENANT_APP), each inside begin / set_config('app.current_tenant_id', ..., true)
// / commit, mirroring api/_lib/db.js's withTenant(). Fixtures and cleanup use the owner connection (DATABASE_URL).
// SAFETY: aborts unless BOTH hosts are the rls-test branch (ep-royal-heart); prints only hosts. The table has no
// tenant_id, so it REFUSES to run if tech_trend_reports already holds any row. Cleanup deletes by exact id
// (the seeded report ids plus every id the internal tenant creates) and the three fixture tenant ids, in a finally
// block. Afterwards a READ-ONLY count by prefix (never a delete by prefix) fails the run on any leftover.
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readFileSync } from 'fs';

neonConfig.webSocketConstructor = ws;

function envVar(name) {
  if (process.env[name]) return process.env[name];
  const envLocal = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const m = envLocal.match(new RegExp(`^${name}=["']?([^"'\\r\\n]+)["']?`, 'm'));
  if (!m) throw new Error(`${name} not found in environment or .env.local`);
  return m[1];
}

const appUrl = envVar('DATABASE_URL_TENANT_APP');
const ownerUrl = envVar('DATABASE_URL');
const appHost = new URL(appUrl).host;
const ownerHost = new URL(ownerUrl).host;
console.log('tenant_app host:', appHost);
console.log('owner host:     ', ownerHost);
if (!appHost.includes('ep-royal-heart') || !ownerHost.includes('ep-royal-heart')) {
  console.error('REFUSING: both connections must target the rls-test branch (ep-royal-heart).');
  process.exit(1);
}

const appPool = new Pool({ connectionString: appUrl });
const ownerPool = new Pool({ connectionString: ownerUrl });

const TENANT_PREFIX = 'rlstest_tt_';
const TITLE_PREFIX = 'RLSTEST_TT_';
const ADMIN = TENANT_PREFIX + 'admin';        // plan_code 'internal'
const CUSTOMER = TENANT_PREFIX + 'customer';  // an ordinary tenant
const GHOST = TENANT_PREFIX + 'ghost';        // has NO tenants row at all
const tenantIds = [ADMIN, CUSTOMER, GHOST];
const reportIds = [];                         // every report id this test creates, for exact-id cleanup

// Same shape as withTenant(); tenantId === null means "never call set_config".
async function asTenant(tenantId, fn) {
  const client = await appPool.connect();
  try {
    await client.query('begin');
    if (tenantId !== null) await client.query("select set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

let failures = 0;
function report(name, pass, detail = '') {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}
// Runs fn; true only if it failed with SQLSTATE 42501 AND the message names row-level security (the POLICY did it,
// not a missing privilege, which would say "permission denied for table").
async function rejectedByPolicy(fn) {
  try { await fn(); return { rejected: false, detail: 'statement succeeded' }; }
  catch (e) { return { rejected: e.code === '42501' && /row-level security/i.test(e.message), detail: `code=${e.code}` }; }
}
const COLS = 'id, title, topic, body, sources, as_of::text as as_of, published_by, published_at, updated_by, updated_at';
const ownerRows = async () => (await ownerPool.query(`select ${COLS} from tech_trend_reports where id = any($1) order by id`, [reportIds])).rows;
const snapshot = (rows) => JSON.stringify(rows);
const totalRows = async () => (await ownerPool.query('select count(*)::int as n from tech_trend_reports')).rows[0].n;

check_fixture_ids();
function check_fixture_ids() {
  report('fixture tenant id list has all three distinct ids, each with the rlstest_tt_ prefix',
    tenantIds.length === 3 && new Set(tenantIds).size === 3 && tenantIds.every((i) => i.startsWith(TENANT_PREFIX)), `length=${tenantIds.length}`);
}

let created = false;
async function main() {
  const [{ t }] = (await ownerPool.query("select to_regclass('public.tech_trend_reports') as t")).rows;
  if (t === null) { console.error('REFUSING: tech_trend_reports does not exist on this database.'); process.exitCode = 2; return; }
  if ((await totalRows()) !== 0) { console.error('REFUSING: tech_trend_reports is not empty. Remove those rows by hand first; this test never deletes rows it did not create.'); process.exitCode = 2; return; }
  const preT = await ownerPool.query('select 1 from tenants where id = any($1)', [tenantIds]);
  if (preT.rows.length) { console.error('REFUSING: fixture tenant ids already exist.'); process.exitCode = 2; return; }

  created = true;  // BEFORE inserting: a partial failure is still cleaned up by exact id
  await ownerPool.query(
    `insert into tenants (id, name, billing_status, plan_code) values ($1, 'RLS Test TT admin', 'trialing', 'internal'), ($2, 'RLS Test TT customer', 'active', null)`,
    [ADMIN, CUSTOMER]);   // GHOST deliberately gets no tenants row
  for (const [title, as_of] of [[TITLE_PREFIX + 'one', '2026-09-01'], [TITLE_PREFIX + 'two', '2026-09-15']]) {
    const { rows } = await ownerPool.query(
      `insert into tech_trend_reports (title, topic, body, sources, as_of, published_by) values ($1, 'topic', 'body text', '[{"name":"Src","url":"https://example.com"}]'::jsonb, $2::date, 'fixture') returning id`, [title, as_of]);
    reportIds.push(rows[0].id);
  }
  report('seeded exactly two fixture reports', reportIds.length === 2 && new Set(reportIds).size === 2, `ids=${reportIds.length}`);
  const [R1, R2] = reportIds;
  const before = snapshot(await ownerRows());

  // --- reads: any tenant context may read the shared reports
  const cust = await asTenant(CUSTOMER, (c) => c.query('select id from tech_trend_reports where id = any($1) order by id', [reportIds]));
  report('1. a non-internal tenant READS both reports (shared, platform-authored)', cust.rows.length === 2, `rows=${cust.rows.length}`);
  const adm = await asTenant(ADMIN, (c) => c.query('select id from tech_trend_reports where id = any($1) order by id', [reportIds]));
  report('2. the internal tenant reads both reports', adm.rows.length === 2, `rows=${adm.rows.length}`);

  // --- a non-internal tenant cannot write: the POLICY stops it (tenant_app has the grants)
  let r = await rejectedByPolicy(() => asTenant(CUSTOMER, (c) => c.query(
    "insert into tech_trend_reports (title, body, as_of) values ($1, 'x', '2026-10-01')", [TITLE_PREFIX + 'forged'])));
  report('3a. non-internal INSERT is rejected by the row-level-security policy (SQLSTATE 42501)', r.rejected, r.detail);
  r = await rejectedByPolicy(() => asTenant(CUSTOMER, (c) => c.query(
    "insert into tech_trend_reports (title, body, as_of, published_by) values ($1, 'x', '2026-10-01', 'someone') returning id", [TITLE_PREFIX + 'forged2'])));
  report('3b. ...also with RETURNING and a made-up published_by', r.rejected, r.detail);
  const upd = await asTenant(CUSTOMER, (c) => c.query("update tech_trend_reports set title = $1 where id = $2", [TITLE_PREFIX + 'hijacked', R1]));
  report('4a. non-internal UPDATE of a specific report matches 0 rows (the policy hides it)', upd.rowCount === 0, `rowCount=${upd.rowCount}`);
  const updAll = await asTenant(CUSTOMER, (c) => c.query("update tech_trend_reports set body = 'wiped'"));
  report('4b. non-internal UPDATE with no WHERE matches 0 rows', updAll.rowCount === 0, `rowCount=${updAll.rowCount}`);
  const del = await asTenant(CUSTOMER, (c) => c.query('delete from tech_trend_reports where id = $1', [R2]));
  report('5a. non-internal DELETE of a specific report removes 0 rows', del.rowCount === 0, `rowCount=${del.rowCount}`);
  const delAll = await asTenant(CUSTOMER, (c) => c.query('delete from tech_trend_reports'));
  report('5b. non-internal DELETE with no WHERE removes 0 rows', delAll.rowCount === 0, `rowCount=${delAll.rowCount}`);

  // --- a tenant id with no tenants row: can read (a context is set), cannot write
  const ghostRead = await asTenant(GHOST, (c) => c.query('select id from tech_trend_reports where id = any($1)', [reportIds]));
  report('6a. a tenant id with NO tenants row can read (context is set)', ghostRead.rows.length === 2, `rows=${ghostRead.rows.length}`);
  r = await rejectedByPolicy(() => asTenant(GHOST, (c) => c.query("insert into tech_trend_reports (title, body, as_of) values ($1, 'x', '2026-10-01')", [TITLE_PREFIX + 'ghost'])));
  report('6b. ...but its INSERT is rejected by the policy (no tenants row, so not internal)', r.rejected, r.detail);
  const ghostUpd = await asTenant(GHOST, (c) => c.query("update tech_trend_reports set title = 'x' where id = $1", [R1]));
  const ghostDel = await asTenant(GHOST, (c) => c.query('delete from tech_trend_reports where id = $1', [R1]));
  report('6c. ...and its UPDATE and DELETE match 0 rows', ghostUpd.rowCount === 0 && ghostDel.rowCount === 0, `update=${ghostUpd.rowCount} delete=${ghostDel.rowCount}`);

  // --- no context / empty context
  const unset = await asTenant(null, (c) => c.query('select id from tech_trend_reports'));
  report('7. no tenant context (set_config never called) -> zero rows', unset.rows.length === 0, `rows=${unset.rows.length}`);
  const empty = await asTenant('', (c) => c.query('select id from tech_trend_reports'));
  report("8. tenant context set to '' -> zero rows", empty.rows.length === 0, `rows=${empty.rows.length}`);

  // --- nothing above changed anything
  report('9. owner view: both reports are byte-identical after every attempt above', snapshot(await ownerRows()) === before);
  report('10. the table still holds exactly the two seeded rows', (await totalRows()) === 2);

  // --- TRUNCATE is not attempted (RLS does not apply to it): ask the catalog
  const [{ trunc }] = (await ownerPool.query("select has_table_privilege('tenant_app', 'public.tech_trend_reports', 'TRUNCATE') as trunc")).rows;
  report("11. tenant_app has no TRUNCATE privilege: has_table_privilege(...'TRUNCATE') = false", trunc === false, `has_table_privilege=${trunc}`);

  // --- the internal tenant can insert, update and delete
  const ins = await asTenant(ADMIN, (c) => c.query(
    "insert into tech_trend_reports (title, topic, body, sources, as_of, published_by) values ($1, 'new topic', 'new body', '[]'::jsonb, '2026-10-02', 'admin-user') returning id, published_at, updated_at, updated_by", [TITLE_PREFIX + 'by_admin']));
  const newId = ins.rows[0]?.id;
  if (newId) reportIds.push(newId);
  report('12a. the internal tenant can INSERT; defaults apply (uuid id, published_at set, updated_at/updated_by null)',
    !!newId && ins.rows[0].published_at != null && ins.rows[0].updated_at === null && ins.rows[0].updated_by === null, `id=${newId ? 'uuid' : 'none'}`);
  // A RAW update that sets only the title: the table must not fill updated_by / updated_at on its own.
  const up = await asTenant(ADMIN, (c) => c.query('update tech_trend_reports set title = $1 where id = $2 returning title, updated_by, updated_at', [TITLE_PREFIX + 'edited', R1]));
  report('12b. the internal tenant can UPDATE an existing report (1 row, new title)', up.rowCount === 1 && up.rows[0].title === TITLE_PREFIX + 'edited', `rowCount=${up.rowCount}`);
  report('12b2. after that raw UPDATE, updated_by is STILL null (and so is updated_at): the endpoint sets them, not the table', up.rows[0]?.updated_by === null && up.rows[0]?.updated_at === null, `updated_by=${up.rows[0]?.updated_by} updated_at=${up.rows[0]?.updated_at}`);
  const seen = await asTenant(CUSTOMER, (c) => c.query('select title from tech_trend_reports where id = $1', [R1]));
  report("12c. ...and the non-internal tenant then reads the edited title (the shared copy changed for everyone)", seen.rows.length === 1 && seen.rows[0].title === TITLE_PREFIX + 'edited');
  const delOne = await asTenant(ADMIN, (c) => c.query('delete from tech_trend_reports where id = $1', [newId]));
  report('12d. the internal tenant can DELETE a report (1 row)', delOne.rowCount === 1, `rowCount=${delOne.rowCount}`);
  report('12e. the other seeded report (R2) is untouched by the admin writes', (await ownerRows()).filter((x) => x.id === R2).length === 1);

  // --- the table's own CHECK: sources must be a JSON array (owner insert, so it is the constraint, not RLS)
  const chk = await (async () => { try { await ownerPool.query("insert into tech_trend_reports (title, body, as_of, sources) values ($1, 'x', '2026-10-01', '{}'::jsonb)", [TITLE_PREFIX + 'badsources']); return { ok: false, code: 'none' }; } catch (e) { return { ok: e.code === '23514', code: e.code }; } })();
  report("13. a non-array 'sources' is rejected by the CHECK constraint (SQLSTATE 23514)", chk.ok, `code=${chk.code}`);
  // The table has no minimum length on title: blank titles are the ENDPOINT's job to refuse, not the table's.
  const blank = await ownerPool.query("insert into tech_trend_reports (title, body, as_of) values ('', 'x', '2026-10-01') returning id");
  if (blank.rows[0]?.id) reportIds.push(blank.rows[0].id);
  report('13b. the table itself ACCEPTS an empty-string title (the endpoint, not the table, is the guard on blank titles)', blank.rows.length === 1, `rows=${blank.rows.length}`);
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (created) {
      try {
        await ownerPool.query('delete from tech_trend_reports where id = any($1)', [reportIds]);
        await ownerPool.query('delete from tenants where id = any($1)', [tenantIds]);
        console.log('Cleanup: removed the fixture reports and tenants (by exact id)');
        // READ-ONLY leftover count by prefix: counts only, never deletes by prefix.
        const leftReports = (await ownerPool.query('select count(*)::int as n from tech_trend_reports where starts_with(title, $1)', [TITLE_PREFIX])).rows[0].n;
        const leftTenants = (await ownerPool.query('select count(*)::int as n from tenants where starts_with(id, $1)', [TENANT_PREFIX])).rows[0].n;
        report(`leftover reports whose title starts with ${TITLE_PREFIX} after cleanup (read-only count): ${leftReports}`, leftReports === 0);
        report(`leftover tenants whose id starts with ${TENANT_PREFIX} after cleanup (read-only count): ${leftTenants}`, leftTenants === 0);
        report('the table is empty again after cleanup (this also covers the blank-title row, which has no prefix)', (await totalRows()) === 0);
      } catch (e) { failures++; console.error('Cleanup / leftover check failed:', e.message); }
    }
    await appPool.end();
    await ownerPool.end();
    if (process.exitCode === 2) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
