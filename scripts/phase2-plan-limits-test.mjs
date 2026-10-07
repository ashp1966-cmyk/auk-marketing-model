// Phase 2 step (a) test: per-plan monthly limits (plan-limits.js, trial-gate.js, usage-meter.js window, generate.js,
// save endpoints), against rls-test.
//   node --experimental-test-module-mocks scripts/phase2-plan-limits-test.mjs                      # normal
//   DRAFT_DRY_RUN=true node --experimental-test-module-mocks scripts/phase2-plan-limits-test.mjs   # dry run
// Real handlers + real withTenant/Postgres/RLS/gate. Stubbed: auth.js and global fetch (Anthropic only; never real).
// Safety: both DB urls must be ep-royal-heart (rls-test). Fixtures are prefixed rlstest_p2_ and deleted by exact id.
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

let delayMs = 0;
const upstream = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url) !== 'https://api.anthropic.com/v1/messages') throw new Error(`Unexpected fetch to ${url}`);
  upstream.push(JSON.parse(init.body));
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  return { status: 200, json: async () => ({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
};
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: { resolveOrgId: async (req) => { const t = req.headers['x-test-tenant']; return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` }; } },
});
const { default: generate } = await import('../api/generate.js');
const { default: prospectsH } = await import('../api/prospects.js');
const { default: outreachH } = await import('../api/outreach.js');
const { planLimits, resetDateText } = await import('../api/_lib/plan-limits.js');
const { planLimitReachedBody } = await import('../api/_lib/trial-gate.js');
const { reserveUnit, refundUnit } = await import('../api/_lib/usage-meter.js');
const { withTenant } = await import('../api/_lib/db.js');

const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (n, pass, d = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  -- ' + d : ''}`); };

// The table, written out independently of the module.
const TABLE = {
  PLN_nxjgctcp3gxlct6: ['Startup', { research_runs: 4, trend_radar_scans: 2, campaign_drafts: 15, outreach_drafts: 30 }],
  PLN_ek4cmy74mxanywt: ['Starter', { research_runs: 10, trend_radar_scans: 4, campaign_drafts: 40, outreach_drafts: 100 }],
  PLN_qlsyv2l059kp4ra: ['Growth', { research_runs: 30, trend_radar_scans: 12, campaign_drafts: 120, outreach_drafts: 300 }],
  PLN_sgi2vn2qnmhnysg: ['Agency', { research_runs: 100, trend_radar_scans: 40, campaign_drafts: 400, outreach_drafts: 1000 }],
};
const FEATS = ['research_runs', 'trend_radar_scans', 'campaign_drafts', 'outreach_drafts'];
const LABEL = { research_runs: 'research runs', trend_radar_scans: 'Trend Radar scans', campaign_drafts: 'campaign drafts', outreach_drafts: 'outreach email drafts' };

const P = 'rlstest_p2_';
const made = [];
async function mk(name, { plan = null, status = 'active', ageDays = 0, radar = false } = {}) {
  const id = P + name; made.push(id);
  await owner.query(`insert into tenants (id, name, billing_status, plan_code, created_at) values ($1,$2,$3,$4, now() - ($5 || ' days')::interval)`, [id, 'p2 ' + name, status, plan, String(ageDays)]);
  if (radar) await owner.query(`insert into tenant_features (tenant_id, feature, enabled, updated_by) values ($1,'trend_radar',true,'p2-test')`, [id]);
  return id;
}
const seed = (t, col, n, monthsAgo = 0) => owner.query(
  `insert into tenant_usage (tenant_id, month, ${col}) values ($1, (date_trunc('month', now()) - ($3 || ' months')::interval)::date, $2)
   on conflict (tenant_id, month) do update set ${col} = excluded.${col}`, [t, n, String(monthsAgo)]);
const bodies = {};
for (const { feature, payload } of realPayloads('p2 prompt')) bodies[feature] ??= payload;
async function call(handler, tenant, body, method = 'POST') {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers: { 'x-test-tenant': tenant }, body }, res);
  return res;
}
const gen = (t, f) => call(generate, t, bodies[f]);
const sumCol = async (t, col) => (await owner.query(`select coalesce(sum(${col}),0)::int n from tenant_usage where tenant_id=$1`, [t])).rows[0].n;
const rowCount = async (t) => (await owner.query('select count(*)::int n from tenant_usage where tenant_id=$1', [t])).rows[0].n;

async function main() {
  const { rows: pre } = await owner.query('select id from tenants where id like $1', [P + '%']);
  if (pre.length) { console.error('REFUSING: fixtures exist'); process.exitCode = 2; return; }

  // ---------- 1. pure plan-limits
  let allOk = true;
  for (const [code, [name, lim]] of Object.entries(TABLE)) {
    const got = planLimits(code);
    if (!got || got.name !== name || FEATS.some((f) => got[f] !== lim[f])) allOk = false;
  }
  check('P1 all 4 plans x 4 features return the right numbers (16 of 16) and names', allOk);
  const bad = ['', 'PLN_x', 'internal', null, undefined, 5, 'constructor', '__proto__', 'toString', 'hasOwnProperty', ['PLN_nxjgctcp3gxlct6'], { a: 1 }];
  check(`P1 ${bad.length} unknown / null / prototype / array / object plan codes all return null`, bad.every((c) => planLimits(c) === null));
  check('P1 reset date text: October -> "1 November", December -> "1 January", January -> "1 February"',
    resetDateText(new Date('2026-10-07T12:00:00Z')) === '1 November' && resetDateText(new Date('2026-12-31T23:59:59Z')) === '1 January' && resetDateText(new Date('2026-01-01T00:00:00Z')) === '1 February');
  const msg = planLimitReachedBody('research_runs', 'Starter', 10, new Date('2026-10-07T12:00:00Z'));
  check('P1 exact limit message (plural)', msg.error === 'plan_limit_reached' && msg.feature === 'research_runs'
    && msg.message === "You've used all 10 research runs included in your Starter plan this month. They reset on 1 November. To change plan, email sales@auk-maritime.com.", msg.message);
  const one = planLimitReachedBody('trend_radar_scans', 'X', 1, new Date('2026-10-07T12:00:00Z'));
  check('P1 singular wording when the limit is 1', one.message === "You've used your 1 Trend Radar scan included in your X plan this month. It resets on 1 November. To change plan, email sales@auk-maritime.com.", one.message);

  // ---------- 2. gate matrix: each plan x each feature, through the real generate handler
  const before = upstream.length; let passes = 0, blocks = 0, wrongBody = 0, wrongCount = 0;
  for (const [code, [name, lim]] of Object.entries(TABLE)) {
    for (const f of FEATS) {
      const limit = lim[f];
      const t = await mk(`m_${name}_${f}`, { plan: code, radar: true });
      await seed(t, f, limit - 1);                     // one unit left
      const r1 = await gen(t, f);
      if (r1.statusCode === 200) passes++;
      if (!DRY) {
        const r2 = await gen(t, f);                    // exactly at the limit now: blocked
        if (r2.statusCode === 402) blocks++;
        const want = `You've used all ${limit} ${LABEL[f]} included in your ${name} plan this month. They reset on ${resetDateText()}. To change plan, email sales@auk-maritime.com.`;
        if (r2.body?.error !== 'plan_limit_reached' || r2.body?.feature !== f || r2.body?.message !== want) wrongBody++;
        if ((await sumCol(t, f)) !== limit) wrongCount++;
      } else {
        await seed(t, f, limit);                       // dry run counts nothing, so seed the limit directly
        const r2 = await gen(t, f);
        if (r2.statusCode === 402 && r2.body?.error === 'plan_limit_reached') blocks++;
        if ((await sumCol(t, f)) !== limit) wrongCount++;
      }
    }
  }
  check('G1 exactly one unit left passes (16 of 16)', passes === 16, `passes=${passes}`);
  check('G2 exactly at the limit blocks with 402 plan_limit_reached (16 of 16)', blocks === 16, `blocks=${blocks}`);
  if (!DRY) check('G3 every blocked message names the right feature, number, plan and reset date (16 of 16), and usage stayed at the limit', wrongBody === 0 && wrongCount === 0, `wrongBody=${wrongBody} wrongCount=${wrongCount}`);
  else check('G3 (dry run) a call that passes counts nothing: usage stays at the seeded limit (16 of 16)', wrongCount === 0, `wrongCount=${wrongCount}`);
  check(`G4 upstream reached only by the passing calls (${DRY ? 0 : 16})`, upstream.length - before === (DRY ? 0 : 16), `upstream=${upstream.length - before}`);

  // ---------- 3. window semantics
  const lm = await mk('lastmonth', { plan: 'PLN_nxjgctcp3gxlct6' });
  await seed(lm, 'research_runs', 4, 1);               // used the whole Startup allowance LAST month
  const rl = await gen(lm, 'research_runs');
  check('W1 paid: last month\'s usage does not count (4/4 last month, call passes)', rl.statusCode === 200);
  const tl = await mk('trialprior', { status: 'trialing' });
  await seed(tl, 'research_runs', 2, 1);               // trial total across months: 2 of 2 used, in a prior month
  const rt = await gen(tl, 'research_runs');
  check('W2 trial: prior-month usage still counts toward the trial total (blocked, trial_cap_reached)', rt.statusCode === 402 && rt.body?.error === 'trial_cap_reached', `${rt.statusCode} ${rt.body?.error}`);
  const tm = await mk('windowdb', { plan: 'PLN_ek4cmy74mxanywt' });
  await seed(tm, 'campaign_drafts', 3, 1); await seed(tm, 'campaign_drafts', 1, 0);
  const rM = (limit, w) => withTenant(tm, async (c) => { await c.query('select pg_advisory_xact_lock(hashtext($1))', [tm]); return reserveUnit(c, tm, 'campaign_drafts', limit, w); });
  const a = await rM(2, 'month'), b = await rM(2, 'month'), c3 = await rM(2, 'total');
  check('W3 reserveUnit window month ignores last month (this month 1 -> 2 ok), then at the limit returns null; window total counts all months (null)', !!a && b === null && c3 === null, `${a} ${b} ${c3}`);
  const un = await mk('unlimwin', { plan: 'internal', status: 'trialing' });
  const nl = await withTenant(un, (c) => reserveUnit(c, un, 'research_runs', null, 'month'));
  check('W4 a null limit counts whatever the window', !!nl);

  // ---------- 4. unrecognized plan, internal, cancelled, trial unchanged
  const ub = await mk('unknownplan', { plan: 'PLN_not_live' }), un2 = await mk('nullplan', { plan: null });
  const b0 = upstream.length;
  const u1 = await gen(ub, 'campaign_drafts'), u2 = await gen(un2, 'campaign_drafts');
  check('U1 active tenant on an unknown plan or a null plan: 402 plan_unrecognized, no upstream, nothing counted (2 of 2)',
    [u1, u2].every((r) => r.statusCode === 402 && r.body?.error === 'plan_unrecognized' && /sales@auk-maritime\.com/.test(r.body.message)) && upstream.length === b0 && (await rowCount(ub)) + (await rowCount(un2)) === 0);
  const ii = await mk('internal', { plan: 'internal', status: 'trialing', radar: true });
  const ir = []; for (let i = 0; i < 6; i++) ir.push((await gen(ii, 'outreach_drafts')).statusCode);
  check(`U2 internal is unlimited (6 calls, all 200, count ${DRY ? 0 : 6})`, ir.every((s) => s === 200) && (await sumCol(ii, 'outreach_drafts')) === (DRY ? 0 : 6));
  const cc = await mk('cancelled', { status: 'cancelled', plan: 'PLN_nxjgctcp3gxlct6' }), ee = await mk('expired', { status: 'trialing', ageDays: 10 });
  const cr = await gen(cc, 'research_runs'), er = await gen(ee, 'research_runs');
  check('U3 cancelled -> 402 subscription_cancelled, expired trial -> 402 trial_expired (unchanged)', cr.body?.error === 'subscription_cancelled' && er.body?.error === 'trial_expired');

  // ---------- 5. parallel, refund month, invalid window
  if (!DRY) {
    const pt = await mk('parallel', { plan: 'PLN_nxjgctcp3gxlct6' });
    await seed(pt, 'campaign_drafts', 10);             // 5 of 15 left
    delayMs = 40; const pb = upstream.length;
    const rs = await Promise.all(Array.from({ length: 20 }, () => gen(pt, 'campaign_drafts')));
    delayMs = 0;
    check('X1 20 parallel calls with 5 units left: exactly 5 succeed, 15 get 402, usage exactly 15', rs.filter((r) => r.statusCode === 200).length === 5 && rs.filter((r) => r.statusCode === 402).length === 15 && upstream.length - pb === 5 && (await sumCol(pt, 'campaign_drafts')) === 15);
    const rf = await mk('straddle', { plan: 'PLN_nxjgctcp3gxlct6' });
    await seed(rf, 'outreach_drafts', 1, 1); await seed(rf, 'outreach_drafts', 7, 0);
    const prev = (await owner.query(`select (date_trunc('month', now()) - interval '1 month')::date::text m`)).rows[0].m;
    await withTenant(rf, (c) => refundUnit(c, rf, 'outreach_drafts', prev));
    const rows = (await owner.query(`select month::text m, outreach_drafts n from tenant_usage where tenant_id=$1 order by month`, [rf])).rows;
    check('X2 month-straddle refund goes to the ORIGINAL month row (last month 1 -> 0), this month untouched (7)', rows.length === 2 && rows[0].n === 0 && rows[1].n === 7, JSON.stringify(rows));
  }
  const iw = await mk('badwindow', { plan: 'PLN_ek4cmy74mxanywt' });
  const badW = ['weekly', '', null, 'MONTH', 'Total', ['month'], { w: 'month' }, 5, "total'; drop table tenants; --"];
  let thrown = 0;
  for (const w of badW) { try { await withTenant(iw, async (c) => { await c.query('select pg_advisory_xact_lock(hashtext($1))', [iw]); return reserveUnit(c, iw, 'research_runs', 5, w); }); } catch { thrown++; } }
  check(`X3 an invalid window value throws (${badW.length} of ${badW.length}) and counts nothing (no usage rows)`, thrown === badW.length && (await rowCount(iw)) === 0, `thrown=${thrown} rows=${await rowCount(iw)}`);
  const stillTenants = (await owner.query('select count(*)::int n from tenants where id = $1', [iw])).rows[0].n;
  check('X4 the injection string in a window value did nothing (tenants table intact)', stillTenants === 1);

  // ---------- 6. save endpoints
  const sv = await mk('savepaid', { plan: 'PLN_nxjgctcp3gxlct6' });
  await seed(sv, 'research_runs', 4); await seed(sv, 'outreach_drafts', 30);
  const sr = await call(prospectsH, sv, { serviceName: 'S', candidates: [{ company_name: 'Z', contact_email: 'z@z.test', verified: true }] });
  const pid = sr.body?.run?.prospects?.[0]?.id;
  const so = await call(outreachH, sv, { prospectId: pid, subject: 's', body: 'b' });
  check('V1 paid at its limit (research 4/4, outreach 30/30): both saves still succeed (the AI call was already counted)', sr.statusCode === 200 && so.statusCode === 200, `${sr.statusCode} ${so.statusCode}`);
  const su = await mk('saveunknown', { plan: 'PLN_not_live' });
  const s1 = await call(prospectsH, su, { serviceName: 'S', candidates: [] }), s2 = await call(outreachH, su, { prospectId: 1, subject: 's', body: 'b' });
  check('V2 active tenant on an unknown plan: both save endpoints 402 plan_unrecognized (2 of 2)', [s1, s2].every((r) => r.statusCode === 402 && r.body?.error === 'plan_unrecognized'));
  check('V3 saves added nothing to the counts (research 4, outreach 30)', (await sumCol(sv, 'research_runs')) === 4 && (await sumCol(sv, 'outreach_drafts')) === 30);
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
    check('CLEANUP no rlstest_p2_ rows remain', rows[0].t === 0 && rows[0].u === 0, JSON.stringify(rows[0]));
  } catch (e) { failures++; console.log('FAIL  cleanup:', e?.message); }
  await owner.end();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exitCode = failures ? 1 : (process.exitCode || 0);
}
