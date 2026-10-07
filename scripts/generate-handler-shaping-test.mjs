// Handler-level test for api/generate.js request shaping + gate ordering, against the rls-test branch.
//
// Usage (two passes):
//   node --experimental-test-module-mocks scripts/generate-handler-shaping-test.mjs                      # normal
//   DRAFT_DRY_RUN=true node --experimental-test-module-mocks scripts/generate-handler-shaping-test.mjs   # dry run
//
// Real handler + real withTenant/Postgres/RLS/trial gate. Stubbed: api/_lib/auth.js (Clerk can't run here)
// and global fetch: the fetch stub CAPTURES what would go upstream to Anthropic and answers it; any other
// URL throws. NO real Anthropic call is ever made (a dummy key is set in this process only).
//
// DRY RUN: api/_lib/anthropic-client.js reads DRAFT_DRY_RUN once, at import. So the dry-run pass is a SECOND
// process with the variable exported in the shell, the way CLAUDE.md says local-only flags must be set
// (never in Vercel's scopes). The script detects the mode from the same variable and prints it.
//
// Safety: aborts unless BOTH DATABASE_URL_TENANT_APP and DATABASE_URL point at ep-royal-heart (rls-test);
// prints only hosts. Refuses to run if any fixture id already exists. Fixture rows (3 tenants + 1 usage row)
// are deleted by exact id in a finally block; `created` is set BEFORE inserting so a partial failure is
// still cleaned up.

import { mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { realPayloads } from './lib/real-generate-payloads.mjs';
import { FEATURE_RULES } from '../api/_lib/generate-request.js';

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

// --- stub global fetch: record upstream Anthropic requests, answer them, throw on anything else.
const upstream = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url) === 'https://api.anthropic.com/v1/messages') {
    upstream.push(JSON.parse(init.body));
    return { status: 200, json: async () => ({ id: 'msg_stub', type: 'message', role: 'assistant', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  }
  throw new Error(`Unexpected fetch to ${url}`);
};

// --- stub auth only; db is REAL.
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: {
    resolveOrgId: async (req) => {
      const t = req.headers['x-test-tenant'];
      return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` };
    },
  },
});
const { default: handler } = await import('../api/generate.js');

// --- fixtures
const INTERNAL = 'rlstest_gen_internal';  // plan_code 'internal': exempt from the gate
const TRIAL = 'rlstest_gen_trial';        // trialing, within 7 days, no usage
const CAPPED = 'rlstest_gen_capped';      // trialing, campaign_drafts already at its cap of 2
const ids = [INTERNAL, TRIAL, CAPPED];
const PROMPT = 'Test prompt for the shaping test';

const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };

async function call(tenant, body) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method: 'POST', headers: { 'x-test-tenant': tenant }, body }, res);
  return res;
}
// Phase 1b: generate.js counts each AI call exactly once, at the call. So the fixtures' total use must grow by exactly
// the number of upstream calls (and by 0 in dry run), and by nothing else.
const usageTotal = async () => (await owner.query(
  'select coalesce(sum(research_runs + campaign_drafts + outreach_drafts + trend_radar_scans), 0)::int as n from tenant_usage where tenant_id = any($1)', [ids])).rows[0].n;

function expectedUpstream(p) {
  const e = { model: 'claude-sonnet-4-6', max_tokens: p.max_tokens, messages: [{ role: 'user', content: PROMPT }] };
  if (FEATURE_RULES[p.feature].webSearch) e.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  return e;
}

// Exact customer-facing over-ceiling messages, written out independently of the module so a wording
// change is caught. Same hints as the pure test.
const HINTS = {
  campaign_drafts: 'for example the service name, audience, geography or segments',
  outreach_drafts: "for example the prospect's company name, contact name or rationale",
  research_runs: 'for example the service name, audience, geography or segments',
  trend_radar_scans: 'for example the number or length of your service names',
};
const TOO_LONG = (f) => `This request is too long to process. Please shorten the text you've entered (${HINTS[f]}) and try again, or email sales@auk-maritime.com if it keeps happening.`;

let created = false;
async function main() {
  const real = realPayloads(PROMPT);
  check('found exactly 5 real call sites in src/App.jsx', real.length === 5);

  const { rows: pre } = await owner.query('select id from tenants where id = any($1)', [ids]);
  if (pre.length) { console.error('REFUSING: fixture ids already exist:', pre.map((r) => r.id).join(', ')); process.exitCode = 2; return; }
  created = true;  // BEFORE inserting: a partial failure is still cleaned up by id
  await owner.query(`insert into tenants (id, name, billing_status, plan_code) values
    ($1, 'RLS Test gen internal', 'trialing', 'internal'), ($2, 'RLS Test gen trial', 'trialing', null), ($3, 'RLS Test gen capped', 'trialing', null)`, [INTERNAL, TRIAL, CAPPED]);
  await owner.query(`insert into tenant_usage (tenant_id, month, campaign_drafts) values ($1, date_trunc('month', now())::date, 2)`, [CAPPED]);
  const usageBefore = await usageTotal();

  // A. Each real payload, as the internal tenant.
  for (const { feature, payload } of real) {
    const label = `${feature} (max_tokens ${payload.max_tokens}${payload.tools ? ', web_search' : ''})`;
    const before = upstream.length;
    const r = await call(INTERNAL, payload);
    const sent = upstream.length - before;
    if (DRY) {
      check(`A. ${label}: 200, canned dry-run response, 0 upstream calls`, r.statusCode === 200 && r.body?.model === 'dry-run' && sent === 0, `status=${r.statusCode} model=${r.body?.model} upstream=${sent}`);
    } else {
      const body = upstream[upstream.length - 1];
      check(`A. ${label}: 200, exactly 1 upstream call`, r.statusCode === 200 && sent === 1 && r.body?.id === 'msg_stub', `status=${r.statusCode} upstream=${sent}`);
      check(`A. ${label}: upstream body is exactly the shaped request, no extra keys`, sent === 1 && isDeepStrictEqual(body, expectedUpstream(payload)));
      if (feature === 'trend_radar_scans') check('A. trend radar: upstream web_search has max_uses 5 (client sent none)', body?.tools?.[0]?.max_uses === 5);
    }
  }

  // B. Rejections: 400, correct code, nothing upstream; as internal AND as trialing (shaping runs before the gate and before dry run).
  const camp = real.find((r) => r.feature === 'campaign_drafts').payload;
  const res = real.find((r) => r.feature === 'research_runs').payload;
  const tooLong = (f) => ({ ...real.find((r) => r.feature === f).payload, messages: [{ role: 'user', content: 'x'.repeat(FEATURE_RULES[f].maxPromptChars + 1) }] });
  const bad = [
    ['extra field "system"', { ...camp, system: 'x' }, 'invalid_request'],
    ['model opus', { ...camp, model: 'claude-opus-4-1' }, 'invalid_request'],
    ['campaign max_tokens 1201', { ...camp, max_tokens: 1201 }, 'invalid_request'],
    ['tools on a campaign request', { ...camp, tools: res.tools }, 'invalid_request'],
    ['research web_search max_uses 6', { ...res, tools: [{ ...res.tools[0], max_uses: 6 }] }, 'invalid_request'],
    ...Object.keys(HINTS).map((f) => [`${f} prompt one over its ceiling`, tooLong(f), 'prompt_too_long', TOO_LONG(f)]),
  ];
  for (const tenant of [INTERNAL, TRIAL]) {
    for (const [name, payload, code, message] of bad) {
      const before = upstream.length;
      const r = await call(tenant, payload);
      const msgOk = message === undefined || r.body?.message === message;   // exact per-feature message when one is expected
      check(`B. ${tenant.replace('rlstest_gen_', '')}: ${name} -> 400 ${code}${message ? ' + exact message' : ''}, 0 upstream`,
        r.statusCode === 400 && r.body?.error === code && msgOk && upstream.length === before, `status=${r.statusCode} error=${r.body?.error}`);
    }
  }
  for (const f of Object.keys(HINTS)) {
    const r = await call(INTERNAL, tooLong(f));
    check(`B. ${f}: message exactly equals the approved template with its own hint, and has no internals`,
      r.body?.message === TOO_LONG(f) && !/max_tokens|ceiling|chars|notes/i.test(r.body?.message));
  }
  // Exactly at the ceiling is accepted through the real handler (inclusive).
  for (const f of Object.keys(HINTS)) {
    const p = { ...real.find((r) => r.feature === f).payload, messages: [{ role: 'user', content: 'x'.repeat(FEATURE_RULES[f].maxPromptChars) }] };
    const before = upstream.length;
    const r = await call(INTERNAL, p);
    check(`B. ${f}: prompt exactly at its ceiling -> 200 (${DRY ? '0' : '1'} upstream)`, r.statusCode === 200 && upstream.length - before === (DRY ? 0 : 1), `status=${r.statusCode}`);
  }

  // C. Gate unchanged for valid payloads.
  let before = upstream.length;
  let r = await call(TRIAL, camp);
  check(`C. trialing within cap + valid payload -> 200 (${DRY ? '0' : '1'} upstream)`, r.statusCode === 200 && upstream.length - before === (DRY ? 0 : 1), `status=${r.statusCode}`);
  before = upstream.length;
  r = await call(CAPPED, camp);
  check('C. trialing AT cap + valid payload -> 402 trial_cap_reached, 0 upstream', r.statusCode === 402 && r.body?.error === 'trial_cap_reached' && upstream.length === before, `status=${r.statusCode}`);
  before = upstream.length;
  r = await call(CAPPED, { ...camp, system: 'x' });
  check('C. trialing AT cap + INVALID payload -> 400 (shaping runs before the gate; documented change)', r.statusCode === 400 && upstream.length === before, `status=${r.statusCode}`);

  // E. Non-string features at the handler: 400 from generate.js's own check, never a 500.
  for (const [label, f] of [['array ["research_runs"]', ['research_runs']], ['number', 1], ['null', null], ['object', {}], ['boolean', true], ['"constructor"', 'constructor'], ['"toString"', 'toString']]) {
    before = upstream.length;
    r = await call(TRIAL, { ...res, feature: f });
    check(`E. feature ${label} -> 400 Missing or unrecognized feature, 0 upstream`, r.statusCode === 400 && r.body?.error === 'Missing or unrecognized feature' && upstream.length === before, `status=${r.statusCode}`);
  }

  // D. Phase 1b: every upstream call was counted exactly once, and rejected requests counted nothing.
  const added = (await usageTotal()) - usageBefore;
  check(`D. the fixtures' use grew by exactly one unit per upstream call (${DRY ? 'dry run: 0' : upstream.length})`, added === (DRY ? 0 : upstream.length), `added=${added} upstream=${upstream.length}`);
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (created) {
      try {
        await owner.query('delete from tenant_usage where tenant_id = any($1)', [ids]);
        await owner.query('delete from tenants where id = any($1)', [ids]);
        console.log('Cleanup: removed the rlstest_gen_ tenants and usage rows');
      } catch (e) { failures++; console.error('Cleanup failed:', e.message); }
    }
    await owner.end();
    if (process.exitCode === 2) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
