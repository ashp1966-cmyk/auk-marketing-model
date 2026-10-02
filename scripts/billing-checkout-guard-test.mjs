// Handler-level test for api/billing/checkout.js's billing-state guard, against the rls-test branch.
// Real handler + real withTenant()/Postgres/RLS; stubbed: api/_lib/auth.js (Clerk can't run here)
// and global fetch (Paystack -- NO real Paystack call is ever made; any other fetch throws).
//
// Usage: node --experimental-test-module-mocks scripts/billing-checkout-guard-test.mjs
// Safety: aborts unless BOTH DATABASE_URL_TENANT_APP and DATABASE_URL point at ep-royal-heart
// (rls-test); prints only the hosts. Creates fake tenants rows with ids prefixed rlstest_ck_ (refuses
// to run if any already exist) and deletes exactly those ids in a finally block.
// The Paystack key used is a dummy set only inside this process.

import { mock } from 'node:test';
import { readFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  const m = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .match(new RegExp(`^${name}=["']?([^"'\\r\\n]+)["']?`, 'm'));
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
process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy_not_a_real_key';

// --- stub global fetch: record Paystack calls, answer them, throw on anything else.
const paystackCalls = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url) === 'https://api.paystack.co/transaction/initialize') {
    paystackCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ status: true, data: { authorization_url: 'https://stub.invalid/pay' } }) };
  }
  throw new Error(`Unexpected fetch to ${url}`);
};

// --- stub auth (tenant from x-test-tenant header; 'none' = failed session) and wrap db so a
// DB failure can be simulated on demand. The wrapper delegates to the REAL withTenant otherwise.
const realDb = await import('../api/_lib/db.js');
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: {
    resolveOrgId: async (req) => {
      const t = req.headers['x-test-tenant'];
      return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` };
    },
  },
});
mock.module(new URL('../api/_lib/db.js', import.meta.url).href, {
  exports: {
    withTenant: (orgId, fn) => (globalThis.__failDb ? Promise.reject(new Error('simulated db failure')) : realDb.withTenant(orgId, fn)),
  },
});
const { default: handler } = await import('../api/billing/checkout.js');

// --- fixtures: [id, billing_status, plan_code]
const P = 'rlstest_ck_';
const FIX = {
  trialing:        [P + 'trialing', 'trialing', null],
  cancelled:       [P + 'cancelled', 'cancelled', null],
  active:          [P + 'active', 'active', 'PLN_nxjgctcp3gxlct6'],
  activeNoPlan:    [P + 'active_noplan', 'active', null],
  activeCapital:   [P + 'active_capital', 'Active', null],
  internalActive:  [P + 'internal_active', 'active', 'internal'],
  internalTrial:   [P + 'internal_trialing', 'trialing', 'internal'],
  pastDue:         [P + 'past_due', 'past_due', null],
  suspended:       [P + 'suspended', 'suspended', null],
};
const MISSING = P + 'missing'; // deliberately has no tenants row
const ids = Object.values(FIX).map((f) => f[0]);

const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };

async function call(method, tenant, body) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers: { 'x-test-tenant': tenant, origin: 'https://test.invalid' }, body }, res);
  return res;
}
const BODY = { planCode: 'PLN_test_plan', email: 'buyer@example.invalid' };

// Runs one case and reports status/code/Paystack-call count together.
async function expectCase(name, tenant, { status, code, paystack, message, failDb = false }) {
  const before = paystackCalls.length;
  globalThis.__failDb = failDb;
  const r = await call('POST', tenant, BODY);
  globalThis.__failDb = false;
  const calls = paystackCalls.length - before;
  const ok = r.statusCode === status && calls === paystack
    && (code === undefined || r.body?.code === code)
    && (message === undefined || r.body?.error === message);
  check(name, ok, `status=${r.statusCode} code=${r.body?.code ?? '-'} paystackCalls=${calls}`);
  return r;
}

const PLAN_CHANGE = 'To change plan, email sales@auk-maritime.com';
const INTERNAL = "This is the platform owner account and doesn't use paid plans.";
const UNAVAILABLE = "We can't start a new subscription for this account right now. Please email sales@auk-maritime.com";

let created = false;
async function main() {
  const { rows: pre } = await owner.query('select id from tenants where id = any($1)', [[...ids, MISSING]]);
  if (pre.length) { console.error('REFUSING: fixture ids already exist:', pre.map((r) => r.id).join(', ')); process.exitCode = 2; return; }
  // Set BEFORE inserting: if an insert fails partway, the finally block still deletes by id
  // (ids that were never inserted are harmless to delete).
  created = true;
  for (const [id, status, plan] of Object.values(FIX)) {
    await owner.query('insert into tenants (id, name, billing_status, plan_code) values ($1, $2, $3, $4)', [id, `RLS Test ${id}`, status, plan]);
  }

  // Allowed
  const t = await expectCase('1. trialing -> proceeds to Paystack (200 + URL)', FIX.trialing[0], { status: 200, paystack: 1 });
  check('1b. response carries the Paystack authorization URL', t.body?.authorizationUrl === 'https://stub.invalid/pay');
  const sent = paystackCalls.at(-1)?.body;
  check('1c. Paystack request unchanged: plan, tenant metadata, callback_url',
    sent?.plan === BODY.planCode && sent?.metadata?.tenant_id === FIX.trialing[0] && sent?.callback_url === 'https://test.invalid/?tab=billing' && sent?.email === BODY.email);
  await expectCase('2. cancelled -> proceeds to Paystack', FIX.cancelled[0], { status: 200, paystack: 1 });
  await expectCase('3. missing tenant row -> proceeds (behaviour unchanged)', MISSING, { status: 200, paystack: 1 });

  // Refused
  await expectCase('4. active -> 409 plan_change_unavailable, Paystack never called', FIX.active[0], { status: 409, code: 'plan_change_unavailable', paystack: 0, message: PLAN_CHANGE });
  await expectCase('4b. active with plan_code null -> 409 plan_change_unavailable, Paystack never called', FIX.activeNoPlan[0], { status: 409, code: 'plan_change_unavailable', paystack: 0, message: PLAN_CHANGE });
  await expectCase("4c. billing_status 'Active' (capital A) -> 409 checkout_unavailable, Paystack never called", FIX.activeCapital[0], { status: 409, code: 'checkout_unavailable', paystack: 0, message: UNAVAILABLE });
  await expectCase('5. internal + active -> 409 internal_account, Paystack never called', FIX.internalActive[0], { status: 409, code: 'internal_account', paystack: 0, message: INTERNAL });
  await expectCase('6. internal + trialing -> 409 internal_account, Paystack never called', FIX.internalTrial[0], { status: 409, code: 'internal_account', paystack: 0, message: INTERNAL });
  await expectCase('7. past_due -> 409 checkout_unavailable, Paystack never called', FIX.pastDue[0], { status: 409, code: 'checkout_unavailable', paystack: 0, message: UNAVAILABLE });
  await expectCase('8. suspended -> 409 checkout_unavailable, Paystack never called', FIX.suspended[0], { status: 409, code: 'checkout_unavailable', paystack: 0, message: UNAVAILABLE });

  // Fail closed
  await expectCase('9. DB failure on an otherwise-allowed tenant -> 500, Paystack never called', FIX.trialing[0], { status: 500, paystack: 0, failDb: true });

  // Pre-existing behaviour untouched
  const before = paystackCalls.length;
  const noPlan = await call('POST', FIX.trialing[0], { email: 'a@b.invalid' });
  const noEmail = await call('POST', FIX.trialing[0], { planCode: 'PLN_x' });
  const noSession = await call('POST', 'none', BODY);
  const getRes = await call('GET', FIX.trialing[0]);
  check('10a. missing planCode -> 400', noPlan.statusCode === 400);
  check('10b. missing email -> 400', noEmail.statusCode === 400);
  check('10c. no session -> 401', noSession.statusCode === 401);
  check('10d. GET -> 405', getRes.statusCode === 405);
  check('10e. none of those reached Paystack', paystackCalls.length === before);

  // No fixture row was modified by any request
  const { rows } = await owner.query('select id, billing_status, plan_code from tenants where id = any($1) order by id', [ids]);
  const unchanged = rows.length === ids.length && rows.every((r) => {
    const f = Object.values(FIX).find((x) => x[0] === r.id);
    return f && f[1] === r.billing_status && f[2] === r.plan_code;
  });
  check('11. no tenants row was changed by any request', unchanged, `rows=${rows.length}/${ids.length}`);
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (created) {
      try { await owner.query('delete from tenants where id = any($1)', [ids]); console.log('Cleanup: removed the rlstest_ck_ tenants rows'); }
      catch (e) { failures++; console.error('Cleanup failed:', e.message); }
    }
    await owner.end();
    if (process.exitCode === 2) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
