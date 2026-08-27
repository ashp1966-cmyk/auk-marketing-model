// Vercel serverless function — lets a signed-in tenant view (masked) and set their own
// HubSpot private-app token, stored in tenants.hubspot_token
// (CLAUDE-CODE-BRIEF-hubspot-per-tenant.md). RLS-protected via withTenant(), same as
// every other tenant-scoped handler.
//
// The raw token is never returned to the client once saved, and never logged or
// included in an error message -- GET returns only a last-4-chars mask, matching how
// HubSpot itself displays its own tokens.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';

function mask(token) {
  if (!token) return null;
  return `••••${token.slice(-4)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth || !auth.orgId) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId } = auth;

  try {
    if (req.method === 'GET') {
      const token = await withTenant(orgId, async (client) => {
        const { rows } = await client.query('select hubspot_token from tenants where id = $1', [orgId]);
        return rows[0]?.hubspot_token || null;
      });
      return res.status(200).json({ connected: !!token, masked: mask(token) });
    }

    // POST
    const raw = req.body && typeof req.body === 'object' ? req.body.token : null;
    const token = typeof raw === 'string' ? raw.trim() : '';
    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    await withTenant(orgId, async (client) => {
      await client.query('update tenants set hubspot_token = $1 where id = $2', [token, orgId]);
    });

    return res.status(200).json({ connected: true, masked: mask(token) });
  } catch (err) {
    // Never include err.message here if it could echo back token content -- it can't
    // (query params, not the value, ever appear in a pg error), but keep this generic
    // regardless as the safer default for anything touching hubspot_token.
    return res.status(500).json({ error: 'HubSpot token operation failed' });
  }
}
