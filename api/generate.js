// Vercel serverless function — proxies the Anthropic API so the key never touches the browser
import { callClaude } from './_lib/anthropic-client.js';
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';
import { checkTrialGate, CAPS } from './_lib/trial-gate.js';
import { shapeGenerateRequest } from './_lib/generate-request.js';
import { GENERATE_FEATURE_SWITCH, isFeatureEnabled, featureDisabledBody } from './_lib/feature-flags.js';

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

  try {
    // ONE transaction. A per-tenant switch (only Trend Radar has one today) is checked BEFORE the trial gate,
    // so a switched-off tenant gets feature_disabled and never reaches Anthropic. The dry-run branch lives
    // inside callClaude, after this, so the switch is also checked before dry run. A DB error throws to the
    // catch below (500) before any AI call: it fails closed.
    const gate = await withTenant(auth.orgId, async (client) => {
      const switchKey = Object.hasOwn(GENERATE_FEATURE_SWITCH, feature) ? GENERATE_FEATURE_SWITCH[feature] : null;
      if (switchKey && !(await isFeatureEnabled(client, auth.orgId, switchKey))) {
        return { blocked: true, status: 403, body: featureDisabledBody(switchKey) };
      }
      return checkTrialGate(client, auth.orgId, feature);
    });
    if (gate.blocked) {
      return res.status(gate.status).json(gate.body);
    }

    const { status, data } = await callClaude(shaped.messages, shaped.opts);
    return res.status(status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'API call failed', detail: err.message });
  }
}
