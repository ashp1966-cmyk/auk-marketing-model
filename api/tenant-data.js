// Vercel serverless function — tenant-scoped data load/save, backed by Neon.
// Replaces the old localStorage-based persistence. Verifies the caller's Clerk
// session token and derives the tenant (organization) id from it server-side —
// the client never gets to assert which org it's writing to.
import { neon } from '@neondatabase/serverless';
import { resolveOrgId } from './_lib/auth.js';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth || !auth.orgId) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId, userId } = auth;

  try {
    if (req.method === 'GET') {
      await sql`
        insert into tenants (id, name)
        values (${orgId}, ${orgId})
        on conflict (id) do nothing
      `;
      const rows = await sql`select data from tenant_data where tenant_id = ${orgId}`;
      const data = rows.length ? rows[0].data : {};
      return res.status(200).json({ data });
    }

    // POST
    const payload = req.body && typeof req.body === 'object' ? req.body.data : null;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Missing data payload' });
    }
    // The client sends the real Clerk org display name (via useOrganization()) alongside
    // every save, piggybacked here rather than a separate round-trip — this keeps tenants.name
    // a real, human-readable name instead of just the raw org id it's bootstrapped with below.
    const orgName = typeof req.body.orgName === 'string' && req.body.orgName.trim() ? req.body.orgName.trim().slice(0, 255) : null;

    if (orgName) {
      await sql`
        insert into tenants (id, name)
        values (${orgId}, ${orgName})
        on conflict (id) do update set name = ${orgName}
      `;
    } else {
      await sql`
        insert into tenants (id, name)
        values (${orgId}, ${orgId})
        on conflict (id) do nothing
      `;
    }
    // Shallow top-level merge, not a full replace: `tenant_data.data` here is the row's
    // CURRENT value at UPDATE time, so a client whose bundle predates some newer field (and
    // therefore never mentions that key in `payload`) can no longer silently wipe it out on
    // its next autosave — the existing key survives whenever the incoming payload omits it.
    // Does NOT protect against a payload that legitimately includes a key with a stale VALUE
    // (e.g. a tab that mounted before an out-of-band DB write and is now saving back what it
    // read at mount) — see CLAUDE.md's known-gaps entry on this.
    await sql`
      insert into tenant_data (tenant_id, data)
      values (${orgId}, ${JSON.stringify(payload)}::jsonb)
      on conflict (tenant_id) do update set data = tenant_data.data || ${JSON.stringify(payload)}::jsonb, updated_at = now()
    `;
    await sql`
      insert into tenant_activity (tenant_id, user_id, action)
      values (${orgId}, ${userId}, 'save')
    `;

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Database operation failed', detail: err.message });
  }
}
