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

    await sql`
      insert into tenants (id, name)
      values (${orgId}, ${orgId})
      on conflict (id) do nothing
    `;
    await sql`
      insert into tenant_data (tenant_id, data)
      values (${orgId}, ${JSON.stringify(payload)}::jsonb)
      on conflict (tenant_id) do update set data = ${JSON.stringify(payload)}::jsonb, updated_at = now()
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
