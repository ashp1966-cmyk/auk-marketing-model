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

// The ONE place a tenant's billing state is classified, shared by checkTrialGate below and
// api/trial-status.js so the real gate and the UI lock can never disagree about what a status
// means. It is an explicit ALLOWLIST: a billing gate's default must be deny-unless-allowed, so
// any billing_status not named here classifies as 'unrecognized' and is treated as locked out
// (fail closed) rather than silently granted access the way an `!== 'trialing'` exclusion would.
//   internal     -> AUK's own tenant (plan_code 'internal'), never gated
//   active       -> paid, full access
//   trialing     -> subject to the trial expiry + usage caps
//   cancelled    -> subscription ended (period-end job flips active -> cancelled), locked out
//   unrecognized -> anything else (incl. a future/unset status), locked out
export function classifyBillingStatus(tenant) {
  if (tenant.plan_code === 'internal') return 'internal';
  switch (tenant.billing_status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'cancelled': return 'cancelled';
    default: return 'unrecognized';
  }
}

// `client` must already be inside withTenant(orgId, ...) — RLS scopes both queries below
// to the caller's own tenant row regardless of the orgId passed in. Returns
// { blocked: false } when the action may proceed, or { blocked: true, status, body }
// (body shaped for a direct res.status(status).json(body) response) when it may not.
// The 402 body for a trialing tenant that has used its cap for `feature`. Shared by the gate's read check and by
// api/generate.js's atomic reserve (which can lose a race at the cap and must say exactly the same thing).
export function capReachedBody(feature) {
  const cap = CAPS[feature];
  return {
    error: 'trial_cap_reached',
    feature,
    message: cap === 1
      ? `You've used your ${cap} trial ${CAP_LABELS_SINGULAR[feature]} — subscribe to continue.`
      : `You've used all ${cap} trial ${CAP_LABELS[feature]} — subscribe to continue.`,
  };
}

// opts.skipCap: status and expiry only (used by the save endpoints, whose AI call was already counted by generate.js,
// so a cap check there would refuse the LAST allowed run). A passing result carries `limit`: the cap for a trialing
// tenant, null (no limit yet) for internal and paid ones; generate.js hands it to the atomic reserve.
export async function checkTrialGate(client, orgId, feature, opts = {}) {
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

  switch (classifyBillingStatus(tenant)) {
    case 'internal': // AUK's own tenant — exempt from all gating, always.
    case 'active':   // Once subscribed, trial caps no longer apply — real plan limits are separate, not-yet-built work.
      return { blocked: false, limit: null };
    case 'trialing':
      break; // trial expiry + caps below
    case 'cancelled':
      return {
        blocked: true,
        status: 402,
        body: { error: 'subscription_cancelled', message: 'Your subscription has ended — resubscribe to continue.' },
      };
    default: // 'unrecognized' — fail closed
      return {
        blocked: true,
        status: 402,
        body: { error: 'subscription_inactive', message: "Your subscription isn't active — visit Billing or email sales@auk-maritime.com." },
      };
  }

  const trialEndsAt = new Date(tenant.created_at).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > trialEndsAt) {
    return {
      blocked: true,
      status: 402,
      body: { error: 'trial_expired', message: 'Your trial has ended — subscribe to continue.' },
    };
  }

  if (opts.skipCap) return { blocked: false, limit: CAPS[feature] };

  const cap = CAPS[feature];
  const { rows: [usage] } = await client.query(
    // Safe to interpolate `feature` directly: validated above against the fixed CAPS
    // key set, never taken from request input beyond that whitelist check.
    `select coalesce(sum(${feature}), 0)::int as total from tenant_usage where tenant_id = $1`,
    [orgId]
  );
  if (usage.total >= cap) {
    return { blocked: true, status: 402, body: capReachedBody(feature) };
  }

  return { blocked: false, limit: cap };
}

export { CAPS, CAP_LABELS, TRIAL_DAYS };
