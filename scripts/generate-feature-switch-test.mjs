// Handler tests for the Trend Radar switch (CLAUDE-CODE-BRIEF-trend-radar-switch.md): api/generate.js enforcement,
// api/trial-status.js client flag, and the shared helper in api/_lib/feature-flags.js.
//
// Usage (two passes, as the shaping handler test):
//   node --experimental-test-module-mocks scripts/generate-feature-switch-test.mjs
//   DRAFT_DRY_RUN=true node --experimental-test-module-mocks scripts/generate-feature-switch-test.mjs
//
// Real handlers + real withTenant/Postgres/RLS/trial gate. Stubbed: api/_lib/auth.js; global fetch (captures what
// WOULD go to Anthropic: no real call ever; dummy key in-process); and two failure switches wrapped around the
// REAL db layer and the REAL feature-flag lookup so "fails closed" can be exercised on demand.
// Safety: aborts unless BOTH db URLs are ep-royal-heart (rls-test); prints only hosts; refuses if any fixture id
// already exists; deletes tenant_usage, tenant_features and tenants rows by exact id in a finally block
// (`created` is set BEFORE inserting). After cleanup it runs a READ-ONLY count of rows with the fixture prefix
// in all three tables and reports any leftover as a failure (it never deletes by prefix).
import { mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { realPayloads } from './lib/real-generate-payloads.mjs';
import { CAPS } from '../api/_lib/trial-gate.js';

neonConfig.webSocketConstructor = ws;
const DRY = process.env.DRAFT_DRY_RUN === 'true';
console.log(DRY ? 'MODE: dry run (DRAFT_DRY_RUN=true)' : 'MODE: normal (upstream captured by stub, never sent)');

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
process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy-not-a-real-key';

const upstream = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url) === 'https://api.anthropic.com/v1/messages') {
    upstream.push(JSON.parse(init.body));
    return { status: 200, json: async () => ({ id: 'msg_stub', type: 'message', role: 'assistant', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  }
  throw new Error(`Unexpected fetch to ${url}`);
};

// Real modules first, then wrap them so a failure can be injected on demand.
const realDb = await import('../api/_lib/db.js');
const realFlags = await import('../api/_lib/feature-flags.js');
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: { resolveOrgId: async (req) => { const t = req.headers['x-test-tenant']; return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` }; } },
});
mock.module(new URL('../api/_lib/db.js', import.meta.url).href, {
  exports: { withTenant: (orgId, fn) => (globalThis.__failDb ? Promise.reject(new Error('simulated db failure')) : realDb.withTenant(orgId, fn)) },
});
mock.module(new URL('../api/_lib/feature-flags.js', import.meta.url).href, {
  exports: {
    FEATURE_KEYS: realFlags.FEATURE_KEYS,
    GENERATE_FEATURE_SWITCH: realFlags.GENERATE_FEATURE_SWITCH,
    FEATURE_DISABLED_MESSAGES: realFlags.FEATURE_DISABLED_MESSAGES,
    featureDisabledBody: realFlags.featureDisabledBody,
    isFeatureEnabled: (...a) => (globalThis.__failFlag ? Promise.reject(new Error('simulated flag lookup failure')) : realFlags.isFeatureEnabled(...a)),
  },
});
const { default: generate } = await import('../api/generate.js');
const { default: tstatus } = await import('../api/trial-status.js');

// ---- fixtures
const PREFIX = 'rlstest_sw_';
const INTERNAL = PREFIX + 'internal';          // plan_code internal, WITH a row saying enabled=false: internal must still be on
const ACTIVE_MISSING = PREFIX + 'active_missing';   // paid, no switch row  -> off
const ACTIVE_FALSE = PREFIX + 'active_false';       // paid, row enabled=false -> off
const ACTIVE_ON = PREFIX + 'active_on';             // paid, row enabled=true -> on
const TRIAL_ON_FRESH = PREFIX + 'trial_on_fresh';   // trialing, switch on, no usage -> normal gate lets it through
const TRIAL_ON_CAPPED = PREFIX + 'trial_on_capped'; // trialing, switch on, trend_radar_scans at its cap of 1 -> 402
const TRIAL_OFF_EXPIRED = PREFIX + 'trial_off_expired'; // trialing, trial ended 30 days ago, no row -> switch wins: 403
const ids = [INTERNAL, ACTIVE_MISSING, ACTIVE_FALSE, ACTIVE_ON, TRIAL_ON_FRESH, TRIAL_ON_CAPPED, TRIAL_OFF_EXPIRED];

const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };

async function post(tenant, body) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await generate({ method: 'POST', headers: { 'x-test-tenant': tenant }, body }, res);
  return res;
}
async function getStatus(tenant) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await tstatus({ method: 'GET', headers: { 'x-test-tenant': tenant } }, res);
  return res;
}
const snap = async () => JSON.stringify({
  usage: (await owner.query('select tenant_id, month::text, research_runs, campaign_drafts, outreach_drafts, trend_radar_scans, emails_sent from tenant_usage where tenant_id = any($1) order by 1,2', [ids])).rows,
  features: (await owner.query('select tenant_id, feature, enabled, updated_by, updated_at from tenant_features where tenant_id = any($1) order by 1,2', [ids])).rows,
});

const DISABLED_MSG = "AI Trend Radar isn't switched on for your account. Email sales@auk-maritime.com to enable it.";

// The fixture list is asserted up front: all seven ids, all distinct, all carrying the prefix.
check('fixture id list has all seven distinct ids, each with the rlstest_sw_ prefix',
  ids.length === 7 && new Set(ids).size === 7 && ids.every((i) => i.startsWith(PREFIX)), `length=${ids.length}`);

let created = false;
async function main() {
  // ---------- S0: pure checks (no db): mapping invariants and the helper's decisions against a stub client
  const { FEATURE_KEYS, GENERATE_FEATURE_SWITCH, FEATURE_DISABLED_MESSAGES, featureDisabledBody, isFeatureEnabled } = realFlags;
  check('S0. every mapped switch key is in FEATURE_KEYS', Object.values(GENERATE_FEATURE_SWITCH).every((k) => FEATURE_KEYS.includes(k)));
  check('S0. every mapped generate feature is a real generate feature (a key of CAPS)', Object.keys(GENERATE_FEATURE_SWITCH).every((f) => Object.hasOwn(CAPS, f)));
  check('S0. only trend_radar_scans is switchable today', JSON.stringify(GENERATE_FEATURE_SWITCH) === '{"trend_radar_scans":"trend_radar"}');
  check('S0. every feature key has a customer message, and it matches the approved sentence', FEATURE_KEYS.every((k) => typeof FEATURE_DISABLED_MESSAGES[k] === 'string') && FEATURE_DISABLED_MESSAGES.trend_radar === DISABLED_MSG);
  check('S0. the 403 body is { error: "feature_disabled", message }', isDeepStrictEqual(featureDisabledBody('trend_radar'), { error: 'feature_disabled', message: DISABLED_MSG }));
  const stub = (row) => ({ query: async () => ({ rows: row ? [row] : [] }) });
  check('S0. helper: internal tenant -> true even if its row says false', await isFeatureEnabled(stub({ plan_code: 'internal', enabled: false }), 'o', 'trend_radar') === true);
  check('S0. helper: enabled=true -> true', await isFeatureEnabled(stub({ plan_code: null, enabled: true }), 'o', 'trend_radar') === true);
  check('S0. helper: enabled=false -> false', await isFeatureEnabled(stub({ plan_code: null, enabled: false }), 'o', 'trend_radar') === false);
  check('S0. helper: no switch row (null) -> false', await isFeatureEnabled(stub({ plan_code: null, enabled: null }), 'o', 'trend_radar') === false);
  check('S0. helper: no tenants row at all -> false (fails closed)', await isFeatureEnabled(stub(null), 'o', 'trend_radar') === false);
  check('S0. helper: unknown key -> false, even for an internal tenant', await isFeatureEnabled(stub({ plan_code: 'internal', enabled: true }), 'o', 'nope') === false);
  check('S0. helper: a truthy-but-not-true value is NOT on', await isFeatureEnabled(stub({ plan_code: null, enabled: 'true' }), 'o', 'trend_radar') === false);
  let threw = false; try { await isFeatureEnabled({ query: async () => { throw new Error('db down'); } }, 'o', 'trend_radar'); } catch { threw = true; }
  check('S0. helper: a DB error propagates (never swallowed into "on")', threw);

  // ---------- fixtures
  const { rows: pre } = await owner.query('select id from tenants where id = any($1)', [ids]);
  if (pre.length) { console.error('REFUSING: fixture ids already exist:', pre.map((r) => r.id).join(', ')); process.exitCode = 2; return; }
  created = true;  // BEFORE inserting: a partial failure is still cleaned up by exact id
  await owner.query(`insert into tenants (id, name, billing_status, plan_code, created_at) values
    ($1,'sw internal','trialing','internal', now()), ($2,'sw active missing','active',null, now()), ($3,'sw active false','active',null, now()),
    ($4,'sw active on','active',null, now()), ($5,'sw trial on fresh','trialing',null, now()), ($6,'sw trial on capped','trialing',null, now()),
    ($7,'sw trial off expired','trialing',null, now() - interval '30 days')`,
    [INTERNAL, ACTIVE_MISSING, ACTIVE_FALSE, ACTIVE_ON, TRIAL_ON_FRESH, TRIAL_ON_CAPPED, TRIAL_OFF_EXPIRED]);
  await owner.query(`insert into tenant_features (tenant_id, feature, enabled, updated_by) values
    ($1,'trend_radar',false,'fixture'), ($2,'trend_radar',false,'fixture'), ($3,'trend_radar',true,'fixture'), ($4,'trend_radar',true,'fixture'), ($5,'trend_radar',true,'fixture')`,
    [INTERNAL, ACTIVE_FALSE, ACTIVE_ON, TRIAL_ON_FRESH, TRIAL_ON_CAPPED]);
  await owner.query(`insert into tenant_usage (tenant_id, month, trend_radar_scans) values ($1, date_trunc('month', now())::date, 1)`, [TRIAL_ON_CAPPED]);
  const before = await snap();

  const real = realPayloads('Test prompt for the switch test');
  const of = (f) => real.find((r) => r.feature === f).payload;
  const trend = of('trend_radar_scans');

  // How a request that is ALLOWED looks in each mode.
  async function allowed(label, tenant, payload) {
    const n = upstream.length; const r = await post(tenant, payload); const sent = upstream.length - n;
    const ok = DRY ? (r.statusCode === 200 && r.body?.model === 'dry-run' && sent === 0) : (r.statusCode === 200 && r.body?.id === 'msg_stub' && sent === 1);
    check(`${label}: allowed -> 200 (${DRY ? 'canned dry-run reply, 0 upstream' : '1 upstream call'})`, ok, `status=${r.statusCode} upstream=${sent}`);
  }
  async function blocked(label, tenant, payload, status, error, extra = () => true) {
    const n = upstream.length; const r = await post(tenant, payload); const sent = upstream.length - n;
    check(`${label}: ${status} ${error}, 0 upstream, never a dry-run reply`, r.statusCode === status && r.body?.error === error && sent === 0 && r.body?.model !== 'dry-run' && extra(r), `status=${r.statusCode} error=${r.body?.error} upstream=${sent}`);
  }

  // ---------- S1: Trend Radar through generate.js
  await allowed('S1 internal (row says false, still on)', INTERNAL, trend);
  await allowed('S1 paid tenant, switch on', ACTIVE_ON, trend);
  await allowed('S1 trialing within caps, switch on', TRIAL_ON_FRESH, trend);
  await blocked('S1 paid tenant, NO switch row (missing = off)', ACTIVE_MISSING, trend, 403, 'feature_disabled', (r) => r.body.message === DISABLED_MSG);
  await blocked('S1 paid tenant, row enabled=false', ACTIVE_FALSE, trend, 403, 'feature_disabled', (r) => r.body.message === DISABLED_MSG);
  await blocked('S1 trial ended AND switch off: the switch answers first', TRIAL_OFF_EXPIRED, trend, 403, 'feature_disabled');
  await blocked('S1 switch on but trial cap reached: the normal gate still applies', TRIAL_ON_CAPPED, trend, 402, 'trial_cap_reached');
  await blocked('S1 switch off + INVALID payload: shaping answers first (400)', ACTIVE_MISSING, { ...trend, system: 'x' }, 400, 'invalid_request');

  // ---------- S2: the other three features are unaffected by the switch
  for (const f of ['campaign_drafts', 'outreach_drafts', 'research_runs']) {
    await allowed(`S2 ${f} for a switched-off paid tenant`, ACTIVE_MISSING, of(f));
  }
  await blocked('S2 campaign_drafts for an expired-trial tenant: trial_expired, NOT feature_disabled', TRIAL_OFF_EXPIRED, of('campaign_drafts'), 402, 'trial_expired');

  // ---------- S3: fails closed
  globalThis.__failFlag = true;
  await blocked('S3 switch lookup fails (trend radar, switch ON in the db)', ACTIVE_ON, trend, 500, 'API call failed');
  await allowed('S3 switch lookup fails but the request is campaign_drafts: it never consults the switch', ACTIVE_ON, of('campaign_drafts'));
  globalThis.__failFlag = false;
  globalThis.__failDb = true;
  await blocked('S3 db unavailable (trend radar)', ACTIVE_ON, trend, 500, 'API call failed');
  await blocked('S3 db unavailable (campaign_drafts)', ACTIVE_ON, of('campaign_drafts'), 500, 'API call failed');
  globalThis.__failDb = false;

  // ---------- S4: trial-status.js
  for (const [label, t, want] of [['internal', INTERNAL, true], ['paid, switch on', ACTIVE_ON, true], ['trialing, switch on', TRIAL_ON_FRESH, true],
    ['paid, no row', ACTIVE_MISSING, false], ['paid, row false', ACTIVE_FALSE, false], ['trialing, expired, no row', TRIAL_OFF_EXPIRED, false]]) {
    const r = await getStatus(t);
    check(`S4 trial-status features.trendRadar is ${want} for ${label}`, r.statusCode === 200 && r.body?.features?.trendRadar === want, `status=${r.statusCode} value=${r.body?.features?.trendRadar}`);
  }
  const ts = await getStatus(TRIAL_OFF_EXPIRED);
  check('S4 trial-status still returns every existing field (lock behaviour untouched)',
    ['exempt', 'trialing', 'cancelled', 'inactive', 'expired', 'daysLeft', 'blocked', 'perFeature', 'features'].every((k) => k in ts.body) && ts.body.blocked === true && ts.body.expired === true);

  // The switch lookup runs in its OWN transaction, and a failure is logged by code/name only.
  const logged = []; const realErr = console.error; console.error = (...a) => logged.push(a.map(String).join(' '));
  globalThis.__failFlag = true;
  const tf = await getStatus(ACTIVE_ON);
  globalThis.__failFlag = false;
  console.error = realErr;
  check('S4 switch lookup fails: trial-status still 200, features.trendRadar false, lock fields intact', tf.statusCode === 200 && tf.body?.features?.trendRadar === false && 'blocked' in tf.body && 'perFeature' in tf.body, `status=${tf.statusCode}`);
  check('S4   ...and logs exactly "[trial-status] feature switch lookup failed <name>", with no message text',
    logged.length === 1 && logged[0] === '[trial-status] feature switch lookup failed Error' && !logged[0].includes('simulated'), JSON.stringify(logged));
  globalThis.__failDb = true;
  const td = await getStatus(ACTIVE_ON);
  globalThis.__failDb = false;
  check('S4 db unavailable: trial-status 500 (its existing behaviour)', td.statusCode === 500);

  // ---------- S5: nothing above wrote anything
  check('S5 tenant_usage and tenant_features for the fixtures are byte-identical after the whole run', (await snap()) === before);
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (created) {
      try {
        await owner.query('delete from tenant_usage where tenant_id = any($1)', [ids]);
        await owner.query('delete from tenant_features where tenant_id = any($1)', [ids]);
        await owner.query('delete from tenants where id = any($1)', [ids]);
        console.log('Cleanup: removed the rlstest_sw_ tenants, switch rows and usage rows (by exact id)');
        // READ-ONLY leftover check by prefix: counts only, never deletes by prefix.
        const left = {
          tenants: (await owner.query("select count(*)::int as n from tenants where starts_with(id, $1)", [PREFIX])).rows[0].n,
          tenant_features: (await owner.query("select count(*)::int as n from tenant_features where starts_with(tenant_id, $1)", [PREFIX])).rows[0].n,
          tenant_usage: (await owner.query("select count(*)::int as n from tenant_usage where starts_with(tenant_id, $1)", [PREFIX])).rows[0].n,
        };
        const total = left.tenants + left.tenant_features + left.tenant_usage;
        check(`Leftover rows with prefix ${PREFIX} after cleanup (tenants/tenant_features/tenant_usage): ${left.tenants}/${left.tenant_features}/${left.tenant_usage}`, total === 0);
      } catch (e) { failures++; console.error('Cleanup / leftover check failed:', e.message); }
    }
    await owner.end();
    if (process.exitCode === 2) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
