// Vercel serverless function — read-only cross-tenant usage view, AUK-internal only
// (CLAUDE-CODE-BRIEF-usage-alerting.md, Part 1). Gated on the caller's own
// tenants.plan_code = 'internal' (checked via withTenant, RLS-safe — the caller can only
// ever read its own row that way). Once confirmed internal, the actual cross-tenant
// query needs an owner-role connection since RLS's tenant_app role can't see other
// tenants' rows by design — same DATABASE_URL || POSTGRES_URL fallback already used in
// api/webhooks/paystack.js (Production has no plain DATABASE_URL, only POSTGRES_URL).
//
// Read-only: no writes anywhere in this file.
import { neon } from '@neondatabase/serverless';
import { resolveOrgId } from '../_lib/auth.js';
import { withTenant } from '../_lib/db.js';

// Trial caps from CLAUDE-CODE-BRIEF-trial-gating.md — kept here (not yet enforced
// server-side anywhere else) so this view's highlighting matches what real enforcement
// will use once Step 2/3 of that brief ships.
const CAPS = { research_runs: 2, campaign_drafts: 2, outreach_drafts: 2, trend_radar_scans: 1 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
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

    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
    const rows = await sql`
      select t.id, t.name, t.billing_status, t.plan_code,
             coalesce(u.research_runs, 0)     as research_runs,
             coalesce(u.campaign_drafts, 0)   as campaign_drafts,
             coalesce(u.outreach_drafts, 0)   as outreach_drafts,
             coalesce(u.trend_radar_scans, 0) as trend_radar_scans,
             coalesce(u.emails_sent, 0)       as emails_sent
      from tenants t
      left join tenant_usage u
        on u.tenant_id = t.id and u.month = date_trunc('month', now())::date
      order by t.name
    `;

    const tenants = rows.map((r) => {
      const trialing = r.billing_status === 'trialing' && r.plan_code !== 'internal';
      return {
        id: r.id,
        name: r.name,
        billingStatus: r.billing_status,
        planCode: r.plan_code,
        researchRuns: r.research_runs,
        campaignDrafts: r.campaign_drafts,
        outreachDrafts: r.outreach_drafts,
        trendRadarScans: r.trend_radar_scans,
        emailsSent: r.emails_sent,
        over: {
          researchRuns: trialing && r.research_runs > CAPS.research_runs,
          campaignDrafts: trialing && r.campaign_drafts > CAPS.campaign_drafts,
          outreachDrafts: trialing && r.outreach_drafts > CAPS.outreach_drafts,
          trendRadarScans: trialing && r.trend_radar_scans > CAPS.trend_radar_scans,
        },
      };
    });

    return res.status(200).json({ tenants });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load usage data' });
  }
}
