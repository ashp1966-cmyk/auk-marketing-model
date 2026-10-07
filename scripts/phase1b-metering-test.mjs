// Phase 1b metering test (usage-meter + generate.js + save endpoints + usage no-ops), against rls-test.
//
//   node --experimental-test-module-mocks scripts/phase1b-metering-test.mjs                      # normal
//   DRAFT_DRY_RUN=true node --experimental-test-module-mocks scripts/phase1b-metering-test.mjs   # dry run
//
// Real handlers + real withTenant/Postgres/RLS/gate. Stubbed: auth.js and global fetch (Anthropic only; never real).
// Safety: both DB urls must be ep-royal-heart (rls-test). Fixtures are prefixed rlstest_p1b_ and deleted by exact id.

import { mock } from 'node:test';
import { readFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { realPayloads } from './lib/real-generate-payloads.mjs';

neonConfig.webSocketConstructor = ws;
const DRY = process.env.DRAFT_DRY_RUN === 'true';
console.log(DRY ? 'MODE: dry run' : 'MODE: normal');

function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  const m = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(new RegExp(`^${name}=["']?([^"'\\r\\n]+)["']?`, 'm'));
  if (!m) throw new Error(`${name} not found`);
  return process.env[name] = m[1];
}
const appUrl = loadEnv('DATABASE_URL_TENANT_APP'), ownerUrl = loadEnv('DATABASE_URL');
for (const [l, u] of [['tenant_app', appUrl], ['owner', ownerUrl]]) {
  const host = new URL(u).host; console.log(`${l} host:`, host);
  if (!host.includes('ep-royal-heart')) { console.error('REFUSING: not rls-test.'); process.exit(1); }
}
process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy-not-a-real-key';

// Upstream stub. behavior: 'ok' | 429 | 500 | 'throw' | 'errtype' | 'garbage'; delayMs for the parallel test.
let behavior = 'ok', delayMs = 0;
const upstream = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url) !== 'https://api.anthropic.com/v1/messages') throw new Error(`Unexpected fetch to ${url}`);
  upstream.push(JSON.parse(init.body));
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const mk = (status, body) => ({ status, json: async () => body });
  switch (behavior) {
    case 429: return mk(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } });
    case 500: return mk(500, { type: 'error', error: { type: 'api_error', message: 'boom' } });
    case 'errtype': return mk(200, { type: 'error', error: { type: 'overloaded_error', message: 'busy' } });
    case 'throw': throw new Error('network down');
    case 'garbage': return mk(200, { id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'not json at all' }], usage: { input_tokens: 1, output_tokens: 1 } });
    default: return mk(200, { id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } });
  }
};

// db wrapper: real withTenant, but can fail the Nth call of a scenario (to simulate the refund's own DB failure).
const realDb = await import('../api/_lib/db.js');
let dbCalls = 0, failOnCall = 0;
mock.module(new URL('../api/_lib/db.js', import.meta.url).href, {
  exports: { ...realDb, withTenant: (...a) => { dbCalls++; if (failOnCall && dbCalls === failOnCall) return Promise.reject(Object.assign(new Error('injected db failure'), { code: 'XX000' })); return realDb.withTenant(...a); } },
});
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: { resolveOrgId: async (req) => { const t = req.headers['x-test-tenant']; return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` }; } },
});
const { default: generate } = await import('../api/generate.js');
const { default: prospectsH } = await import('../api/prospects.js');
const { default: outreachH } = await import('../api/outreach.js');
const { default: campaignUse } = await import('../api/usage/campaign-draft.js');
const { default: radarUse } = await import('../api/usage/trend-radar-scan.js');
const { default: trialStatus } = await import('../api/trial-status.js');
const { reserveUnit, refundUnit } = await import('../api/_lib/usage-meter.js');
const { withTenant } = await import('../api/_lib/db.js');

const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (n, pass, d = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  -- ' + d : ''}`); };

const P = 'rlstest_p1b_';
const made = [];
async function mk(name, { plan = null, status = 'trialing', ageDays = 0 } = {}) {
  const id = P + name; made.push(id);
  await owner.query(`insert into tenants (id, name, billing_status, plan_code, created_at) values ($1,$2,$3,$4, now() - ($5 || ' days')::interval)`, [id, 'p1b ' + name, status, plan, String(ageDays)]);
  return id;
}
async function call(handler, tenant, { method = 'POST', body } = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers: { 'x-test-tenant': tenant }, body }, res);
  return res;
}
const gen = (t, f) => call(generate, t, { body: bodies[f] });
const COLS = ['research_runs', 'campaign_drafts', 'outreach_drafts', 'trend_radar_scans'];
async function used(t) {
  const { rows } = await owner.query(`select coalesce(sum(research_runs),0)::int r, coalesce(sum(campaign_drafts),0)::int c, coalesce(sum(outreach_drafts),0)::int o, coalesce(sum(trend_radar_scans),0)::int t from tenant_usage where tenant_id=$1`, [t]);
  return { research_runs: rows[0].r, campaign_drafts: rows[0].c, outreach_drafts: rows[0].o, trend_radar_scans: rows[0].t };
}
const total = async (t) => Object.values(await used(t)).reduce((a, b) => a + b, 0);
const bodies = {};
for (const { feature, payload } of realPayloads('p1b prompt')) bodies[feature] ??= payload;

async function main() {
  const { rows: pre } = await owner.query(`select id from tenants where id like $1`, [P + '%']);
  if (pre.length) { console.error('REFUSING: fixtures exist'); process.exitCode = 2; return; }

  // ---------- M: usage-meter at the DB level (direct, real RLS)
  if (!DRY) {
    const m1 = await mk('m1');
    const r = (limit, f = 'research_runs') => withTenant(m1, async (c) => { await c.query('select pg_advisory_xact_lock(hashtext($1))', [m1]); return reserveUnit(c, m1, f, limit); });
    const a = await r(2), b = await r(2), c3 = await r(2);
    check('M1 reserve returns the month, twice up to the limit, then null at the limit', /^\d{4}-\d{2}-01$/.test(a) && /^\d{4}-\d{2}-01$/.test(b) && c3 === null, `${a} ${b} ${c3}`);
    check('M2 only the requested column moved (research 2, others 0)', JSON.stringify(await used(m1)) === JSON.stringify({ research_runs: 2, campaign_drafts: 0, outreach_drafts: 0, trend_radar_scans: 0 }));
    const m2 = await mk('m2');
    await owner.query(`insert into tenant_usage (tenant_id, month, campaign_drafts) values ($1, (date_trunc('month', now()) - interval '1 month')::date, 2)`, [m2]);
    const pr = await withTenant(m2, (c) => reserveUnit(c, m2, 'campaign_drafts', 2));
    check('M3 prior-month use counts toward the limit (blocked at 2 from last month)', pr === null);
    const nl = [];
    for (let i = 0; i < 5; i++) nl.push(await withTenant(m2, (c) => reserveUnit(c, m2, 'outreach_drafts', null)));
    check('M4 a null limit always counts (5 of 5)', nl.every((x) => x) && (await used(m2)).outreach_drafts === 5);
    let thrown = 0;
    for (const bad of ['nope', '__proto__', 'constructor', 'toString', ['research_runs'], undefined, 'research_runs; drop table tenants']) {
      try { await withTenant(m2, (c) => reserveUnit(c, m2, bad, 2)); } catch { thrown++; }
    }
    try { await withTenant(m2, (c) => refundUnit(c, m2, 'constructor', '2020-01-01')); } catch { thrown++; }
    check('M5 unknown / prototype / injected feature names throw (8 of 8)', thrown === 8, `thrown=${thrown}`);
    const m3 = await mk('m3');
    const par = await Promise.all(Array.from({ length: 20 }, () => withTenant(m3, async (c) => { await c.query('select pg_advisory_xact_lock(hashtext($1))', [m3]); return reserveUnit(c, m3, 'research_runs', 2); })));
    check('M6 20 parallel reserves with cap 2 give exactly 2 successes', par.filter(Boolean).length === 2 && (await used(m3)).research_runs === 2, `ok=${par.filter(Boolean).length}`);
    const m4 = await mk('m4');
    const mo = await withTenant(m4, (c) => reserveUnit(c, m4, 'trend_radar_scans', 5));
    await withTenant(m4, (c) => refundUnit(c, m4, 'trend_radar_scans', mo));
    await withTenant(m4, (c) => refundUnit(c, m4, 'trend_radar_scans', mo));
    await withTenant(m4, (c) => refundUnit(c, m4, 'trend_radar_scans', '2001-01-01'));
    check('M7 refund hits its month row, never below 0, and a nonexistent month changes nothing', (await used(m4)).trend_radar_scans === 0 && (await owner.query('select 1 from tenant_usage where tenant_id=$1', [m4])).rowCount === 1);
  }

  // ---------- G: generate metering
  const FEATS = Object.keys(bodies);
  check('G0 payloads for all 4 features found', FEATS.length === 4);
  const gi = await mk('gi', { plan: 'internal' }), ga = await mk('ga', { status: 'active' });
  for (const f of FEATS) {
    const before = upstream.length; const u0 = await used(gi);
    const r = await gen(gi, f); const u1 = await used(gi);
    const want = DRY ? 0 : 1;
    const moved = COLS.filter((c) => u1[c] !== u0[c]);
    check(`G1 internal ${f}: 200, counted ${want} in its own column only`, r.statusCode === 200 && u1[f] - u0[f] === want && moved.every((c) => c === f), `status=${r.statusCode} moved=${moved}`);
    check(`G1 internal ${f}: upstream calls ${DRY ? 0 : 1}`, upstream.length - before === (DRY ? 0 : 1));
  }
  for (let i = 0; i < 4; i++) await gen(ga, 'campaign_drafts');
  check(`G2 active tenant is counted but never limited (4 calls -> 200s, count ${DRY ? 0 : 4})`, (await used(ga)).campaign_drafts === (DRY ? 0 : 4));

  if (!DRY) {
    for (const f of FEATS) {
      const t = await mk('seq_' + f);
      if (f === 'trend_radar_scans') await owner.query(`insert into tenant_features (tenant_id, feature, enabled, updated_by) values ($1,'trend_radar',true,'p1b-test')`, [t]);
      const cap = f === 'trend_radar_scans' ? 1 : 2;
      const codes = []; const before = upstream.length;
      for (let i = 0; i < cap + 1; i++) codes.push((await gen(t, f)).statusCode);
      const expected = [...Array(cap).fill(200), 402];
      check(`G3 ${f}: ${expected.join(',')} and exactly ${cap} upstream calls`, JSON.stringify(codes) === JSON.stringify(expected) && upstream.length - before === cap && (await used(t))[f] === cap, codes.join(','));
    }
    const sw = await mk('switchoff'); const sr = await gen(sw, 'trend_radar_scans');
    check('G3b Trend Radar switched off: 403, no upstream, nothing counted', sr.statusCode === 403 && (await total(sw)) === 0);
    const pt = await mk('par'); delayMs = 40; const before = upstream.length;
    const rs = await Promise.all(Array.from({ length: 10 }, () => gen(pt, 'outreach_drafts')));
    delayMs = 0;
    check('G4 10 parallel trial calls: exactly 2 reach upstream, 8 get 402', rs.filter((r) => r.statusCode === 200).length === 2 && rs.filter((r) => r.statusCode === 402).length === 8 && upstream.length - before === 2 && (await used(pt)).outreach_drafts === 2);

    const ex = await mk('exp', { ageDays: 10 }), ca = await mk('can', { status: 'cancelled' }), ina = await mk('ina', { status: 'weird' });
    const b0 = upstream.length;
    const bl = [await gen(ex, 'research_runs'), await gen(ca, 'research_runs'), await gen(ina, 'research_runs'), await gen('none', 'research_runs'),
      await call(generate, ex, { body: { feature: 'bogus' } }), await call(generate, ex, { body: { ...bodies.research_runs, extra: 1 } })];
    check('G5 expired/cancelled/inactive/no-session/bad-feature/bad-shape: 402,402,402,401,400,400, no upstream, nothing counted',
      bl.map((r) => r.statusCode).join() === '402,402,402,401,400,400' && upstream.length === b0 && (await total(ex)) + (await total(ca)) + (await total(ina)) === 0, bl.map((r) => r.statusCode).join());

    // Refunds
    const rt = await mk('refund');
    for (const [label, beh, wantStatus] of [['429', 429, 429], ['500', 500, 500], ['thrown network error', 'throw', 500], ['type:error with 200', 'errtype', 200]]) {
      behavior = beh; const r = await gen(rt, 'research_runs');
      check(`G6 upstream ${label}: client sees ${wantStatus}, unit given back (0 used)`, r.statusCode === wantStatus && (await used(rt)).research_runs === 0, `status=${r.statusCode} used=${(await used(rt)).research_runs}`);
    }
    behavior = 'garbage'; const gr = await gen(rt, 'research_runs');
    check('G7 a 200 with unparseable text stays counted (no refund)', gr.statusCode === 200 && (await used(rt)).research_runs === 1);
    behavior = 'ok';
    // refund of a failure after a prior success: only its own unit
    behavior = 500; await gen(rt, 'research_runs'); behavior = 'ok';
    check('G8 a failed call after one counted success leaves exactly that 1 (no double refund)', (await used(rt)).research_runs === 1);
    // The refund's own DB call fails (2nd withTenant call of the request): client still gets the upstream status, unit stays used.
    const rf = await mk('reffail');
    const logs = []; const origErr = console.error; console.error = (...a) => logs.push(a.join(' '));
    behavior = 500; dbCalls = 0; failOnCall = 2;
    const rr = await gen(rf, 'research_runs');
    failOnCall = 0; console.error = origErr; behavior = 'ok';
    check('G9 refund DB failure: client still gets the upstream 500, unit stays counted (1), failure logged once', rr.statusCode === 500 && (await used(rf)).research_runs === 1 && logs.filter((l) => l.includes('[usage] refund failed')).length === 1, `status=${rr.statusCode} used=${(await used(rf)).research_runs} logs=${logs.length}`);
    // Generate + the matching research save counts exactly once in total.
    const gs = await mk('gensave'); dbCalls = 0;
    await gen(gs, 'research_runs');
    const sv = await call(prospectsH, gs, { body: { serviceName: 'S', candidates: [{ company_name: 'Z', contact_email: 'z@z.test', verified: true }] } });
    check('G10 generate + research save counts exactly once in total (1)', sv.statusCode === 200 && (await total(gs)) === 1, `total=${await total(gs)}`);
  }

  // ---------- S: save endpoints + usage no-ops + status
  const st = await mk('save'); await owner.query(`insert into tenant_usage (tenant_id, month, research_runs, outreach_drafts) values ($1, date_trunc('month', now())::date, 2, 2)`, [st]);
  const t0 = await total(st);
  const run = await call(prospectsH, st, { body: { serviceName: 'Svc', criteria: {}, candidates: [{ company_name: 'Acme', contact_email: 'a@acme.test', verified: true }] } });
  check('S1 research save at cap (2/2) still succeeds (AI call already counted)', run.statusCode === 200 && run.body?.run?.prospects?.length === 1, `status=${run.statusCode}`);
  const pid = run.body?.run?.prospects?.[0]?.id;
  const dr = await call(outreachH, st, { body: { prospectId: pid, subject: 's', body: 'b' } });
  check('S2 outreach save at cap (2/2) still succeeds', dr.statusCode === 200 && !!dr.body?.draft, `status=${dr.statusCode}`);
  const up = await call(prospectsH, st, { body: { source: 'manual_upload', candidates: [{ company_name: 'Up', contact_email: 'u@up.test' }] } });
  check('S3 manual upload unaffected', up.statusCode === 200);
  check('S4 save endpoints add nothing to the counts', (await total(st)) === t0, `before=${t0} after=${await total(st)}`);
  const sx = await mk('saveexp', { ageDays: 10 }), sc = await mk('savecan', { status: 'cancelled' });
  const e1 = await call(prospectsH, sx, { body: { serviceName: 'S', candidates: [] } }), e2 = await call(prospectsH, sc, { body: { serviceName: 'S', candidates: [] } });
  const e3 = await call(outreachH, sx, { body: { prospectId: 1, subject: 's', body: 'b' } }), e4 = await call(outreachH, sc, { body: { prospectId: 1, subject: 's', body: 'b' } });
  check('S5 expired and cancelled get 402 on both save endpoints (4 of 4)', [e1, e2, e3, e4].every((r) => r.statusCode === 402), [e1, e2, e3, e4].map((r) => r.statusCode).join());
  const tu = await mk('noop'); const n0 = await total(tu);
  const ncs = [await call(campaignUse, tu, { body: {} }), await call(radarUse, tu, { body: {} })];
  check('S6 old-tab POSTs to both usage endpoints return 200 and count nothing', ncs.every((r) => r.statusCode === 200 && r.body?.noop) && (await total(tu)) === n0);
  const nr = [await call(campaignUse, 'none', { body: {} }), await call(radarUse, 'none', { body: {} }), await call(campaignUse, tu, { method: 'GET' }), await call(radarUse, tu, { method: 'GET' })];
  check('S7 usage endpoints: 401 without a session, 405 on GET (4 of 4)', nr.map((r) => r.statusCode).join() === '401,401,405,405', nr.map((r) => r.statusCode).join());
  const ts = await call(trialStatus, st, { method: 'GET' });
  const pf = ts.body?.perFeature;
  check('S8 trial-status perFeature reflects the counts (research 2, outreach 2, others 0)', ts.statusCode === 200 && pf?.research_runs?.used === 2 && pf?.outreach_drafts?.used === 2 && pf?.campaign_drafts?.used === 0 && pf?.trend_radar_scans?.used === 0, JSON.stringify(pf && Object.fromEntries(Object.entries(pf).map(([k, v]) => [k, v.used]))));
}

try { await main(); } catch (e) { failures++; console.log('FAIL  unexpected error:', e?.message); console.log(e?.stack); }
finally {
  try {
    await owner.query('delete from outreach_emails where tenant_id = any($1)', [made]);
    await owner.query('delete from prospects where tenant_id = any($1)', [made]);
    await owner.query('delete from prospect_runs where tenant_id = any($1)', [made]);
    await owner.query('delete from tenant_features where tenant_id = any($1)', [made]);
    await owner.query('delete from tenant_usage where tenant_id = any($1)', [made]);
    await owner.query('delete from tenants where id = any($1)', [made]);
    const { rows } = await owner.query(`select (select count(*) from tenants where id like $1)::int t, (select count(*) from tenant_usage where tenant_id like $1)::int u`, [P + '%']);
    check('CLEANUP no rlstest_p1b_ rows remain', rows[0].t === 0 && rows[0].u === 0, JSON.stringify(rows[0]));
  } catch (e) { failures++; console.log('FAIL  cleanup:', e?.message); }
  await owner.end();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exitCode = failures ? 1 : (process.exitCode || 0);
}
