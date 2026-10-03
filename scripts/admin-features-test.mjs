// Handler tests for api/admin/features.js against the rls-test branch.
// Usage: node --experimental-test-module-mocks scripts/admin-features-test.mjs
// Real handler + real withTenant (the internal check) + the endpoint's own OWNER connection. Stubbed: auth.js
// (tenant from x-test-tenant) and a db wrapper that can fail on demand. SAFETY: aborts unless both db URLs are
// ep-royal-heart; prints only hosts; sets process.env.DATABASE_URL to the host-checked owner URL and deletes
// POSTGRES_URL in-process, so the endpoint cannot fall back to a production connection; refuses if any fixture
// id exists; cleans up by exact id; then a READ-ONLY leftover count by prefix (never deletes by prefix).
import { mock } from 'node:test';
import { readFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  const m = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(new RegExp(`^${name}=["']?([^"'\\r\\n]+)["']?`, 'm'));
  if (!m) throw new Error(`${name} not found in environment or .env.local`);
  return process.env[name] = m[1];
}
const appUrl = loadEnv('DATABASE_URL_TENANT_APP');
const ownerUrl = loadEnv('DATABASE_URL');
for (const [label, u] of [['tenant_app', appUrl], ['owner', ownerUrl]]) {
  const host = new URL(u).host;
  console.log(`${label} host:`, host);
  if (!host.includes('ep-royal-heart')) { console.error('REFUSING: not the rls-test branch.'); process.exit(1); }
}
process.env.DATABASE_URL = ownerUrl;
delete process.env.POSTGRES_URL;

const realDb = await import('../api/_lib/db.js');
const realFlags = await import('../api/_lib/feature-flags.js');
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: { resolveOrgId: async (req) => { const t = req.headers['x-test-tenant']; return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` }; } },
});
mock.module(new URL('../api/_lib/db.js', import.meta.url).href, {
  exports: { withTenant: (orgId, fn) => (globalThis.__failDb ? Promise.reject(new Error('simulated db failure')) : realDb.withTenant(orgId, fn)) },
});
const { default: handler } = await import('../api/admin/features.js');

const PREFIX = 'rlstest_af_';
const ADMIN = PREFIX + 'admin', CUSTOMER = PREFIX + 'customer', T1 = PREFIX + 'target1', T2 = PREFIX + 'target2';
const ids = [ADMIN, CUSTOMER, T1, T2];
const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
check('fixture id list has all four distinct ids, each with the rlstest_af_ prefix', ids.length === 4 && new Set(ids).size === 4 && ids.every((i) => i.startsWith(PREFIX)));

async function call(caller, body, method = 'POST') {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers: { 'x-test-tenant': caller }, body }, res);
  return res;
}
const rows = async () => (await owner.query('select tenant_id, feature, enabled, updated_by, updated_at from tenant_features where tenant_id = any($1) order by 1,2', [ids])).rows;
const snap = async () => JSON.stringify(await rows());
const enabledFor = (t) => realDb.withTenant(t, (c) => realFlags.isFeatureEnabled(c, t, 'trend_radar'));
const good = { tenantId: T1, feature: 'trend_radar', enabled: true };

let created = false;
async function main() {
  // ---- 0. the owner write path relies on row level security NOT being forced on tenant_features
  const [{ forced, rls }] = (await owner.query("select relforcerowsecurity as forced, relrowsecurity as rls from pg_class where oid = 'public.tenant_features'::regclass")).rows;
  check('0. pg_class.relforcerowsecurity for tenant_features is false (the owner write path depends on it)', forced === false, `relforcerowsecurity=${forced}`);
  check('0. ...and row level security itself is enabled', rls === true, `relrowsecurity=${rls}`);

  const { rows: pre } = await owner.query('select id from tenants where id = any($1)', [ids]);
  if (pre.length) { console.error('REFUSING: fixture ids already exist.'); process.exitCode = 2; return; }
  created = true;
  await owner.query(`insert into tenants (id, name, billing_status, plan_code) values
    ($1,'af admin','trialing','internal'), ($2,'af customer','active',null), ($3,'af target1','trialing',null), ($4,'af target2','trialing',null)`, [ADMIN, CUSTOMER, T1, T2]);
  const before = await snap();

  // ---- 1. non-AUK callers learn nothing: 403 first, for everything
  for (const [label, body] of [['valid body', good], ['invalid body (not an object)', 'x'], ['empty body', {}], ['unknown tenant', { ...good, tenantId: 'org_does_not_exist' }],
    ['unknown feature', { ...good, feature: 'nope' }], ['non-boolean enabled', { ...good, enabled: 'true' }], ['targeting the internal tenant', { ...good, tenantId: ADMIN }]]) {
    const r = await call(CUSTOMER, body);
    check(`1. non-AUK caller, ${label}: 403 Admin access only (same answer every time)`, r.statusCode === 403 && r.body?.error === 'Admin access only', `status=${r.statusCode}`);
  }
  check('1. no session: 401', (await call('none', good)).statusCode === 401);
  check('1. GET: 405', (await call(ADMIN, good, 'GET')).statusCode === 405);
  check('1. a non-AUK caller changed nothing', (await snap()) === before);

  // ---- 2. AUK validation: 400, nothing written
  const bad = [
    ['body is a string', 'x'], ['body is an array', []], ['missing tenantId', { feature: 'trend_radar', enabled: true }],
    ['tenantId not a string', { ...good, tenantId: 5 }], ['tenantId empty', { ...good, tenantId: '' }], ['tenantId 256 chars', { ...good, tenantId: 'a'.repeat(256) }],
    ['tenantId with a space', { ...good, tenantId: 'org x' }], ['tenantId with a NUL byte', { ...good, tenantId: 'org_\u0000x' }], ['tenantId path-like', { ...good, tenantId: '../x' }],
    ['feature missing', { tenantId: T1, enabled: true }], ['feature unknown', { ...good, feature: 'nope' }], ['feature an array', { ...good, feature: ['trend_radar'] }],
    ['feature "constructor"', { ...good, feature: 'constructor' }], ['enabled the string "true"', { ...good, enabled: 'true' }], ['enabled 1', { ...good, enabled: 1 }],
    ['enabled null', { ...good, enabled: null }], ['enabled missing', { tenantId: T1, feature: 'trend_radar' }],
  ];
  for (const [label, body] of bad) {
    const r = await call(ADMIN, body);
    check(`2. AUK, ${label}: 400 invalid_request`, r.statusCode === 400 && r.body?.error === 'invalid_request', `status=${r.statusCode}`);
  }
  check('2. 255-char tenantId is accepted by validation (then 404: no such tenant)', (await call(ADMIN, { ...good, tenantId: 'a'.repeat(255) })).statusCode === 404);
  let r = await call(ADMIN, { ...good, tenantId: 'org_does_not_exist' });
  check('2. AUK, unknown tenant: 404', r.statusCode === 404 && r.body?.error === 'Tenant not found');
  r = await call(ADMIN, { ...good, tenantId: ADMIN, enabled: false });
  check('2. AUK targeting the internal tenant: 400 internal_tenant (it is always on)', r.statusCode === 400 && r.body?.error === 'internal_tenant');
  check('2. none of the rejected requests wrote anything', (await snap()) === before);

  // ---- 3. the switch itself: enable, idempotent, disable, isolation, effect on enforcement
  check('3. before: target1 is off (no row)', (await enabledFor(T1)) === false);
  r = await call(ADMIN, good);
  const row1 = (await rows()).find((x) => x.tenant_id === T1);
  check('3. enable target1: 200, row written with enabled=true', r.statusCode === 200 && r.body?.feature?.enabled === true && row1?.enabled === true);
  check("3. updated_by is the calling admin's user id, updated_at is set", row1?.updated_by === `user_${ADMIN}` && row1?.updated_at != null && r.body?.feature?.updated_by === `user_${ADMIN}`);
  check('3. the enforcement helper now reads target1 as ON (admin write is visible under RLS)', (await enabledFor(T1)) === true);
  r = await call(ADMIN, good);
  const again = await rows();
  check('3. idempotent: same request again -> 200, still exactly one row for target1, still enabled', r.statusCode === 200 && again.filter((x) => x.tenant_id === T1).length === 1 && again.find((x) => x.tenant_id === T1).enabled === true);
  check('3. updated_at moved forward (or stayed equal), never backward', new Date(again.find((x) => x.tenant_id === T1).updated_at) >= new Date(row1.updated_at));
  check('3. target2 is untouched (no row, still off)', again.filter((x) => x.tenant_id === T2).length === 0 && (await enabledFor(T2)) === false);
  r = await call(ADMIN, { ...good, enabled: false });
  const off = (await rows()).filter((x) => x.tenant_id === T1);
  check('3. disable target1: 200, one row, enabled=false, helper reads OFF', r.statusCode === 200 && off.length === 1 && off[0].enabled === false && (await enabledFor(T1)) === false);
  r = await call(ADMIN, { tenantId: T2, feature: 'trend_radar', enabled: true });
  check('3. enable target2: 200 and only target2 changed', r.statusCode === 200 && (await enabledFor(T2)) === true && (await enabledFor(T1)) === false);

  // ---- 4. fails closed
  const snapFailBefore = await snap();
  globalThis.__failDb = true;
  r = await call(ADMIN, { tenantId: T1, feature: 'trend_radar', enabled: true });
  globalThis.__failDb = false;
  check('4. db unavailable for the internal check: 500, and nothing was written', r.statusCode === 500 && (await snap()) === snapFailBefore, `status=${r.statusCode}`);
  check('4. the 500 body carries no detail text', Object.keys(r.body || {}).join(',') === 'error');
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (created) {
      try {
        await owner.query('delete from tenant_features where tenant_id = any($1)', [ids]);
        await owner.query('delete from tenants where id = any($1)', [ids]);
        console.log('Cleanup: removed the rlstest_af_ switch rows and tenants (by exact id)');
        const left = {
          tenants: (await owner.query('select count(*)::int as n from tenants where starts_with(id, $1)', [PREFIX])).rows[0].n,
          tenant_features: (await owner.query('select count(*)::int as n from tenant_features where starts_with(tenant_id, $1)', [PREFIX])).rows[0].n,
        };
        check(`Leftover rows with prefix ${PREFIX} (tenants/tenant_features): ${left.tenants}/${left.tenant_features}`, left.tenants + left.tenant_features === 0);
      } catch (e) { failures++; console.error('Cleanup / leftover check failed:', e.message); }
    }
    await owner.end();
    if (process.exitCode === 2) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
