// RLS test for playbook_documents (platform-authored, tenant-visible: any tenant reads, only an
// internal tenant writes). Runs against the rls-test branch only.
//
// Usage: node scripts/playbook-documents-rls-test.mjs
//
// Checks run as the non-owner `tenant_app` role (DATABASE_URL_TENANT_APP from .env.local), each
// inside begin / set_config('app.current_tenant_id', ..., true) / commit, mirroring api/_lib/db.js's
// withTenant(). Setup/cleanup use the owner connection (DATABASE_URL).
// Safety: refuses to run unless both hosts are the rls-test branch (ep-royal-heart), AND refuses if
// playbook_documents already holds any rows -- the table has no tenant_id, so the test's cleanup
// can't be scoped to fake tenants and must never touch real content. Creates two fake tenants rows
// (rlstest_A internal, rlstest_B ordinary) and removes exactly those at the end.
// Never prints credentials -- only hosts.

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readFileSync } from 'fs';

neonConfig.webSocketConstructor = ws;

function envVar(name) {
  if (process.env[name]) return process.env[name];
  const envLocal = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const m = envLocal.match(new RegExp(`^${name}=["']?([^"'\\r\\n]+)["']?`, 'm'));
  if (!m) throw new Error(`${name} not found in environment or .env.local`);
  return m[1];
}

const appUrl = envVar('DATABASE_URL_TENANT_APP');
const ownerUrl = envVar('DATABASE_URL');
const appHost = new URL(appUrl).host;
const ownerHost = new URL(ownerUrl).host;
console.log('tenant_app host:', appHost);
console.log('owner host:     ', ownerHost);
if (!appHost.includes('ep-royal-heart') || !ownerHost.includes('ep-royal-heart')) {
  console.error('REFUSING: both connections must target the rls-test branch (ep-royal-heart).');
  process.exit(1);
}

const appPool = new Pool({ connectionString: appUrl });
const ownerPool = new Pool({ connectionString: ownerUrl });
const A = 'rlstest_A';       // internal
const B = 'rlstest_B';       // ordinary tenant
const GHOST = 'rlstest_ghost'; // has no tenants row at all
const CAT = 'updated_marketing_info';

// Same shape as withTenant(); tenantId === null means "never call set_config".
async function asTenant(tenantId, fn) {
  const client = await appPool.connect();
  try {
    await client.query('begin');
    if (tenantId !== null) await client.query("select set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const upsertSql = `insert into playbook_documents (category, filename, mime_type, content, char_count)
  values ('${CAT}', $1, 'text/plain', 'x', 1)
  on conflict (category) do update set filename = excluded.filename`;

let failures = 0;
function report(name, pass, detail = '') {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}
async function rejects(fn) { try { await fn(); return false; } catch { return true; } }

async function cleanup() {
  await ownerPool.query('delete from playbook_documents');
  await ownerPool.query('delete from tenants where id in ($1, $2)', [A, B]);
}

async function main() {
  const { rows: [{ n }] } = await ownerPool.query('select count(*)::int as n from playbook_documents');
  if (n !== 0) {
    console.error(`REFUSING: playbook_documents already has ${n} row(s). Remove them manually first -- this test must never delete real content.`);
    process.exitCode = 2;
    return 'skip-cleanup';
  }
  await ownerPool.query(
    `insert into tenants (id, name, plan_code) values ($1, 'RLS Test A', 'internal'), ($2, 'RLS Test B', null)
     on conflict (id) do update set plan_code = excluded.plan_code`, [A, B]);

  report('1. B (non-internal) cannot insert', await rejects(() => asTenant(B, (c) => c.query(upsertSql, ['forged-by-B.docx']))));

  let okA = true;
  try { await asTenant(A, (c) => c.query(upsertSql, ['a.docx'])); } catch { okA = false; }
  report('2. A (internal) can insert', okA);

  const seen = await asTenant(B, (c) => c.query('select filename from playbook_documents where category = $1', [CAT]));
  report("3. B can read A's document (shared read)", seen.rows.length === 1 && seen.rows[0].filename === 'a.docx', `rows=${seen.rows.length}`);

  const upd = await asTenant(B, (c) => c.query("update playbook_documents set filename = 'hijacked' where category = $1", [CAT]));
  report('4. B cannot update', upd.rowCount === 0, `rowCount=${upd.rowCount}`);

  const del = await asTenant(B, (c) => c.query('delete from playbook_documents where category = $1', [CAT]));
  report('5. B cannot delete', del.rowCount === 0, `rowCount=${del.rowCount}`);

  const intact = await ownerPool.query('select filename from playbook_documents where category = $1', [CAT]);
  report('6. Row intact after B\'s attempts (owner view)', intact.rows.length === 1 && intact.rows[0].filename === 'a.docx', `filename=${intact.rows[0]?.filename}`);

  report('7. B cannot upsert-over A\'s document', await rejects(() => asTenant(B, (c) => c.query(upsertSql, ['b-upsert.docx']))));

  const updA = await asTenant(A, (c) => c.query("update playbook_documents set filename = 'a-edited.docx' where category = $1", [CAT]));
  report('8. A can update', updA.rowCount === 1, `rowCount=${updA.rowCount}`);

  const unset = await asTenant(null, (c) => c.query('select 1 from playbook_documents'));
  report('9. No tenant context -> zero rows (fails closed)', unset.rows.length === 0, `rows=${unset.rows.length}`);

  const empty = await asTenant('', (c) => c.query('select 1 from playbook_documents'));
  report("10. Tenant context set to '' -> zero rows (fails closed)", empty.rows.length === 0, `rows=${empty.rows.length}`);

  const ghostRead = await asTenant(GHOST, (c) => c.query('select 1 from playbook_documents'));
  const ghostWrite = await rejects(() => asTenant(GHOST, (c) => c.query(upsertSql, ['ghost.docx'])));
  report('11. Tenant id with no tenants row: can read, cannot write', ghostRead.rows.length === 1 && ghostWrite, `readRows=${ghostRead.rows.length}`);

  await asTenant(A, (c) => c.query(upsertSql, ['a-first.docx']));
  await asTenant(A, (c) => c.query(upsertSql, ['a-second.docx']));
  const up = await ownerPool.query('select filename from playbook_documents where category = $1', [CAT]);
  report('12. A upsert replaces (one row, latest filename)', up.rows.length === 1 && up.rows[0].filename === 'a-second.docx', `rows=${up.rows.length}, filename=${up.rows[0]?.filename}`);

  const delA = await asTenant(A, (c) => c.query('delete from playbook_documents where category = $1', [CAT]));
  report('13. A can delete', delA.rowCount === 1, `rowCount=${delA.rowCount}`);
}

main()
  .then(async (r) => { if (r === 'skip-cleanup') return 'skip'; })
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    if (process.exitCode !== 2) {
      try { await cleanup(); console.log('Cleanup: removed test documents and rlstest_A / rlstest_B tenants rows'); }
      catch (e) { console.error('Cleanup failed:', e.message); failures++; }
    }
    await appPool.end();
    await ownerPool.end();
    if (process.exitCode === 2) process.exit(2);
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
