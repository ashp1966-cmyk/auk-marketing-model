// Vercel serverless function — proxies the Anthropic API so the key never touches the browser
import { callClaude } from './_lib/anthropic-client.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, ...opts } = req.body || {};
    const { status, data } = await callClaude(messages, opts);
    return res.status(status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'API call failed', detail: err.message });
  }
}
