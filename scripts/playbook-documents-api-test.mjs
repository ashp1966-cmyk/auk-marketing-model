// Handler-level test for api/playbook-documents.js against the rls-test branch.
// Calls the real handler + real withTenant()/Postgres/RLS with mock req/res; only
// api/_lib/auth.js is stubbed (Clerk token verification can't run here and is already
// proven by the other endpoints).
//
// Usage: node --experimental-test-module-mocks scripts/playbook-documents-api-test.mjs
// Safety: refuses to run unless DATABASE_URL_TENANT_APP and DATABASE_URL both point at
// ep-royal-heart, AND refuses if playbook_documents already holds rows (the table has no
// tenant_id, so cleanup can't be scoped to fake tenants and must never touch real content).
// Creates two fake tenants rows (rlstest_A internal, rlstest_B ordinary), removes exactly those.
// Never prints credentials -- only hosts.

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

// Stub auth: tenant comes from the x-test-tenant header; 'none' simulates a failed session.
mock.module(new URL('../api/_lib/auth.js', import.meta.url).href, {
  exports: {
    resolveOrgId: async (req) => {
      const t = req.headers['x-test-tenant'];
      return !t || t === 'none' ? null : { orgId: t, userId: `user_${t}` };
    },
  },
});
const { default: handler } = await import('../api/playbook-documents.js');

const A = 'rlstest_A', B = 'rlstest_B', CAT = 'updated_marketing_info';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF = 'application/pdf';

async function call(method, tenant, { body, query } = {}) {
  const res = { statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers: { 'x-test-tenant': tenant }, body, query }, res);
  return res;
}

const owner = new Pool({ connectionString: ownerUrl });
const ownerRows = async () => (await owner.query('select * from playbook_documents')).rows;

let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const post = (t, b) => call('POST', t, { body: { category: CAT, filename: 'f.docx', mimeType: DOCX, content: 'hello', ...b } });

let skipped = false;
async function main() {
  const { rows: [{ n }] } = await owner.query('select count(*)::int as n from playbook_documents');
  if (n !== 0) {
    console.error(`REFUSING: playbook_documents already has ${n} row(s). Remove them manually first -- this test must never delete real content.`);
    skipped = true;
    return;
  }
  await owner.query(
    `insert into tenants (id, name, plan_code) values ($1, 'RLS Test A', 'internal'), ($2, 'RLS Test B', null)
     on conflict (id) do update set plan_code = excluded.plan_code`, [A, B]);

  check('1a. no session -> 401', (await post('none', {})).statusCode === 401);
  check('1b. PUT -> 405', (await call('PUT', A)).statusCode === 405);

  // --- validation, all as the internal tenant A
  check('2a. unknown category POST -> 400', (await post(A, { category: 'nope' })).statusCode === 400);
  check('2b. unknown category DELETE -> 400', (await call('DELETE', A, { query: { category: 'nope' } })).statusCode === 400);
  check('3. bad MIME -> 400', (await post(A, { mimeType: 'text/plain' })).statusCode === 400);
  check('4a. missing filename -> 400', (await post(A, { filename: '  ' })).statusCode === 400);
  check('4b. non-string content -> 400', (await post(A, { content: 123 })).statusCode === 400);
  check('5a. whitespace-only content -> 400', (await post(A, { content: '   \n ' })).statusCode === 400);
  check('5b. NUL-only content -> 400', (await post(A, { content: '\u0000\u0000' })).statusCode === 400);
  check('5c. nothing saved by any rejected request', (await ownerRows()).length === 0);

  const nul = await post(A, { content: 'ab\u0000cd' });
  check('6. NUL bytes stripped, saved as "abcd"', nul.statusCode === 200 && nul.body.document.content === 'abcd' && nul.body.document.char_count === 4);

  const big = await post(A, { content: 'x'.repeat(100500) });
  const bd = big.body?.document;
  check('7. oversize capped at 100000, truncated=true, char_count recomputed',
    big.statusCode === 200 && bd.content.length === 100000 && bd.char_count === 100000 && bd.truncated === true);

  const cliFalse = await post(A, { content: 'y'.repeat(100500), truncated: false });
  check('8a. client truncated:false cannot hide server truncation', cliFalse.body?.document?.truncated === true);
  const cliTrue = await post(A, { content: 'short', truncated: true });
  check('8b. client truncated:true on short text is honoured (one-directional)', cliTrue.body?.document?.truncated === true);
  const plain = await post(A, { content: 'short', truncated: false });
  check('8c. short text + no flag -> truncated=false', plain.body?.document?.truncated === false);

  // --- REPLACE: two different documents into the same category -> exactly one row, second doc's content.
  await owner.query('delete from playbook_documents');
  const d1 = await post(A, { filename: 'first.docx', mimeType: DOCX, content: 'ALPHA first document body about shipping.' });
  await new Promise((r) => setTimeout(r, 50));
  const d2 = await post(A, { filename: 'second.pdf', mimeType: PDF, content: 'BRAVO second document body about mining.' });
  const rows = await ownerRows();
  check('9a. replace: exactly ONE row for the category (not two)', rows.length === 1, `rows=${rows.length}`);
  check('9b. replace: content is exactly the second document, nothing merged',
    rows[0]?.content === 'BRAVO second document body about mining.' && !rows[0].content.includes('ALPHA'));
  check('9c. replace: filename + mime_type are the second document\'s',
    rows[0]?.filename === 'second.pdf' && rows[0]?.mime_type === PDF);
  check('9d. replace: char_count matches second doc, uploaded_at advanced',
    rows[0]?.char_count === 'BRAVO second document body about mining.'.length &&
    new Date(d2.body.document.uploaded_at) > new Date(d1.body.document.uploaded_at));

  // --- Access model: everyone reads, only the internal tenant writes.
  const gb = await call('GET', B), ga = await call('GET', A);
  check("10a. B (non-internal) GET sees A's document, canManage=false",
    gb.statusCode === 200 && gb.body.documents.length === 1 && gb.body.documents[0].filename === 'second.pdf' && gb.body.canManage === false);
  check('10b. A (internal) GET: canManage=true', ga.statusCode === 200 && ga.body.canManage === true && ga.body.documents.length === 1);

  check('11a. B POST -> 403', (await post(B, { filename: 'forged.docx' })).statusCode === 403);
  check('11b. B DELETE -> 403', (await call('DELETE', B, { query: { category: CAT } })).statusCode === 403);
  const after = await ownerRows();
  check("11c. A's document unchanged after B's attempts (owner view)",
    after.length === 1 && after[0].filename === 'second.pdf' && after[0].content === 'BRAVO second document body about mining.');

  check('14. B POST with an invalid body -> 403, not 400 (check runs first)', (await post(B, { category: 'nope', mimeType: 'x', content: 1 })).statusCode === 403);

  const del1 = await call('DELETE', A, { query: { category: CAT } });
  const del2 = await call('DELETE', A, { query: { category: CAT } });
  check("12a. A DELETE removes the document (200)", del1.statusCode === 200 && (await ownerRows()).length === 0);
  check('12b. A second DELETE -> 404', del2.statusCode === 404);

  check('13. B DELETE when nothing exists -> 403, not 404 (no existence leak)', (await call('DELETE', B, { query: { category: CAT } })).statusCode === 403);
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (!skipped) {
      try {
        await owner.query('delete from playbook_documents');
        await owner.query('delete from tenants where id in ($1, $2)', [A, B]);
        console.log('Cleanup: removed test documents and rlstest_A / rlstest_B tenants rows');
      } catch (e) { failures++; console.error('Cleanup failed:', e.message); }
    }
    await owner.end();
    if (skipped) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
