// Vercel serverless function — proxies the Anthropic API so the key never touches the browser
import { callClaude, DRY_RUN } from './_lib/anthropic-client.js';
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';
import { checkTrialGate, capReachedBody, CAPS } from './_lib/trial-gate.js';
import { shapeGenerateRequest } from './_lib/generate-request.js';
import { GENERATE_FEATURE_SWITCH, isFeatureEnabled, featureDisabledBody } from './_lib/feature-flags.js';
import { reserveUnit, refundUnit } from './_lib/usage-meter.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }

  // Required so this proxy — the actual point of Anthropic spend for all four metered
  // features — knows which trial cap to check before making the call. Every caller
  // (App.jsx's Campaign, Trend Radar, Prospecting research and outreach-drafting
  // generators) is being updated to send this; there is no ungated caller of this
  // endpoint by design.
  const { feature } = req.body || {};
  // typeof first: Object.hasOwn coerces its key, so an array like ["research_runs"] would pass.
  if (typeof feature !== 'string' || !Object.hasOwn(CAPS, feature)) {
    return res.status(400).json({ error: 'Missing or unrecognized feature' });
  }

  // The client chooses `feature` and the whole request, so neither can be trusted to describe the
  // cost of the call. Rebuild the Anthropic request from an allowlist; anything outside it is a 400.
  const shaped = shapeGenerateRequest(req.body);
  if (!shaped.ok) {
    return res.status(400).json({ error: shaped.code, message: shaped.message });
  }

  // Phase 1b: the AI call is counted HERE, when it is made (not later by the browser). `reservation` is set ONLY
  // after the transaction that counted the unit has committed, so a failed commit can never trigger a refund.
  let reservation = null;   // { feature, month }
  const giveBack = async () => {
    if (!reservation) return;
    const r = reservation;
    reservation = null;     // at most one refund, whatever happens next
    try {
      await withTenant(auth.orgId, (client) => refundUnit(client, auth.orgId, r.feature, r.month));
    } catch (e) {
      console.error('[usage] refund failed', e?.code || e?.name);   // the unit stays used: the safe side
    }
  };

  try {
    // ONE transaction. A per-tenant switch (only Trend Radar has one today) is checked BEFORE the trial gate,
    // so a switched-off tenant gets feature_disabled and never reaches Anthropic. The dry-run branch lives
    // inside callClaude, after this, so the switch is also checked before dry run. A DB error throws to the
    // catch below (500) before any AI call: it fails closed.
    const outcome = await withTenant(auth.orgId, async (client) => {
      const switchKey = Object.hasOwn(GENERATE_FEATURE_SWITCH, feature) ? GENERATE_FEATURE_SWITCH[feature] : null;
      if (switchKey && !(await isFeatureEnabled(client, auth.orgId, switchKey))) {
        return { blocked: true, status: 403, body: featureDisabledBody(switchKey) };
      }
      // One lock per tenant until this transaction ends: a tenant's concurrent AI calls queue here, so the cap
      // check and the increment below can never both pass on a stale count. (Held only for these queries, not
      // for the AI call itself.)
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [auth.orgId]);
      const gate = await checkTrialGate(client, auth.orgId, feature);
      if (gate.blocked || DRY_RUN) return gate;   // dry-run calls are never counted
      const month = await reserveUnit(client, auth.orgId, feature, gate.limit);
      if (month === null) return { blocked: true, status: 402, body: capReachedBody(feature) };   // lost a race at the cap
      return { ...gate, reserved: { feature, month } };
    });
    if (outcome.blocked) {
      return res.status(outcome.status).json(outcome.body);
    }
    reservation = outcome.reserved || null;   // committed: from here on a failure must give the unit back

    const { status, data } = await callClaude(shaped.messages, shaped.opts);
    // Anthropic failed (not "the reply was bad"): this attempt gives its unit back. A 200 always stays counted,
    // including a reply the browser later cannot parse.
    if (status >= 400 || data?.type === 'error') await giveBack();
    return res.status(status).json(data);
  } catch (err) {
    await giveBack();   // our server (or the network call) failed after counting
    return res.status(500).json({ error: 'API call failed', detail: err.message });
  }
}
