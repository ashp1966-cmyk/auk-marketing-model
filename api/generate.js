// Vercel serverless function — proxies the Anthropic API so the key never touches the browser
import { callClaude } from './_lib/anthropic-client.js';
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';
import { checkTrialGate, CAPS } from './_lib/trial-gate.js';

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
  if (!feature || !(feature in CAPS)) {
    return res.status(400).json({ error: 'Missing or unrecognized feature' });
  }

  try {
    const gate = await withTenant(auth.orgId, (client) => checkTrialGate(client, auth.orgId, feature));
    if (gate.blocked) {
      return res.status(gate.status).json(gate.body);
    }

    const { messages, ...opts } = req.body || {};
    delete opts.feature;
    const { status, data } = await callClaude(messages, opts);
    return res.status(status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'API call failed', detail: err.message });
  }
}
