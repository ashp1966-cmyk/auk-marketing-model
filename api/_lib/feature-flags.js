// Per-tenant feature switches (CLAUDE-CODE-BRIEF-trend-radar-switch.md). A feature is OFF unless the tenant's
// own tenant_features row says enabled; the internal (AUK) tenant is always on. A missing row means off.
export const FEATURE_KEYS = ['trend_radar'];   // the table is generic; the allowlist lives here

// Which /api/generate feature ids sit behind a switch, and under which switch key. Only Trend Radar is
// switchable today: the other three features are not gated by a switch. generate.js and trial-status.js both
// read this so they can never disagree about what is switchable. Every value must be in FEATURE_KEYS.
export const GENERATE_FEATURE_SWITCH = { trend_radar_scans: 'trend_radar' };

export const FEATURE_DISABLED_MESSAGES = {
  trend_radar: "AI Trend Radar isn't switched on for your account. Email sales@auk-maritime.com to enable it.",
};
// The 403 body generate.js returns. `message` is what apiErrorMessage shows the customer.
export const featureDisabledBody = (key) => ({ error: 'feature_disabled', message: FEATURE_DISABLED_MESSAGES[key] });

// `client` must already be inside withTenant(orgId, ...): RLS scopes both tables to the caller's own rows.
export async function isFeatureEnabled(client, orgId, key) {
  if (!FEATURE_KEYS.includes(key)) return false;        // unknown key: never on
  const { rows: [row] } = await client.query(
    `select t.plan_code, f.enabled
       from tenants t
       left join tenant_features f on f.tenant_id = t.id and f.feature = $2
      where t.id = $1`,
    [orgId, key]
  );
  if (!row) return false;                               // no tenants row: off (fails closed)
  if (row.plan_code === 'internal') return true;        // AUK's own tenant is always on
  return row.enabled === true;                          // no row (null) or false: off
}
