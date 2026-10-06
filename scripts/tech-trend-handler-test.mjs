// Handler tests for api/tech-trend.js against the rls-test branch.
// Usage: node --experimental-test-module-mocks scripts/tech-trend-handler-test.mjs
// Real handler + real withTenant/Postgres/RLS (the internal check and every query run as tenant_app). Stubbed: auth.js
// (tenant from x-test-tenant) and a db wrapper that can fail on demand. SAFETY: aborts unless BOTH db URLs are
// ep-royal-heart (rls-test); prints only hosts; REFUSES to run if tech_trend_reports already holds any row (the table has
// no tenant_id, so cleanup cannot be scoped to fake tenants); cleans up by EXACT id (every id it creates is tracked)
// and the two fixture tenants, in a finally block; then a READ-ONLY count by prefix (never a delete by prefix) fails the
// run on any leftover.
import { mock } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
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

const realDb = await import('../api/_lib/db.js');
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: { resolveOrgId: async (req) => { const t = req.headers['x-test-tenant']; return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` }; } },
});
mock.module(new URL('../api/_lib/db.js', import.meta.url).href, {
  exports: { withTenant: (orgId, fn) => (globalThis.__failDb ? Promise.reject(new Error('simulated db failure')) : realDb.withTenant(orgId, fn)) },
});
const { default: handler } = await import('../api/tech-trend.js');

const TENANT_PREFIX = 'rlstest_tth_';
const TITLE_PREFIX = 'RLSTEST_TT_';
const ADMIN = TENANT_PREFIX + 'admin';       // plan_code 'internal'
const CUSTOMER = TENANT_PREFIX + 'customer'; // an ordinary tenant
const tenantIds = [ADMIN, CUSTOMER];
const reportIds = [];                         // every report id this test creates, for exact-id cleanup
const NO = 'Only the platform owner can manage this content';
const NONEXISTENT = '00000000-0000-4000-8000-000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const owner = new Pool({ connectionString: ownerUrl });
let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
check('fixture tenant id list has both distinct ids, each with the rlstest_tth_ prefix', tenantIds.length === 2 && new Set(tenantIds).size === 2 && tenantIds.every((i) => i.startsWith(TENANT_PREFIX)));

async function call(caller, method, { body, id } = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers: { 'x-test-tenant': caller }, body, query: id === undefined ? {} : { id } }, res);
  return res;
}
// Every POST goes through here so its id is tracked for exact-id cleanup.
async function post(body, caller = ADMIN) {
  const r = await call(caller, 'POST', { body });
  const id = r.body?.report?.id;
  if (id && !reportIds.includes(id)) reportIds.push(id);
  return r;
}
const COLS = 'id, title, topic, body, sources, as_of::text as as_of, published_by, published_at, updated_by, updated_at';
const allRows = async () => (await owner.query(`select ${COLS} from tech_trend_reports order by id`)).rows;
const snap = async () => JSON.stringify(await allRows());
const stored = async (id) => (await owner.query(`select ${COLS} from tech_trend_reports where id = $1`, [id])).rows[0];
const total = async () => (await owner.query('select count(*)::int as n from tech_trend_reports')).rows[0].n;
const mk = (o = {}) => ({ title: TITLE_PREFIX + 'report', topic: 'topic', body: 'body text', as_of: '2026-09-01', sources: [{ name: 'Source', url: 'https://example.com/a' }], ...o });
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const pad = (prefix, n) => prefix + 'x'.repeat(n - prefix.length);

let created = false;
async function main() {
  const [{ t }] = (await owner.query("select to_regclass('public.tech_trend_reports') as t")).rows;
  if (t === null) { console.error('REFUSING: tech_trend_reports does not exist on this database.'); process.exitCode = 2; return; }
  if ((await total()) !== 0) { console.error('REFUSING: tech_trend_reports is not empty. Remove those rows by hand first.'); process.exitCode = 2; return; }
  if ((await owner.query('select 1 from tenants where id = any($1)', [tenantIds])).rows.length) { console.error('REFUSING: fixture tenant ids already exist.'); process.exitCode = 2; return; }
  created = true;  // BEFORE inserting: a partial failure is still cleaned up by exact id
  await owner.query(`insert into tenants (id, name, billing_status, plan_code) values ($1,'tth admin','trialing','internal'), ($2,'tth customer','active',null)`, tenantIds);

  const seed = await post(mk({ title: TITLE_PREFIX + 'seed' }));
  check('seed report created by the internal tenant (200 + uuid id)', seed.statusCode === 200 && UUID_RE.test(seed.body?.report?.id || ''), `status=${seed.statusCode}`);
  const SEED = seed.body?.report?.id;
  const base = await snap();

  // ---------- 1. non-AUK callers learn nothing: 403 first, for everything
  for (const [label, method, opts] of [
    ['POST valid body', 'POST', { body: mk() }], ['POST invalid body', 'POST', { body: 'x' }], ['POST empty object', 'POST', {}],
    ['PUT valid id and body', 'PUT', { id: SEED, body: mk({ title: TITLE_PREFIX + 'hijack' }) }], ['PUT malformed id', 'PUT', { id: 'not-a-uuid', body: mk() }],
    ['PUT non-existent id', 'PUT', { id: NONEXISTENT, body: mk() }], ['PUT invalid body', 'PUT', { id: SEED, body: 5 }],
    ['DELETE existing id', 'DELETE', { id: SEED }], ['DELETE malformed id', 'DELETE', { id: 'x' }], ['DELETE non-existent id', 'DELETE', { id: NONEXISTENT }], ['DELETE with no id', 'DELETE', {}],
  ]) {
    const r = await call(CUSTOMER, method, opts);
    check(`1. non-AUK ${label}: 403 first, identical answer`, r.statusCode === 403 && r.body?.error === NO && r.body?.report === undefined, `status=${r.statusCode}`);
  }
  check('1. no session: 401', (await call('none', 'POST', { body: mk() })).statusCode === 401);
  check('1. PATCH: 405', (await call(ADMIN, 'PATCH', {})).statusCode === 405);
  check('1. a non-AUK caller changed nothing', (await snap()) === base);
  let r = await call(CUSTOMER, 'GET');
  check('1. non-AUK GET: 200, the shared reports, canManage false', r.statusCode === 200 && r.body?.canManage === false && r.body?.reports?.some((x) => x.id === SEED));
  check('1. each listed report has the full shape, with as_of as plain text', r.body.reports.every((x) => ['id', 'title', 'topic', 'body', 'sources', 'as_of', 'published_by', 'published_at', 'updated_by', 'updated_at'].every((k) => k in x) && /^\d{4}-\d{2}-\d{2}$/.test(x.as_of) && Array.isArray(x.sources)));
  r = await call(ADMIN, 'GET');
  check('1. AUK GET: 200, canManage true', r.statusCode === 200 && r.body?.canManage === true);
  check('1. GET with no session: 401', (await call('none', 'GET')).statusCode === 401);

  // ---------- 2. AUK validation: 400 invalid_report, nothing written
  const url2001 = 'https://e.example/' + 'a'.repeat(2001 - 'https://e.example/'.length);
  const many = Array.from({ length: 21 }, (_, i) => ({ name: 'S' + i }));
  const bad = [
    ['body is a string', 'x'], ['body is an array', []], ['body is null', null],
    ['title missing', mk({ title: undefined })], ['title empty', mk({ title: '' })], ['title whitespace', mk({ title: '   ' })], ['title a number', mk({ title: 5 })],
    ['title only a NUL byte', mk({ title: '\u0000' })], ['title only a lone surrogate', mk({ title: '\uD800' })], ['title 201 characters', mk({ title: pad(TITLE_PREFIX, 201) })],
    ['topic a number', mk({ topic: 5 })], ['topic 101 characters', mk({ topic: 'x'.repeat(101) })],
    ['body missing', mk({ body: undefined })], ['body empty', mk({ body: '' })], ['body whitespace', mk({ body: ' \n ' })], ['body only NUL bytes', mk({ body: '\u0000\u0000' })],
    ['body only a lone surrogate', mk({ body: '\uDC00' })], ['body 20,001 characters', mk({ body: 'x'.repeat(20001) })], ['body a number', mk({ body: 5 })],
    ['as_of missing', mk({ as_of: undefined })], ['as_of 2026-02-30', mk({ as_of: '2026-02-30' })], ['as_of 2026-13-01', mk({ as_of: '2026-13-01' })], ['as_of 26-01-01', mk({ as_of: '26-01-01' })],
    ['as_of 2026-1-1', mk({ as_of: '2026-1-1' })], ['as_of far future', mk({ as_of: '2999-01-01' })], ['as_of the day after tomorrow', mk({ as_of: day(2) })], ['as_of a number', mk({ as_of: 20260901 })],
    ['sources a string', mk({ sources: 'x' })], ['sources an object', mk({ sources: {} })], ['21 sources', mk({ sources: many })],
    ['a source that is a string', mk({ sources: ['x'] })], ['a source that is null', mk({ sources: [null] })], ['a source that is an array', mk({ sources: [[]] })],
    ['a source with no name', mk({ sources: [{ url: 'https://example.com' }] })], ['a source with an empty name', mk({ sources: [{ name: '' }] })], ['a source with a whitespace name', mk({ sources: [{ name: '  ' }] })],
    ['a source name of only a NUL byte', mk({ sources: [{ name: '\u0000' }] })], ['a source name 201 characters', mk({ sources: [{ name: 'x'.repeat(201) }] })],
    ['a source url 2001 characters', mk({ sources: [{ name: 'S', url: url2001 }] })],
    ['url javascript:', mk({ sources: [{ name: 'S', url: 'javascript:alert(1)' }] })], ['url JAVASCRIPT: (upper case)', mk({ sources: [{ name: 'S', url: 'JAVASCRIPT:alert(1)' }] })],
    ['url data:', mk({ sources: [{ name: 'S', url: 'data:text/html,x' }] })], ['url ftp://', mk({ sources: [{ name: 'S', url: 'ftp://x.example' }] })], ['url //x.example', mk({ sources: [{ name: 'S', url: '//x.example' }] })],
    ['url https:/x', mk({ sources: [{ name: 'S', url: 'https:/x.example' }] })], ['url "http://" with no host', mk({ sources: [{ name: 'S', url: 'http://' }] })],
    ['url with a space in the host', mk({ sources: [{ name: 'S', url: 'https://exa mple.com' }] })], ['url a number', mk({ sources: [{ name: 'S', url: 5 }] })],
  ];
  for (const [label, body] of bad) {
    const rr = await call(ADMIN, 'POST', { body });
    check(`2. AUK POST, ${label}: 400 invalid_report`, rr.statusCode === 400 && rr.body?.error === 'invalid_report' && typeof rr.body?.message === 'string' && rr.body.message.length > 0, `status=${rr.statusCode}`);
  }
  check('2. none of the rejected requests wrote anything', (await snap()) === base);

  // ---------- 3. boundaries that ARE accepted
  const edge = [
    ['title exactly 200 characters', mk({ title: pad(TITLE_PREFIX, 200) }), (s) => s.title.length === 200],
    ['topic exactly 100 characters', mk({ topic: 'y'.repeat(100) }), (s) => s.topic.length === 100],
    ['body exactly 20,000 characters', mk({ body: 'z'.repeat(20000) }), (s) => s.body.length === 20000],
    ['exactly 20 sources', mk({ sources: Array.from({ length: 20 }, (_, i) => ({ name: 'S' + i })) }), (s) => s.sources.length === 20],
    ['a source name of exactly 200 characters', mk({ sources: [{ name: 'n'.repeat(200) }] }), (s) => s.sources[0].name.length === 200],
    ['a source url of exactly 2000 characters', mk({ sources: [{ name: 'S', url: 'https://e.example/' + 'a'.repeat(2000 - 'https://e.example/'.length) }] }), (s) => s.sources[0].url.length === 2000],
    ['as_of today', mk({ as_of: day(0) }), (s) => s.as_of === day(0)], ['as_of tomorrow (timezone slack)', mk({ as_of: day(1) }), (s) => s.as_of === day(1)],
    ['an upper-case HTTP:// url', mk({ sources: [{ name: 'S', url: 'HTTP://UPPER.example' }] }), (s) => s.sources[0].url === 'HTTP://UPPER.example'],
    ['topic omitted -> empty text', mk({ topic: undefined }), (s) => s.topic === ''], ['topic null -> empty text', mk({ topic: null }), (s) => s.topic === ''],
    ['sources omitted -> empty list', mk({ sources: undefined }), (s) => Array.isArray(s.sources) && s.sources.length === 0],
  ];
  for (const [label, body, ok] of edge) {
    const rr = await post(body);
    check(`3. AUK POST, ${label}: accepted`, rr.statusCode === 200 && !!rr.body?.report && ok(rr.body.report), `status=${rr.statusCode} ${rr.body?.message || ''}`);
  }

  // ---------- 4. cleaning: NUL bytes and lone surrogates are stripped from EVERY client string; the stored data is what we claim
  const wf = (s) => typeof s === 'string' && s.isWellFormed() && !s.includes('\u0000');
  let c = await post(mk({ title: TITLE_PREFIX + 'a\u0000b', topic: 'to\u0000pic', body: 'bo\u0000dy', sources: [{ name: 'na\u0000me', url: 'https://ex\u0000ample.com' }] }));
  let s = c.body?.report;
  check('4. NUL bytes stripped from title, topic, body, source name and source url', c.statusCode === 200 && s?.title === TITLE_PREFIX + 'ab' && s.topic === 'topic' && s.body === 'body' && s.sources[0].name === 'name' && s.sources[0].url === 'https://example.com', `status=${c.statusCode}`);
  c = await post(mk({ body: 'ab\uD800cd' }));
  check('4. a lone HIGH surrogate in the body is stripped ("ab\\uD800cd" -> "abcd")', c.statusCode === 200 && c.body?.report?.body === 'abcd', `status=${c.statusCode}`);
  c = await post(mk({ sources: [{ name: 'x\uDC00y' }] }));
  check('4. a lone LOW surrogate in a source name is stripped ("x\\uDC00y" -> "xy")', c.statusCode === 200 && c.body?.report?.sources?.[0]?.name === 'xy', `status=${c.statusCode}`);
  c = await post(mk({ title: TITLE_PREFIX + 'q\uD83D', topic: '\uDE00t\uD800\uD800', body: '\uD83Dstart \uDC00\uDC00 end\uD83D', sources: [{ name: '\uD800n', url: 'https://ex\uD800ample.com/\uDC00p' }] }));
  s = c.body?.report;
  check('4. lone surrogates are stripped from title, topic, body, source name and url (high, low, doubled, at both ends)',
    c.statusCode === 200 && s?.title === TITLE_PREFIX + 'q' && s.topic === 't' && s.body === 'start  end' && s.sources[0].name === 'n' && s.sources[0].url === 'https://example.com/p', `status=${c.statusCode} ${JSON.stringify(s && { t: s.title, o: s.topic, b: s.body, n: s.sources[0] })}`);
  c = await post(mk({ title: TITLE_PREFIX + '😀', body: 'ok 😀 ok', sources: [{ name: '😀 src' }] }));
  s = c.body?.report;
  check('4. a VALID surrogate pair (an emoji) is preserved in title, body and source name', c.statusCode === 200 && s?.title === TITLE_PREFIX + '😀' && s.body === 'ok 😀 ok' && s.sources[0].name === '😀 src', `status=${c.statusCode}`);
  c = await post(mk({ title: '  ' + TITLE_PREFIX + 'trim  ', body: '  padded  ', sources: [{ name: ' S1 ', url: '  https://a.example/p  ', extra: 'drop' }, { name: 'S2', url: '' }, { name: 'S3' }] }));
  s = c.body?.report;
  check('4. text is trimmed; source entries are rebuilt (extra keys dropped, blank url omitted, name and url trimmed)',
    s?.title === TITLE_PREFIX + 'trim' && s.body === 'padded' && isDeepStrictEqual(s.sources, [{ name: 'S1', url: 'https://a.example/p' }, { name: 'S2' }, { name: 'S3' }]), JSON.stringify(s?.sources));   // deep-equal: jsonb returns keys in its own order
  const row = await stored(c.body?.report?.id);
  check('4. the row in the database matches the response and every stored string is well-formed (no NUL, no lone surrogate)',
    row.title === s.title && row.body === s.body && wf(row.title) && wf(row.topic) && wf(row.body) && row.sources.every((x) => wf(x.name) && (x.url === undefined || wf(x.url))));
  c = await post(mk({ as_of: '2026-03-01' }));
  check('4. as_of is returned as plain text and is not shifted by a timezone', c.body?.report?.as_of === '2026-03-01' && typeof c.body.report.as_of === 'string');

  // ---------- 5. lifecycle: create, read, update (updated_by from the session), delete
  const created5 = await post(mk({ title: TITLE_PREFIX + 'life', as_of: '2026-08-01' }));
  const A = created5.body?.report;
  check('5. POST: 200, uuid id, published_by is the caller\'s user id, updated_by and updated_at null', created5.statusCode === 200 && UUID_RE.test(A?.id || '') && A.published_by === `user_${ADMIN}` && A.updated_by === null && A.updated_at === null);
  const listed = await call(CUSTOMER, 'GET');
  check('5. a non-AUK tenant sees the new report in the shared list', listed.body?.reports?.some((x) => x.id === A.id && x.title === A.title));
  const othersBefore = JSON.stringify((await allRows()).filter((x) => x.id !== A.id));
  const put = await call(ADMIN, 'PUT', { id: A.id, body: mk({ title: TITLE_PREFIX + 'life2', topic: 'new topic', body: 'new body', as_of: '2026-08-15', sources: [{ name: 'New', url: 'https://new.example' }], updated_by: 'forged', published_by: 'forged', id: NONEXISTENT }) });
  const P = put.body?.report;
  check('5. PUT: 200 and the editable fields are replaced', put.statusCode === 200 && P?.title === TITLE_PREFIX + 'life2' && P.topic === 'new topic' && P.body === 'new body' && P.as_of === '2026-08-15' && isDeepStrictEqual(P.sources, [{ name: 'New', url: 'https://new.example' }]));
  check('5. PUT: updated_by is the caller\'s user id (from the session, not the body) and is RETURNED; updated_at is set', P?.updated_by === `user_${ADMIN}` && P.updated_at != null);
  check('5. PUT: id, published_by and published_at are unchanged (body values for them are ignored)', P?.id === A.id && P.published_by === A.published_by && new Date(P.published_at).getTime() === new Date(A.published_at).getTime());
  check('5. PUT changed only that report', JSON.stringify((await allRows()).filter((x) => x.id !== A.id)) === othersBefore);
  const mid = await snap();
  check('5. PUT non-existent id: 404 Report not found', (await call(ADMIN, 'PUT', { id: NONEXISTENT, body: mk() })).statusCode === 404);
  check('5. PUT malformed id: 400', (await call(ADMIN, 'PUT', { id: 'not-a-uuid', body: mk() })).statusCode === 400);
  check('5. PUT with no id: 400', (await call(ADMIN, 'PUT', { body: mk() })).statusCode === 400);
  check('5. PUT with an invalid body: 400, report unchanged', (await call(ADMIN, 'PUT', { id: A.id, body: mk({ title: '' }) })).statusCode === 400 && (await snap()) === mid);
  const del = await call(ADMIN, 'DELETE', { id: A.id });
  check('5. DELETE: 200 {deleted: true} and the row is gone', del.statusCode === 200 && del.body?.deleted === true && (await stored(A.id)) === undefined);
  check('5. second DELETE: 404 (AUK only)', (await call(ADMIN, 'DELETE', { id: A.id })).statusCode === 404);
  check('5. DELETE malformed id: 400, no id: 400', (await call(ADMIN, 'DELETE', { id: 'x' })).statusCode === 400 && (await call(ADMIN, 'DELETE', {})).statusCode === 400);
  check('5. DELETE removed only that report', JSON.stringify((await allRows()).filter((x) => x.id !== A.id)) === othersBefore || (await allRows()).length === JSON.parse(othersBefore).length);

  // ---------- 6. list order: as_of newest first, then published_at newest first
  const ra = (await post(mk({ title: TITLE_PREFIX + 'ord_a', as_of: '2026-07-01' }))).body.report;
  const rb = (await post(mk({ title: TITLE_PREFIX + 'ord_b', as_of: '2026-07-15' }))).body.report;
  const rc = (await post(mk({ title: TITLE_PREFIX + 'ord_c', as_of: '2026-07-15' }))).body.report;
  const lst = await call(CUSTOMER, 'GET');
  const order = lst.body.reports.map((x) => x.id).filter((id) => [ra.id, rb.id, rc.id].includes(id));
  check('6. order: as_of descending, ties broken by published_at descending (c, b, a)', JSON.stringify(order) === JSON.stringify([rc.id, rb.id, ra.id]), JSON.stringify(order.map((i) => [rc.id, rb.id, ra.id].indexOf(i))));

  // ---------- 7. the GET cap of 100, newest first
  const gen = await owner.query("insert into tech_trend_reports (title, body, as_of) select $1 || n, 'cap fixture', date '2026-01-01' + n from generate_series(0, 104) n returning id", [TITLE_PREFIX + 'cap_']);
  for (const x of gen.rows) reportIds.push(x.id);
  const capped = await call(CUSTOMER, 'GET');
  const dates = capped.body.reports.map((x) => x.as_of);
  const oldest = (await owner.query('select id from tech_trend_reports order by as_of asc, published_at asc limit 1')).rows[0].id;
  check('7. GET returns exactly 100 reports when more exist', capped.statusCode === 200 && capped.body.reports.length === 100 && (await total()) > 100, `returned=${capped.body.reports.length}`);
  check('7. ...newest first (as_of never increases down the list)', dates.every((d, i) => i === 0 || d <= dates[i - 1]));
  check('7. ...and the oldest report in the table is the one cut off', !capped.body.reports.some((x) => x.id === oldest));

  // ---------- 8. fails closed
  const failBefore = await snap();
  globalThis.__failDb = true;
  const g = await call(CUSTOMER, 'GET');
  const pf = await call(ADMIN, 'POST', { body: mk() });
  const uf = await call(ADMIN, 'PUT', { id: SEED, body: mk({ title: TITLE_PREFIX + 'x' }) });
  const df = await call(ADMIN, 'DELETE', { id: SEED });
  globalThis.__failDb = false;
  check('8. db unavailable: GET, POST, PUT and DELETE all answer 500 Database operation failed', [g, pf, uf, df].every((x) => x.statusCode === 500 && x.body?.error === 'Database operation failed'), [g, pf, uf, df].map((x) => x.statusCode).join(','));
  check('8. every 500 body has exactly the key "error" (no detail text of any kind)', [g, pf, uf, df].every((x) => Object.keys(x.body || {}).join(',') === 'error'), JSON.stringify([g, pf, uf, df].map((x) => Object.keys(x.body || {}))));
  check('8. ...and nothing was written', (await snap()) === failBefore);
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (created) {
      try {
        await owner.query('delete from tech_trend_reports where id = any($1)', [reportIds]);
        await owner.query('delete from tenants where id = any($1)', [tenantIds]);
        console.log(`Cleanup: removed ${reportIds.length} fixture reports and the 2 fixture tenants (by exact id)`);
        const leftReports = (await owner.query('select count(*)::int as n from tech_trend_reports where starts_with(title, $1)', [TITLE_PREFIX])).rows[0].n;
        const leftTenants = (await owner.query('select count(*)::int as n from tenants where starts_with(id, $1)', [TENANT_PREFIX])).rows[0].n;
        check(`leftover reports whose title starts with ${TITLE_PREFIX} after cleanup (read-only count): ${leftReports}`, leftReports === 0);
        check(`leftover tenants whose id starts with ${TENANT_PREFIX} after cleanup (read-only count): ${leftTenants}`, leftTenants === 0);
        check('the table is empty again after cleanup', (await total()) === 0);
      } catch (e) { failures++; console.error('Cleanup / leftover check failed:', e.message); }
    }
    await owner.end();
    if (process.exitCode === 2) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
