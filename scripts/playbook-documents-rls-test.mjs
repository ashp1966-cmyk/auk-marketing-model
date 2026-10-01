// RLS isolation test for playbook_documents. Read-mostly: writes only rows for two fake
// tenant ids (rlstest_A / rlstest_B) and deletes exactly those at the end.
//
// Usage: node scripts/playbook-documents-rls-test.mjs
//
// Checks run as the non-owner `tenant_app` role (DATABASE_URL_TENANT_APP from .env.local),
// each inside begin / set_config('app.current_tenant_id', ..., true) / commit, mirroring
// api/_lib/db.js's withTenant(). Cleanup uses the owner connection (DATABASE_URL).
// Refuses to run unless the target host is the rls-test branch (ep-royal-heart).
// Never prints credentials -- only the host.

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
const A = 'rlstest_A';
const B = 'rlstest_B';

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

const insertSql = `insert into playbook_documents (tenant_id, category, filename, mime_type, content, char_count)
  values ($1, 'updated_marketing_info', $2, 'text/plain', 'x', 1)
  on conflict (tenant_id, category) do update set filename = excluded.filename`;

let failures = 0;
function report(name, pass, detail = '') {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

async function cleanup() {
  await ownerPool.query('delete from playbook_documents where tenant_id in ($1, $2)', [A, B]);
}

async function main() {
  await cleanup();

  // 1. As A, insert a row tagged B -> WITH CHECK must reject.
  let rejected = false;
  try { await asTenant(A, (c) => c.query(insertSql, [B, 'forged-by-A.docx'])); } catch { rejected = true; }
  report('1. A cannot insert a row tagged tenant B (WITH CHECK)', rejected);

  // Seed legitimate rows.
  await asTenant(A, (c) => c.query(insertSql, [A, 'a.docx']));
  // 2. As B, insert B's own row.
  let okB = true;
  try { await asTenant(B, (c) => c.query(insertSql, [B, 'b.docx'])); } catch { okB = false; }
  report("2. B can insert its own row", okB);

  // 3. As A, select * -> only A.
  const all = await asTenant(A, (c) => c.query("select tenant_id from playbook_documents where tenant_id like 'rlstest_%'"));
  report('3. A sees only its own row', all.rows.length === 1 && all.rows[0].tenant_id === A, `rows=${all.rows.map((r) => r.tenant_id).join(',')}`);

  // 4. As A, explicitly ask for B's row.
  const sel = await asTenant(A, (c) => c.query('select 1 from playbook_documents where tenant_id = $1', [B]));
  report("4. A cannot select B's row by explicit tenant_id", sel.rows.length === 0, `rows=${sel.rows.length}`);

  // 5. As A, update B's row.
  const upd = await asTenant(A, (c) => c.query("update playbook_documents set filename = 'hijacked' where tenant_id = $1", [B]));
  report("5. A cannot update B's row", upd.rowCount === 0, `rowCount=${upd.rowCount}`);

  // 6. As A, delete B's row.
  const del = await asTenant(A, (c) => c.query('delete from playbook_documents where tenant_id = $1', [B]));
  report("6. A cannot delete B's row", del.rowCount === 0, `rowCount=${del.rowCount}`);

  // 7. Owner confirms B's row is intact and unmodified.
  const intact = await ownerPool.query('select filename from playbook_documents where tenant_id = $1', [B]);
  report("7. B's row intact after A's attempts (owner view)", intact.rows.length === 1 && intact.rows[0].filename === 'b.docx', `filename=${intact.rows[0]?.filename}`);

  // 8. set_config never called -> fails closed.
  const unset = await asTenant(null, (c) => c.query("select 1 from playbook_documents where tenant_id like 'rlstest_%'"));
  report('8. No tenant context -> zero rows (fails closed)', unset.rows.length === 0, `rows=${unset.rows.length}`);

  // 9. Upsert replaces: second insert for A leaves one row with the new filename.
  await asTenant(A, (c) => c.query(insertSql, [A, 'a-second.docx']));
  const up = await asTenant(A, (c) => c.query('select filename from playbook_documents where tenant_id = $1', [A]));
  report('9. Upsert replaces (one row, latest filename)', up.rows.length === 1 && up.rows[0].filename === 'a-second.docx', `rows=${up.rows.length}, filename=${up.rows[0]?.filename}`);
}

main()
  .catch((e) => { failures++; console.error('ERROR:', e.message); })
  .finally(async () => {
    try { await cleanup(); console.log('Cleanup: removed rlstest_A / rlstest_B rows'); } catch (e) { console.error('Cleanup failed:', e.message); failures++; }
    await appPool.end();
    await ownerPool.end();
    console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
