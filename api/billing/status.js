// Vercel serverless function — read-only billing status for the signed-in tenant
// (Checkpoint 3, CLAUDE-CODE-BRIEF-paystack-billing.md). RLS-protected via withTenant(), same pattern as
// hubspot-token.js. The webhook (api/webhooks/paystack.js) is the only writer of these columns; this endpoint never
// writes. Phase 2 (b) adds `usage`: what the Billing page's meters show. Every number, label and plan name is decided
// here; the client duplicates none of it.
import { resolveOrgId } from '../_lib/auth.js';
import { withTenant } from '../_lib/db.js';
import { CAPS, TRIAL_DAYS, classifyBillingStatus } from '../_lib/trial-gate.js';
import { planLimits, resetDateText, nextMonthStartISO } from '../_lib/plan-limits.js';
import { GENERATE_FEATURE_SWITCH, isFeatureEnabled } from '../_lib/feature-flags.js';

// Display order of the meters. Must be exactly the metered features (CAPS keys).
const FEATURES = ['research_runs', 'trend_radar_scans', 'campaign_drafts', 'outreach_drafts'];
const LABELS = { research_runs: 'Research runs', trend_radar_scans: 'Trend Radar scans', campaign_drafts: 'Campaign drafts', outreach_drafts: 'Outreach email drafts' };

// ONE read, both windows at once (FEATURES are fixed constants, never request input). The same two windows the gate
// and the reserve use: t_* = all months summed (the trial), m_* = the current calendar month in UTC (paid plans).
const USAGE_SQL = `select ${FEATURES.map((f) =>
  `coalesce(sum(${f}), 0)::int as t_${f}, coalesce(sum(${f}) filter (where month = date_trunc('month', now())::date), 0)::int as m_${f}`).join(', ')}
  from tenant_usage where tenant_id = $1`;

function buildUsage(kind, tenant, plan, u) {
  if (kind === 'active' && !plan) return { kind: 'unrecognized', window: null, planName: null, resetsOn: null, resetsText: null, trialEndsAt: null, features: null };
  const paid = kind === 'active';
  const features = {};
  for (const f of FEATURES) {
    features[f] = { label: LABELS[f], used: paid ? u[`m_${f}`] : u[`t_${f}`], limit: paid ? plan[f] : CAPS[f], enabled: true };
  }
  return {
    kind,
    window: paid ? 'month' : 'total',
    planName: paid ? plan.name : null,
    resetsOn: paid ? nextMonthStartISO() : null,
    resetsText: paid ? resetDateText() : null,
    trialEndsAt: paid ? null : new Date(new Date(tenant.created_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    features,
  };
}

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
    const { row, usage } = await withTenant(orgId, async (client) => {
      const { rows } = await client.query(
        `select billing_status, plan_code, paid_until, cancel_at_period_end, created_at,
                (paystack_subscription_code is not null and paystack_email_token is not null) as has_subscription_on_file
         from tenants where id = $1`,
        [orgId]
      );
      const row = rows[0] || null;
      const kind = row ? classifyBillingStatus(row) : null;
      if (kind !== 'trialing' && kind !== 'active') return { row, usage: null };   // internal, cancelled, other, no row: no meters
      const plan = kind === 'active' ? planLimits(row.plan_code) : null;
      if (kind === 'active' && !plan) return { row, usage: buildUsage(kind, row, null, null) };   // unknown plan: no read needed
      const { rows: [u] } = await client.query(USAGE_SQL, [orgId]);
      return { row, usage: buildUsage(kind, row, plan, u) };
    });

    // Trend Radar switch: its OWN transaction, so a failure shows "off" (logged by code/name only) and never takes the
    // numbers down. Same helper and mapping generate.js enforces with. UX only: the server decides.
    if (usage?.features) {
      const on = await withTenant(orgId, (client) => isFeatureEnabled(client, orgId, GENERATE_FEATURE_SWITCH.trend_radar_scans))
        .catch((err) => { console.error('[billing-status] feature switch lookup failed', err?.code || err?.name); return false; });
      usage.features.trend_radar_scans.enabled = on;
    }

    return res.status(200).json({
      billingStatus: row?.billing_status || 'trialing',
      planCode: row?.plan_code || null,
      paidUntil: row?.paid_until || null,
      cancelAtPeriodEnd: !!row?.cancel_at_period_end,
      // Boolean only -- the subscription code / email token themselves never leave the server.
      hasSubscriptionOnFile: !!row?.has_subscription_on_file,
      usage,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load billing status' });
  }
}
