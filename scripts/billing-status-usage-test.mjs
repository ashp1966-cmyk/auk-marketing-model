// Phase 2 (b) test: /api/billing/status `usage` fields, plus the PARITY check against the real gate (generate.js), on rls-test.
//   node --experimental-test-module-mocks scripts/billing-status-usage-test.mjs                      # normal
//   DRAFT_DRY_RUN=true node --experimental-test-module-mocks scripts/billing-status-usage-test.mjs   # dry run
// Real handlers + real withTenant/Postgres/RLS. Stubbed: auth.js, global fetch (Anthropic only, never real), and a db
// wrapper that can fail the Nth withTenant call (to simulate the Trend Radar switch lookup failing).
// Safety: both DB urls must be ep-royal-heart (rls-test). Fixtures are prefixed rlstest_p2b_ and deleted by exact id.
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
globalThis.fetch = async (url) => {
  if (String(url) !== 'https://api.anthropic.com/v1/messages') throw new Error(`Unexpected fetch to ${url}`);
  return { status: 200, json: async () => ({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
};
const realDb = await import('../api/_lib/db.js');
let dbCalls = 0, failOnCall = 0;
mock.module(new URL('../api/_lib/db.js', import.meta.url).href, {
  exports: { ...realDb, withTenant: (...a) => { dbCalls++; if (failOnCall && dbCalls === failOnCall) return Promise.reject(Object.assign(new Error('injected db failure'), { code: 'XX000' })); return realDb.withTenant(...a); } },
});
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: { resolveOrgId: async (req) => { const t = req.headers['x-test-tenant']; return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` }; } },
});
const { default: statusH } = await import('../api/billing/status.js');
const { default: generate } = await import('../api/generate.js');
const { nextMonthStartISO } = await import('../api/_lib/plan-limits.js');

const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (n, pass, d = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  -- ' + d : ''}`); };

const TABLE = {   // written out independently of the module
  PLN_nxjgctcp3gxlct6: ['Startup', { research_runs: 4, trend_radar_scans: 2, campaign_drafts: 15, outreach_drafts: 30 }],
  PLN_ek4cmy74mxanywt: ['Starter', { research_runs: 10, trend_radar_scans: 4, campaign_drafts: 40, outreach_drafts: 100 }],
  PLN_qlsyv2l059kp4ra: ['Growth', { research_runs: 30, trend_radar_scans: 12, campaign_drafts: 120, outreach_drafts: 300 }],
  PLN_sgi2vn2qnmhnysg: ['Agency', { research_runs: 100, trend_radar_scans: 40, campaign_drafts: 400, outreach_drafts: 1000 }],
};
const TRIAL = { research_runs: 2, trend_radar_scans: 1, campaign_drafts: 2, outreach_drafts: 2 };
const FEATS = ['research_runs', 'trend_radar_scans', 'campaign_drafts', 'outreach_drafts'];
const LABEL = { research_runs: 'Research runs', trend_radar_scans: 'Trend Radar scans', campaign_drafts: 'Campaign drafts', outreach_drafts: 'Outreach email drafts' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const now = new Date();
const RESET_TEXT = `1 ${MONTHS[(now.getUTCMonth() + 1) % 12]}`;
const RESET_ISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

const P = 'rlstest_p2b_';
const made = [];
async function mk(name, { plan = null, status = 'active', radar = false, ageDays = 0 } = {}) {
  const id = P + name; made.push(id);
  await owner.query(`insert into tenants (id, name, billing_status, plan_code, created_at) values ($1,$2,$3,$4, now() - ($5 || ' days')::interval)`, [id, 'p2b ' + name, status, plan, String(ageDays)]);
  if (radar) await owner.query(`insert into tenant_features (tenant_id, feature, enabled, updated_by) values ($1,'trend_radar',true,'p2b-test')`, [id]);
  return id;
}
const seed = (t, col, n, monthsAgo = 0) => owner.query(
  `insert into tenant_usage (tenant_id, month, ${col}) values ($1, (date_trunc('month', now()) - ($3 || ' months')::interval)::date, $2)
   on conflict (tenant_id, month) do update set ${col} = excluded.${col}`, [t, n, String(monthsAgo)]);
async function call(handler, tenant, { method = 'POST', body } = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers: { 'x-test-tenant': tenant }, body }, res);
  return res;
}
const status = (t, method = 'GET') => call(statusH, t, { method });
const bodies = {};
for (const { feature, payload } of realPayloads('p2b prompt')) bodies[feature] ??= payload;
const gen = (t, f) => call(generate, t, { body: bodies[f] });
const snap = async (ids) => JSON.stringify([
  (await owner.query('select id, billing_status, plan_code, paid_until, cancel_at_period_end from tenants where id = any($1) order by id', [ids])).rows,
  (await owner.query('select tenant_id, month::text, research_runs, campaign_drafts, outreach_drafts, trend_radar_scans, emails_sent from tenant_usage where tenant_id = any($1) order by 1,2', [ids])).rows]);

async function main() {
  const { rows: pre } = await owner.query('select id from tenants where id like $1', [P + '%']);
  if (pre.length) { console.error('REFUSING: fixtures exist'); process.exitCode = 2; return; }

  // ---------- 1. active, each plan
  let ok = true, why = '';
  const activeIds = [];
  for (const [code, [name, lim]] of Object.entries(TABLE)) {
    const t = await mk('act_' + name, { plan: code, radar: true }); activeIds.push(t);
    FEATS.forEach((f, i) => seed(t, f, [1, 1, 2, 3][i]));
    await Promise.all(FEATS.map((f, i) => seed(t, f, [1, 1, 2, 3][i])));
    await seed(t, 'research_runs', 0, 1);   // an unrelated empty row last month
    const r = await status(t); const u = r.body?.usage;
    const good = r.statusCode === 200 && u?.kind === 'active' && u.window === 'month' && u.planName === name && u.resetsOn === RESET_ISO && u.resetsText === RESET_TEXT && u.trialEndsAt === null
      && FEATS.every((f, i) => u.features[f].limit === lim[f] && u.features[f].used === [1, 1, 2, 3][i] && u.features[f].label === LABEL[f] && u.features[f].enabled === true);
    if (!good) { ok = false; why += ` ${name}:${JSON.stringify(u)?.slice(0, 120)}`; }
  }
  check('H1 active on each of the 4 plans: window month, plan name, the right limits (4 x 4), used = this month, reset date and text, labels, radar enabled', ok, why);
  check('H1 pure: next-month ISO date rolls December to January of the next year', nextMonthStartISO(new Date('2026-12-15T10:00:00Z')) === '2027-01-01' && nextMonthStartISO(new Date('2026-01-31T23:59:59Z')) === '2026-02-01');

  // ---------- 2. windows
  const am = await mk('actlast', { plan: 'PLN_ek4cmy74mxanywt', radar: true });
  await seed(am, 'campaign_drafts', 39, 1);
  const ra = await status(am);
  check('H2 active: last month\'s usage is excluded (39 last month, 0 this month -> used 0)', ra.body?.usage?.features?.campaign_drafts?.used === 0);
  const tm = await mk('trialwin', { status: 'trialing' });
  await seed(tm, 'campaign_drafts', 1, 1); await seed(tm, 'campaign_drafts', 1, 0);
  const rt = await status(tm); const ut = rt.body?.usage;
  const created = (await owner.query('select created_at from tenants where id=$1', [tm])).rows[0].created_at;
  check('H2 trialing: usage is summed across months (1 last month + 1 this month -> used 2)', ut?.features?.campaign_drafts?.used === 2);
  check('H3 trialing: window total, limits 2/2/2/1, no plan name, no reset, trial end = created + 7 days',
    ut?.kind === 'trialing' && ut.window === 'total' && ut.planName === null && ut.resetsOn === null && ut.resetsText === null
    && FEATS.every((f) => ut.features[f].limit === TRIAL[f]) && ut.trialEndsAt === new Date(new Date(created).getTime() + 7 * 86400000).toISOString(), JSON.stringify(ut)?.slice(0, 200));

  // ---------- 3. no meters
  const none = [await mk('int', { plan: 'internal', status: 'trialing' }), await mk('can', { status: 'cancelled', plan: 'PLN_nxjgctcp3gxlct6' }), await mk('weird', { status: 'past_due' })];
  const nr = []; for (const t of none) nr.push((await status(t)).body?.usage);
  check('H4 internal, cancelled and an unrecognized status: usage is null (3 of 3)', nr.every((u) => u === null), JSON.stringify(nr));
  const unk = [await mk('unkplan', { plan: 'PLN_not_live' }), await mk('nullplan', { plan: null })];
  const ur = []; for (const t of unk) ur.push((await status(t)).body?.usage);
  check('H4 active on an unknown plan or a null plan: kind unrecognized, no features, no plan name (2 of 2)', ur.every((u) => u?.kind === 'unrecognized' && u.features === null && u.planName === null && u.resetsOn === null));

  // ---------- 4. switch
  const on = await mk('swon', { plan: 'PLN_nxjgctcp3gxlct6', radar: true }), off = await mk('swoff', { plan: 'PLN_nxjgctcp3gxlct6' });
  const ron = await status(on), roff = await status(off);
  check('H5 Trend Radar enabled follows the tenant switch (on -> true, no row -> false); the other three are always true',
    ron.body.usage.features.trend_radar_scans.enabled === true && roff.body.usage.features.trend_radar_scans.enabled === false
    && ['research_runs', 'campaign_drafts', 'outreach_drafts'].every((f) => roff.body.usage.features[f].enabled === true));
  const fl = await mk('swfail', { plan: 'PLN_nxjgctcp3gxlct6', radar: true }); await seed(fl, 'research_runs', 3);
  const logs = []; const oe = console.error; console.error = (...a) => logs.push(a.join(' '));
  dbCalls = 0; failOnCall = 2; const rf = await status(fl); failOnCall = 0; console.error = oe;
  check('H5 a failed switch lookup shows "off", logs the code only, and the numbers still arrive (200, research 3 of 4)',
    rf.statusCode === 200 && rf.body.usage.features.trend_radar_scans.enabled === false && rf.body.usage.features.research_runs.used === 3 && logs.some((l) => l.includes('[billing-status] feature switch lookup failed XX000')) && !logs.some((l) => l.includes('injected')));

  // ---------- 5. unchanged contract, auth, no writes
  const before = await snap([...activeIds, am, tm, ...none, ...unk, on, off, fl]);
  const rr = await status(activeIds[0]); const b = rr.body;
  const text = JSON.stringify(b);
  check('H6 existing fields still present with the same names; no subscription code or email token in the response',
    ['billingStatus', 'planCode', 'paidUntil', 'cancelAtPeriodEnd', 'hasSubscriptionOnFile'].every((k) => k in b) && typeof b.hasSubscriptionOnFile === 'boolean' && !/email_token|subscription_code|paystack/i.test(text));
  const a401 = await status('none'), a405 = await status(activeIds[0], 'POST');
  check('H7 401 without a session, 405 on POST', a401.statusCode === 401 && a405.statusCode === 405);
  for (const t of [...activeIds, am, tm, ...none, ...unk, on, off, fl]) await status(t);
  check('H7 nothing is written: tenants and usage rows identical after 18 more status reads', (await snap([...activeIds, am, tm, ...none, ...unk, on, off, fl])) === before);

  // ---------- 6. PARITY with the real gate
  let pOk = 0, pBad = '';
  for (const [code, [name, lim]] of Object.entries(TABLE)) {
    for (const f of FEATS) {
      const t = await mk(`par_${name}_${f}`, { plan: code, radar: true });
      await seed(t, f, 7, 1);                                    // a large number LAST month: must not count
      await seed(t, f, lim[f] - 1);
      const s1 = (await status(t)).body.usage; const g1 = await gen(t, f);
      await seed(t, f, lim[f]);
      const s2 = (await status(t)).body.usage; const g2 = await gen(t, f);
      const wantMsg = `You've used all ${lim[f]} ${{ research_runs: 'research runs', trend_radar_scans: 'Trend Radar scans', campaign_drafts: 'campaign drafts', outreach_drafts: 'outreach email drafts' }[f]} included in your ${name} plan this month. They reset on ${s2.resetsText}. To change plan, email sales@auk-maritime.com.`;
      const good = s1.features[f].used === lim[f] - 1 && g1.statusCode === 200 && s2.features[f].used === lim[f] && g2.statusCode === 402 && g2.body?.error === 'plan_limit_reached' && g2.body?.message === wantMsg;
      if (good) pOk++; else pBad += ` ${name}/${f}:${s1.features[f].used},${g1.statusCode},${s2.features[f].used},${g2.statusCode}`;
    }
  }
  check('PARITY paid: for every plan x feature (16 of 16) the status "used" equals what the gate compares: passes at limit-1, blocks at the limit, with the SAME reset date text', pOk === 16, `ok=${pOk} bad=${pBad}`);
  pOk = 0; pBad = '';
  for (const f of FEATS) {
    const t = await mk(`partrial_${f}`, { status: 'trialing', radar: true });
    await seed(t, f, TRIAL[f] - 1, 1);                           // trial total spans months
    const s1 = (await status(t)).body.usage; const g1 = await gen(t, f);
    await seed(t, f, TRIAL[f], 1); await owner.query(`delete from tenant_usage where tenant_id=$1 and month = date_trunc('month', now())::date`, [t]);
    const s2 = (await status(t)).body.usage; const g2 = await gen(t, f);
    const good = s1.features[f].used === TRIAL[f] - 1 && g1.statusCode === 200 && s2.features[f].used === TRIAL[f] && g2.statusCode === 402 && g2.body?.error === 'trial_cap_reached';
    if (good) pOk++; else pBad += ` ${f}:${s1.features[f].used},${g1.statusCode},${s2.features[f].used},${g2.statusCode}`;
  }
  check('PARITY trial: for each feature (4 of 4) the status total equals what the gate compares, across months: passes at cap-1, blocks at the cap', pOk === 4, `ok=${pOk} bad=${pBad}`);
}

try { await main(); } catch (e) { failures++; console.log('FAIL  unexpected error:', e?.message); console.log(e?.stack); }
finally {
  try {
    await owner.query('delete from tenant_features where tenant_id = any($1)', [made]);
    await owner.query('delete from tenant_usage where tenant_id = any($1)', [made]);
    await owner.query('delete from tenants where id = any($1)', [made]);
    const { rows } = await owner.query(`select (select count(*) from tenants where id like $1)::int t, (select count(*) from tenant_usage where tenant_id like $1)::int u`, [P + '%']);
    check('CLEANUP no rlstest_p2b_ rows remain', rows[0].t === 0 && rows[0].u === 0, JSON.stringify(rows[0]));
  } catch (e) { failures++; console.log('FAIL  cleanup:', e?.message); }
  await owner.end();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exitCode = failures ? 1 : (process.exitCode || 0);
}
