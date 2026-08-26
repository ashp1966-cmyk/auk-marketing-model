// Session-scoped tenant-isolation connection helper for Row-Level Security
// (AUKPILOT-scale-architecture-spec.md, Task 3.2). Uses Pool/Client (real Postgres
// sessions over WebSocket) rather than the stateless neon() HTTP tag used elsewhere in
// api/ — RLS's app.current_tenant_id GUC must persist across a request's multiple
// queries, and the HTTP tag gives each call its own independent connection with no
// shared session state.
//
// DATABASE_URL_TENANT_APP must point at the tenant_app Postgres role (see
// scripts/rls-tenant-isolation.sql) — a non-owner role RLS policies actually apply to,
// distinct from the DATABASE_URL owner role used by api/cron-follow-up.js and
// scripts/*.mjs, which are deliberately cross-tenant.
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Node serverless functions don't have a native WebSocket everywhere Vercel might run
// them (no engines/runtime pin in this repo) — wire in `ws` explicitly rather than
// relying on whatever the deployed Node version happens to provide.
neonConfig.webSocketConstructor = ws;

let pool;
function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL_TENANT_APP;
    if (!connectionString) throw new Error('DATABASE_URL_TENANT_APP is not configured');
    pool = new Pool({ connectionString });
  }
  return pool;
}

// Opens one connection, sets app.current_tenant_id for the duration of one transaction
// (set_config's third argument `true` scopes it to the transaction, same as SET LOCAL —
// this matters because the connection is returned to the pool and reused by a later,
// unrelated request), runs fn(client), commits, and always releases the connection.
//
// Verified empirically against a live RLS-enabled branch (Pool max:1, forcing reuse of
// one physical connection): after COMMIT or ROLLBACK — including fn throwing, a real SQL
// error inside fn, set_config itself failing, and COMMIT being called on an
// already-aborted transaction — app.current_tenant_id never carries a stale tenant id
// into the next request on a reused connection. It does NOT necessarily revert to SQL
// NULL specifically (Postgres has no true default for a placeholder GUC once it's been
// assigned at least once in a session — after that it settles on '' rather than NULL).
// Either way, the reverted value can never match a real tenant_id (always a non-empty
// Clerk org id), so a request that skipped this function's set_config call still sees
// zero rows rather than another tenant's — fails closed, not open, regardless of which
// of the two "empty" values it lands on.
export async function withTenant(orgId, fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.current_tenant_id', $1, true)", [orgId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
