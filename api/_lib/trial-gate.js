// Shared trial-cap/expiry check, used as a two-layer gate — see
// CLAUDE-CODE-BRIEF-trial-gating.md. Called from api/generate.js (before the Anthropic
// call, to actually stop spend) AND from each feature's tenant-aware persistence/usage
// endpoint (api/prospects.js, api/outreach.js, api/usage/campaign-draft.js,
// api/usage/trend-radar-scan.js, before their write, to stop a replayed or bypassed save
// from landing after the cap is already hit). Both call sites are deliberate, not
// redundant — gating only the second layer would leave the Anthropic spend itself
// unprotected for campaign drafts and Trend Radar scans, which never persist content
// server-side before their usage-record call.
//
// tenant_usage is keyed (tenant_id, month) — a 7-day trial can straddle a month
// boundary, so the cap check below sums the feature's column across ALL of a tenant's
// tenant_usage rows, not just the current month. (The current-month-only queries in
// api/admin/usage.js and api/cron-usage-alert.js are fine for their own reporting
// purpose, but would undercount here.)

const TRIAL_DAYS = 7;

const CAPS = {
  research_runs: 2,
  campaign_drafts: 2,
  outreach_drafts: 2,
  trend_radar_scans: 1,
};

const CAP_LABELS = {
  research_runs: 'research runs',
  campaign_drafts: 'campaign drafts',
  outreach_drafts: 'outreach email drafts',
  trend_radar_scans: 'Trend Radar scans',
};

// Singular forms, used only when a feature's cap is exactly 1 — "You've used all 1 Trend
// Radar scans" reads as a grammar error, not a rounding quirk, so it's worth the extra map.
const CAP_LABELS_SINGULAR = {
  research_runs: 'research run',
  campaign_drafts: 'campaign draft',
  outreach_drafts: 'outreach email draft',
  trend_radar_scans: 'Trend Radar scan',
};

// `client` must already be inside withTenant(orgId, ...) — RLS scopes both queries below
// to the caller's own tenant row regardless of the orgId passed in. Returns
// { blocked: false } when the action may proceed, or { blocked: true, status, body }
// (body shaped for a direct res.status(status).json(body) response) when it may not.
export async function checkTrialGate(client, orgId, feature) {
  if (!(feature in CAPS)) {
    throw new Error(`Unknown trial-gated feature: ${feature}`);
  }

  const { rows: [tenant] } = await client.query(
    'select billing_status, plan_code, created_at from tenants where id = $1',
    [orgId]
  );
  if (!tenant) {
    return { blocked: true, status: 404, body: { error: 'Tenant not found' } };
  }

  // AUK's own tenant — exempt from all trial gating, always.
  if (tenant.plan_code === 'internal') {
    return { blocked: false };
  }

  // Once subscribed, trial caps no longer apply — real plan limits are separate,
  // not-yet-built work. A lapsed/suspended subscription is Checkpoint 4's own gate,
  // not this one.
  if (tenant.billing_status !== 'trialing') {
    return { blocked: false };
  }

  const trialEndsAt = new Date(tenant.created_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > trialEndsAt) {
    return {
      blocked: true,
      status: 402,
      body: { error: 'trial_expired', message: 'Your trial has ended — subscribe to continue.' },
    };
  }

  const cap = CAPS[feature];
  const { rows: [usage] } = await client.query(
    // Safe to interpolate `feature` directly: validated above against the fixed CAPS
    // key set, never taken from request input beyond that whitelist check.
    `select coalesce(sum(${feature}), 0)::int as total from tenant_usage where tenant_id = $1`,
    [orgId]
  );
  if (usage.total >= cap) {
    return {
      blocked: true,
      status: 402,
      body: {
        error: 'trial_cap_reached',
        feature,
        message: cap === 1
          ? `You've used your ${cap} trial ${CAP_LABELS_SINGULAR[feature]} — subscribe to continue.`
          : `You've used all ${cap} trial ${CAP_LABELS[feature]} — subscribe to continue.`,
      },
    };
  }

  return { blocked: false };
}

export { CAPS, CAP_LABELS, TRIAL_DAYS };
