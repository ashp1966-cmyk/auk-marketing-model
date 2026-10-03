// RLS test for tenant_features (CLAUDE-CODE-BRIEF-trend-radar-switch.md). Runs against the rls-test branch only.
//
// Usage: node scripts/tenant-features-rls-test.mjs
//
// Checks run as the non-owner `tenant_app` role (DATABASE_URL_TENANT_APP from .env.local), each inside
// begin / set_config('app.current_tenant_id', ..., true) / commit, mirroring api/_lib/db.js's withTenant().
// Fixtures and cleanup use the owner connection (DATABASE_URL).
// Safety: refuses to run unless BOTH hosts are the rls-test branch (ep-royal-heart); prints only hosts. Uses
// three fake tenant ids and refuses to start if any row for them already exists. Cleanup deletes by those
// exact ids only (tenant_id is the key, so real rows are never touched), in a finally block.
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
const A = 'rlstest_tf_A';
const B = 'rlstest_tf_B';
const GHOST = 'rlstest_tf_ghost';   // never gets a row
const ids = [A, B, GHOST];

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
// Runs fn; reports whether it failed with Postgres "permission denied" (SQLSTATE 42501), not just any error.
async function permissionDenied(fn) {
  try { await fn(); return { denied: false, detail: 'statement succeeded' }; }
  catch (e) { return { denied: e.code === '42501' && /permission denied/i.test(e.message), detail: `code=${e.code}` }; }
}
const ownerRows = async () => (await ownerPool.query(
  'select tenant_id, feature, enabled, updated_by, updated_at from tenant_features where tenant_id = any($1) order by tenant_id, feature', [ids])).rows;
const snapshot = (rows) => JSON.stringify(rows);

async function cleanup() {
  await ownerPool.query('delete from tenant_features where tenant_id = any($1)', [ids]);
}

let created = false;
async function main() {
  const [{ t }] = (await ownerPool.query("select to_regclass('public.tenant_features') as t")).rows;
  if (t === null) { console.error('REFUSING: tenant_features does not exist on this database.'); process.exitCode = 2; return; }
  const pre = await ownerPool.query('select 1 from tenant_features where tenant_id = any($1)', [ids]);
  if (pre.rows.length) { console.error('REFUSING: rows for the fake tenant ids already exist.'); process.exitCode = 2; return; }

  created = true;  // BEFORE inserting: a partial failure is still cleaned up by exact id
  await ownerPool.query(
    `insert into tenant_features (tenant_id, feature, enabled, updated_by) values
       ($1, 'trend_radar', true, 'fixture'), ($1, 'some_other_feature', false, 'fixture'), ($2, 'trend_radar', false, 'fixture')`, [A, B]);
  const before = snapshot(await ownerRows());

  // --- reads: a tenant sees only its own rows
  const a = await asTenant(A, (c) => c.query('select tenant_id, feature, enabled from tenant_features'));
  const aOwn = a.rows.filter((r) => r.tenant_id === A);
  report('1. A reads exactly its own two rows', a.rows.length === 2 && aOwn.length === 2
    && a.rows.find((r) => r.feature === 'trend_radar')?.enabled === true && a.rows.find((r) => r.feature === 'some_other_feature')?.enabled === false, `rows=${a.rows.length}`);

  const aGetsB = await asTenant(A, (c) => c.query('select 1 from tenant_features where tenant_id = $1', [B]));
  report("2. A cannot read B's row even by asking for it explicitly", aGetsB.rows.length === 0, `rows=${aGetsB.rows.length}`);

  const aByFeature = await asTenant(A, (c) => c.query("select tenant_id, enabled from tenant_features where feature = 'trend_radar'"));
  report("3. A filtering by feature='trend_radar' gets only its own row (B's 'false' row is invisible)",
    aByFeature.rows.length === 1 && aByFeature.rows[0].tenant_id === A && aByFeature.rows[0].enabled === true, `rows=${aByFeature.rows.length}`);

  const b = await asTenant(B, (c) => c.query('select tenant_id, feature, enabled from tenant_features'));
  report('4. B reads exactly its own one row (enabled=false)', b.rows.length === 1 && b.rows[0].tenant_id === B && b.rows[0].enabled === false, `rows=${b.rows.length}`);

  // --- writes: permission denied, for itself and for another tenant's id
  let r = await permissionDenied(() => asTenant(A, (c) => c.query("insert into tenant_features (tenant_id, feature, enabled) values ($1, 'trend_radar_new', true)", [A])));
  report('5a. A cannot INSERT a row for itself: permission denied', r.denied, r.detail);
  r = await permissionDenied(() => asTenant(A, (c) => c.query("insert into tenant_features (tenant_id, feature, enabled) values ($1, 'trend_radar', true)", [GHOST])));
  report('5b. A cannot INSERT a row tagged with another tenant: permission denied', r.denied, r.detail);
  r = await permissionDenied(() => asTenant(B, (c) => c.query("insert into tenant_features (tenant_id, feature, enabled) values ($1, 'trend_radar', true) on conflict (tenant_id, feature) do update set enabled = true", [B])));
  report('5c. B cannot switch ITSELF on with an upsert: permission denied', r.denied, r.detail);
  r = await permissionDenied(() => asTenant(B, (c) => c.query("update tenant_features set enabled = true where tenant_id = $1", [B])));
  report('6a. B cannot UPDATE its own row to true: permission denied', r.denied, r.detail);
  r = await permissionDenied(() => asTenant(A, (c) => c.query("update tenant_features set enabled = false where tenant_id = $1", [B])));
  report("6b. A cannot UPDATE B's row: permission denied", r.denied, r.detail);
  r = await permissionDenied(() => asTenant(A, (c) => c.query('delete from tenant_features where tenant_id = $1', [A])));
  report('7a. A cannot DELETE its own row: permission denied', r.denied, r.detail);
  r = await permissionDenied(() => asTenant(A, (c) => c.query('delete from tenant_features where tenant_id = $1', [B])));
  report("7b. A cannot DELETE B's row: permission denied", r.denied, r.detail);
  // Not an attempted TRUNCATE: RLS does not apply to TRUNCATE, so if the privilege ever existed the attempt
  // would wipe every row (including ones the owner switched on during a later run). Ask the catalog instead.
  const [{ trunc }] = (await ownerPool.query("select has_table_privilege('tenant_app', 'public.tenant_features', 'TRUNCATE') as trunc")).rows;
  report("7c. tenant_app has no TRUNCATE privilege: has_table_privilege(...'TRUNCATE') = false", trunc === false, `has_table_privilege=${trunc}`);

  // --- no / empty / unknown tenant context
  const unset = await asTenant(null, (c) => c.query('select 1 from tenant_features'));
  report('8. No tenant context (set_config never called) -> zero rows', unset.rows.length === 0, `rows=${unset.rows.length}`);
  const empty = await asTenant('', (c) => c.query('select 1 from tenant_features'));
  report("9. Tenant context set to '' -> zero rows", empty.rows.length === 0, `rows=${empty.rows.length}`);
  const ghost = await asTenant(GHOST, (c) => c.query('select 1 from tenant_features'));
  report("10. A tenant with no rows sees zero rows (and none of anyone else's)", ghost.rows.length === 0, `rows=${ghost.rows.length}`);

  // --- nothing above changed anything
  report('11. Owner view: the three fixture rows are byte-identical after every attempt above', snapshot(await ownerRows()) === before);

  // --- the owner write path the admin endpoint uses works (row level security is NOT forced) and tenant_app sees it
  await ownerPool.query(
    `insert into tenant_features (tenant_id, feature, enabled, updated_by) values ($1, 'trend_radar', true, 'owner-test')
       on conflict (tenant_id, feature) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()`, [B]);
  const bNow = await asTenant(B, (c) => c.query("select enabled from tenant_features where feature = 'trend_radar'"));
  report('12. Owner upsert (the admin path) works despite RLS, and B then reads enabled=true', bNow.rows.length === 1 && bNow.rows[0].enabled === true, `rows=${bNow.rows.length}`);
  const stillA = await asTenant(A, (c) => c.query("select enabled from tenant_features where feature = 'trend_radar'"));
  report("13. ...and A's own row is unaffected by the owner's write to B's", stillA.rows.length === 1 && stillA.rows[0].enabled === true);
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (created) {
      try { await cleanup(); console.log('Cleanup: removed the rlstest_tf_ rows'); }
      catch (e) { failures++; console.error('Cleanup failed:', e.message); }
    }
    await appPool.end();
    await ownerPool.end();
    if (process.exitCode === 2) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
