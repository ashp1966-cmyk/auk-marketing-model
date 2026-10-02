// api/_lib/auth.js logs WHY a token was rejected (Clerk's reason code) and nothing sensitive.
// Usage: node --experimental-test-module-mocks scripts/auth-logging-test.mjs
// Real-library cases use structurally invalid tokens (they fail before any network use; fetch is stubbed to
// throw so a network attempt would show up). Mocked cases drive verifyToken to throw / return claims so the
// reason-code and no-organization paths are exercised deterministically. No Clerk network, no database.
import { mock } from 'node:test';

const SECRET = 'sk_test_SECRETMARKER_do_not_log';
const TOKEN = 'TOKENMARKER_abc123';
process.env.CLERK_SECRET_KEY = SECRET;

let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('network blocked in test'); };

const logged = [];
const realError = console.error;
console.error = (...a) => logged.push(a.map(String).join(' '));
const take = () => logged.splice(0, logged.length);

let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const clean = (lines) => { const flat = lines.join('\n'); return !flat.includes(SECRET) && !flat.includes(TOKEN) && !/bearer/i.test(flat) && !/authorization/i.test(flat); };

// --- real @clerk/backend
const real = await import('../api/_lib/auth.js');
{
  let r = await real.resolveOrgId({ headers: { authorization: `Bearer not-a-jwt-${TOKEN}` } });
  let lines = take();
  check('garbage header token -> null', r === null);
  check('  ...exactly one log line, "[auth] token verification failed: <reason>"', lines.length === 1 && /^\[auth\] token verification failed: [\w-]+$/.test(lines[0]), lines[0]);
  check('  ...the reason is one of Clerk\'s token-* codes', /failed: token-/.test(lines[0] || ''), lines[0]);
  check('  ...no token, secret key, "Bearer" or "authorization" in the output', clean(lines));

  r = await real.resolveOrgId({ headers: {}, body: { token: `x.y.${TOKEN}` } });
  lines = take();
  check('garbage body token (sendBeacon path) -> null, one reason line, nothing sensitive', r === null && lines.length === 1 && /failed: [\w-]+$/.test(lines[0]) && clean(lines), lines[0]);

  r = await real.resolveOrgId({ headers: {} });
  lines = take();
  check('no token at all -> null with no log line', r === null && lines.length === 0);
  check('none of the real-library cases touched the network', networkCalls === 0, `networkCalls=${networkCalls}`);
}

// --- mocked @clerk/backend: a second copy of auth.js bound to a controllable verifyToken
globalThis.__verify = async () => { throw new Error('unset'); };
mock.module('@clerk/backend', { exports: { verifyToken: (t, o) => globalThis.__verify(t, o) } });
const mocked = await import('../api/_lib/auth.js?mocked');
const req = { headers: { authorization: `Bearer ${TOKEN}` } };
{
  globalThis.__verify = async () => { throw Object.assign(new Error('jwt expired SECRETISH-MESSAGE'), { reason: 'token-expired', token: TOKEN, secret: SECRET }); };
  let r = await mocked.resolveOrgId(req);
  let lines = take();
  check('expired token: null, logs exactly "token-expired"', r === null && lines.length === 1 && lines[0] === '[auth] token verification failed: token-expired', lines[0]);
  check('  ...the error message and extra properties (token, secret) are not logged', clean(lines) && !lines.join('').includes('SECRETISH'));

  globalThis.__verify = async () => { throw new Error('boom: internal detail'); };
  r = await mocked.resolveOrgId(req);
  lines = take();
  check('error with no reason: logs only the error name, not its message', r === null && lines.length === 1 && lines[0] === '[auth] token verification failed: Error' && clean(lines));

  globalThis.__verify = async () => { throw 'a bare string'; };
  r = await mocked.resolveOrgId(req);
  lines = take();
  check('non-Error throw: logs "unknown", never the thrown value', r === null && lines.length === 1 && lines[0] === '[auth] token verification failed: unknown');

  globalThis.__verify = async () => ({ sub: 'user_1' });
  r = await mocked.resolveOrgId(req);
  lines = take();
  check('valid token with no organization: null, logs "[auth] token has no organization claim"', r === null && lines.length === 1 && lines[0] === '[auth] token has no organization claim' && clean(lines), lines[0]);

  globalThis.__verify = async () => ({ sub: 'user_1', o: { id: 'org_1' } });
  r = await mocked.resolveOrgId(req);
  lines = take();
  check('valid token with an organization: returns it and logs nothing', r?.orgId === 'org_1' && r?.userId === 'user_1' && lines.length === 0);

  let seen;
  globalThis.__verify = async (t, o) => { seen = { t, o }; return { sub: 'u', org_id: 'org_2' }; };
  r = await mocked.resolveOrgId(req);
  take();
  check('verification still receives the token, the secret key and the 10 s clock-skew tolerance (behaviour unchanged)',
    r?.orgId === 'org_2' && seen?.t === TOKEN && seen?.o?.secretKey === SECRET && seen?.o?.clockSkewInMs === 10000);
}

console.error = realError;
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
