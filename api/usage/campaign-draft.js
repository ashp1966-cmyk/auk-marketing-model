// Vercel serverless function — NOW A NO-OP. Counting a Campaign & AI draft moved into /api/generate (Phase 1b of
// CLAUDE-CODE-BRIEF-plan-limits.md): the AI call is counted when it is made. Browser tabs that were open before that
// change still POST here right after generating, expecting a 200, so this still answers (401 without a session,
// 405 for other methods) but counts nothing, so nothing is counted twice.
import { resolveOrgId } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }

  return res.status(200).json({ campaignDrafts: null, noop: true });
}
