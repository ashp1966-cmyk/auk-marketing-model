// AUK-only switch for per-tenant features (CLAUDE-CODE-BRIEF-trend-radar-switch.md).
// POST { tenantId, feature, enabled }. Order: method (405) -> session (401) -> internal check (403) -> validation
// (400) -> tenant lookup (404, AUK callers only) -> upsert. The internal check comes BEFORE any validation or
// lookup, so a non-AUK caller learns nothing about what exists.
import { neon } from '@neondatabase/serverless';
import { resolveOrgId } from '../_lib/auth.js';
import { withTenant } from '../_lib/db.js';
import { FEATURE_KEYS } from '../_lib/feature-flags.js';

// Clerk organization ids are word characters and hyphens. A strict charset also keeps NUL bytes and lone
// surrogates (which Postgres text rejects) out of the lookup entirely.
const TENANT_ID_RE = /^[\w-]{1,255}$/;
const bad = (res, message) => res.status(400).json({ error: 'invalid_request', message });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = await resolveOrgId(req);
  if (!auth || !auth.orgId) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }

  try {
    const callerPlanCode = await withTenant(auth.orgId, async (client) => {
      const { rows } = await client.query('select plan_code from tenants where id = $1', [auth.orgId]);
      return rows[0]?.plan_code || null;
    });
    if (callerPlanCode !== 'internal') {
      return res.status(403).json({ error: 'Admin access only' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return bad(res, 'Request body must be a JSON object');
    const { tenantId, feature, enabled } = body;
    if (typeof tenantId !== 'string' || !TENANT_ID_RE.test(tenantId)) return bad(res, 'tenantId must be a tenant id (up to 255 letters, digits, _ or -)');
    if (typeof feature !== 'string' || !FEATURE_KEYS.includes(feature)) return bad(res, `feature must be one of: ${FEATURE_KEYS.join(', ')}`);
    if (typeof enabled !== 'boolean') return bad(res, 'enabled must be true or false');

    // Writes use the OWNER connection (tenant_app has SELECT only on tenant_features, by design). This relies on
    // row level security NOT being forced on tenant_features: the owner bypasses RLS only because the table was
    // created without FORCE ROW LEVEL SECURITY (scripts/add-tenant-features.sql; the runner's verify() asserts it).
    // Production has no plain DATABASE_URL, only POSTGRES_URL (the owner role), as in admin/usage.js.
    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

    const [target] = await sql`select id, plan_code from tenants where id = ${tenantId}`;
    if (!target) return res.status(404).json({ error: 'Tenant not found' });
    if (target.plan_code === 'internal') {
      return res.status(400).json({ error: 'internal_tenant', message: 'The platform owner account is always on and cannot be changed' });
    }

    const [row] = await sql`
      insert into tenant_features (tenant_id, feature, enabled, updated_by, updated_at)
      values (${tenantId}, ${feature}, ${enabled}, ${auth.userId || null}, now())
      on conflict (tenant_id, feature) do update
        set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()
      returning tenant_id, feature, enabled, updated_by, updated_at
    `;
    return res.status(200).json({ feature: row });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update feature switch' });
  }
}
