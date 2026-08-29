// Vercel serverless function — proxies the Anthropic API so the key never touches the browser
import { callClaude } from './_lib/anthropic-client.js';
import { resolveOrgId } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }

  try {
    const { messages, ...opts } = req.body || {};
    const { status, data } = await callClaude(messages, opts);
    return res.status(status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'API call failed', detail: err.message });
  }
}
