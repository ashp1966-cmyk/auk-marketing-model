// Phase 1b cron test (api/cron-follow-up.js skip reasons + counting), against rls-test.
//   node scripts/phase1b-cron-test.mjs                      # normal
//   DRAFT_DRY_RUN=true node scripts/phase1b-cron-test.mjs   # dry run
// Real handler + real owner-connection SQL. Only Anthropic is stubbed (other fetches pass through: neon's HTTP tag needs them).
// REFUSES to run if rls-test already has follow-up-eligible rows for non-fixture tenants (the cron is cross-tenant).
import { readFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const DRY = process.env.DRAFT_DRY_RUN === 'true';
console.log(DRY ? 'MODE: dry run' : 'MODE: normal');
function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  const m = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(new RegExp(`^${name}=["']?([^"'\\r\\n]+)["']?`, 'm'));
  if (!m) throw new Error(`${name} not found`);
  return process.env[name] = m[1];
}
const ownerUrl = loadEnv('DATABASE_URL');
const host = new URL(ownerUrl).host; console.log('owner host:', host);
if (!host.includes('ep-royal-heart')) { console.error('REFUSING: not rls-test.'); process.exit(1); }
process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy-not-a-real-key';
process.env.CRON_SECRET = 'p1b-cron-test-secret';

const realFetch = globalThis.fetch; let anthropicCalls = 0, anthropicFail = false;
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://api.anthropic.com/v1/messages') {
    anthropicCalls++;
    if (anthropicFail) return { status: 500, json: async () => ({ type: 'error', error: { message: 'boom' } }) };
    return { status: 200, json: async () => ({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: '{"subject":"Follow up","body":"Hello again"}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  }
  return realFetch(url, init);
};
const { default: cron } = await import('../api/cron-follow-up.js');
const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (n, p, d = '') => { if (!p) failures++; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  -- ' + d : ''}`); };
const P = 'rlstest_p1bcron_'; const made = [];
const run = async (auth = `Bearer ${process.env.CRON_SECRET}`) => {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await cron({ method: 'GET', headers: { authorization: auth } }, res);
  return res;
};
async function mk(name, { plan = null, status = 'trialing', ageDays = 0, outreach = 0 } = {}) {
  const id = P + name; made.push(id);
  await owner.query(`insert into tenants (id, name, billing_status, plan_code, created_at) values ($1,$2,$3,$4, now() - ($5 || ' days')::interval)`, [id, 'p1bcron ' + name, status, plan, String(ageDays)]);
  if (outreach) await owner.query(`insert into tenant_usage (tenant_id, month, outreach_drafts) values ($1, date_trunc('month', now())::date, $2)`, [id, outreach]);
  const { rows: [r] } = await owner.query(`insert into prospect_runs (tenant_id, service_name, criteria, status) values ($1,'Svc','{}'::jsonb,'done') returning id`, [id]);
  const { rows: [p] } = await owner.query(`insert into prospects (run_id, tenant_id, company_name, contact_email, verified, status, is_peer) values ($1,$2,'Acme','a@acme.test',true,'sent',false) returning id`, [r.id, id]);
  const { rows: [e] } = await owner.query(`insert into outreach_emails (prospect_id, tenant_id, subject, body, sent_at, dry_run, approved_by) values ($1,$2,'s','b', now() - interval '6 days', false, 'u') returning id`, [p.id, id]);
  return { id, emailId: e.id };
}
const used = async (t) => (await owner.query('select coalesce(sum(outreach_drafts),0)::int n from tenant_usage where tenant_id=$1', [t])).rows[0].n;
const followUps = async (t) => (await owner.query('select count(*)::int n from outreach_emails where tenant_id=$1 and follow_up_of is not null', [t])).rows[0].n;

async function main() {
  const { rows: pre } = await owner.query('select id from tenants where id like $1', [P + '%']);
  if (pre.length) { console.error('REFUSING: fixtures exist'); process.exitCode = 2; return; }
  const { rows: other } = await owner.query(`select count(*)::int n from outreach_emails e where e.sent_at is not null and e.dry_run = false and e.sent_at <= now() - interval '5 days' and not exists (select 1 from outreach_emails f where f.follow_up_of = e.id)`);
  if (other[0].n) { console.error(`REFUSING: ${other[0].n} follow-up-eligible rows already exist on rls-test (non-fixture)`); process.exitCode = 2; return; }

  const un = await run('Bearer wrong');
  check('C0 wrong secret: 401, nothing happens', un.statusCode === 401 && anthropicCalls === 0);
  const T = {
    ok: await mk('ok'), capped: await mk('capped', { outreach: 2 }), expired: await mk('expired', { ageDays: 10 }),
    cancelled: await mk('cancelled', { status: 'cancelled' }), inactive: await mk('inactive', { status: 'weird' }),
    active: await mk('active', { status: 'active', plan: 'PLN_ek4cmy74mxanywt' }), internal: await mk('internal', { plan: 'internal' }),
    planlimit: await mk('planlimit', { status: 'active', plan: 'PLN_nxjgctcp3gxlct6', outreach: 30 }),   // Startup, 30 of 30 this month
    badplan: await mk('badplan', { status: 'active', plan: 'PLN_not_a_live_plan' }),
  };
  const r = await run();
  const by = Object.fromEntries(r.body.results.map((x) => [x.emailId, x]));
  const skipOf = (k) => by[T[k].emailId]?.skipped;
  check('C1 trial at outreach cap skipped: at_outreach_cap', skipOf('capped') === 'at_outreach_cap', String(skipOf('capped')));
  check('C2 expired trial skipped: trial_expired', skipOf('expired') === 'trial_expired', String(skipOf('expired')));
  check('C3 cancelled skipped: cancelled', skipOf('cancelled') === 'cancelled', String(skipOf('cancelled')));
  check('C4 unrecognized status skipped: inactive', skipOf('inactive') === 'inactive', String(skipOf('inactive')));
  check('C4b active tenant at its plan limit (Startup 30/30) skipped: at_plan_limit', skipOf('planlimit') === 'at_plan_limit', String(skipOf('planlimit')));
  check('C4c active tenant on an unknown plan skipped: plan_unrecognized', skipOf('badplan') === 'plan_unrecognized', String(skipOf('badplan')));
  const drafted = ['ok', 'active', 'internal'];
  check('C5 trial-OK, active and internal tenants are drafted (3 of 3), no skip reason', drafted.every((k) => by[T[k].emailId]?.ok === true && !by[T[k].emailId].skipped));
  check(`C6 anthropic called exactly ${DRY ? 0 : 3} times (only for drafted tenants)`, anthropicCalls === (DRY ? 0 : 3), `calls=${anthropicCalls}`);
  let skippedClean = true;
  for (const k of ['capped', 'expired', 'cancelled', 'inactive', 'planlimit', 'badplan']) if ((await followUps(T[k].id)) !== 0) skippedClean = false;
  skippedClean = skippedClean && (await used(T.capped.id)) === 2 && (await used(T.planlimit.id)) === 30 && (await used(T.badplan.id)) === 0 && (await used(T.expired.id)) + (await used(T.cancelled.id)) + (await used(T.inactive.id)) === 0;
  check('C7 skipped tenants got no follow-up row and no count (6 of 6)', skippedClean);
  check('C8 drafted tenants each got exactly 1 follow-up row (3 of 3)', (await Promise.all(drafted.map((k) => followUps(T[k].id)))).every((n) => n === 1));
  check(`C9 drafted tenants counted +${DRY ? 0 : 1} each`, (await Promise.all(drafted.map((k) => used(T[k].id)))).every((n) => n === (DRY ? 0 : 1)));
  check('C10 summary: checked 9, drafted 3, skipped 6, failed 0', r.body.checked === 9 && r.body.drafted === 3 && r.body.skipped === 6 && r.body.failed === 0,
    JSON.stringify({ c: r.body.checked, d: r.body.drafted, s: r.body.skipped, f: r.body.failed }));

  if (!DRY) {
    const F = await mk('fail');   // the 9 above now have follow-ups, so only F is eligible
    anthropicFail = true; const before = anthropicCalls;
    const fr = await run();
    anthropicFail = false;
    check('C11 failed draft (Anthropic 500): counted nothing, no follow-up row, failed 1', fr.body.failed === 1 && fr.body.drafted === 0 && (await used(F.id)) === 0 && (await followUps(F.id)) === 0 && anthropicCalls - before === 1,
      JSON.stringify({ f: fr.body.failed, d: fr.body.drafted }));
  }
}
try { await main(); } catch (e) { failures++; console.log('FAIL  unexpected error:', e?.message, e?.stack); }
finally {
  try {
    await owner.query('delete from outreach_emails where tenant_id = any($1)', [made]);
    await owner.query('delete from prospects where tenant_id = any($1)', [made]);
    await owner.query('delete from prospect_runs where tenant_id = any($1)', [made]);
    await owner.query('delete from tenant_usage where tenant_id = any($1)', [made]);
    await owner.query('delete from tenants where id = any($1)', [made]);
    const { rows } = await owner.query(`select (select count(*) from tenants where id like $1)::int t, (select count(*) from outreach_emails where tenant_id like $1)::int e`, [P + '%']);
    check('CLEANUP no rlstest_p1bcron_ rows remain', rows[0].t === 0 && rows[0].e === 0);
  } catch (e) { failures++; console.log('FAIL  cleanup:', e?.message); }
  await owner.end();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exitCode = failures ? 1 : (process.exitCode || 0);
}
