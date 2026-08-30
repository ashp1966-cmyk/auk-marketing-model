// Vercel serverless function — read-only trial/cap status for the signed-in tenant, used
// by the UI to grey out gated nav tabs and show the right message (Step 4/5 of
// CLAUDE-CODE-BRIEF-trial-gating.md). This is UX guidance only — the real security
// boundary is api/_lib/trial-gate.js's checkTrialGate, enforced server-side in
// api/generate.js and the four feature endpoints. Deliberately reuses the same tenant/
// usage load shape as checkTrialGate rather than a third copy of the cap logic.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';
import { CAPS, CAP_LABELS, TRIAL_DAYS } from './_lib/trial-gate.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId } = auth;

  try {
    const result = await withTenant(orgId, async (client) => {
      const { rows: [tenant] } = await client.query(
        'select billing_status, plan_code, created_at from tenants where id = $1',
        [orgId]
      );
      if (!tenant) return null;

      // Same exemption as checkTrialGate: AUK's own tenant and any subscribed tenant
      // are never trial-gated, so the UI never greys anything out for them.
      const exempt = tenant.plan_code === 'internal' || tenant.billing_status !== 'trialing';

      const trialEndsAt = new Date(new Date(tenant.created_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const daysLeft = Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      const expired = !exempt && Date.now() > trialEndsAt.getTime();

      const { rows: usageRows } = await client.query(
        `select coalesce(sum(research_runs), 0)::int     as research_runs,
                coalesce(sum(campaign_drafts), 0)::int   as campaign_drafts,
                coalesce(sum(outreach_drafts), 0)::int   as outreach_drafts,
                coalesce(sum(trend_radar_scans), 0)::int as trend_radar_scans
         from tenant_usage where tenant_id = $1`,
        [orgId]
      );
      const usage = usageRows[0] || { research_runs: 0, campaign_drafts: 0, outreach_drafts: 0, trend_radar_scans: 0 };

      // Per-feature `blocked` below drives that one action's own inline error (e.g.
      // Trend Radar's cap alone blocks only Trend Radar) — that's Step 2, already
      // enforced server-side in api/generate.js and the four feature endpoints
      // regardless of this endpoint. The whole-app gate (allCapsHit below) is Step 3/4's
      // separate, stricter trigger: "7 days elapsed OR ALL caps hit" — hitting one cap
      // must never greatly out Funnel Plan, CRM, etc., which have no AI action at all.
      const perFeature = {};
      let allCapsHit = true;
      for (const feature of Object.keys(CAPS)) {
        const used = usage[feature];
        const cap = CAPS[feature];
        const blocked = !exempt && used >= cap;
        if (!blocked) allCapsHit = false;
        perFeature[feature] = { label: CAP_LABELS[feature], used, cap, blocked };
      }

      return {
        exempt,
        trialing: !exempt,
        expired,
        daysLeft,
        blocked: !exempt && (expired || allCapsHit),
        perFeature,
      };
    });

    if (!result) return res.status(404).json({ error: 'Tenant not found' });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load trial status' });
  }
}
