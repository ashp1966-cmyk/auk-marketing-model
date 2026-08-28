// Vercel serverless function — read-only billing status for the signed-in tenant
// (Checkpoint 3, CLAUDE-CODE-BRIEF-paystack-billing.md). RLS-protected via withTenant(),
// same pattern as hubspot-token.js. The webhook (api/webhooks/paystack.js) is the only
// writer of these columns; this endpoint never writes.
import { resolveOrgId } from '../_lib/auth.js';
import { withTenant } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth || !auth.orgId) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId } = auth;

  try {
    const row = await withTenant(orgId, async (client) => {
      const { rows } = await client.query(
        'select billing_status, plan_code, paid_until from tenants where id = $1',
        [orgId]
      );
      return rows[0] || null;
    });

    return res.status(200).json({
      billingStatus: row?.billing_status || 'trialing',
      planCode: row?.plan_code || null,
      paidUntil: row?.paid_until || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load billing status' });
  }
}
