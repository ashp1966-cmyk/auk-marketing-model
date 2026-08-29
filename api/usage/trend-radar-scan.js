// Vercel serverless function — records one AI Trend Radar scan against the caller's
// tenant_usage row. The scan itself is generated client-side via /api/generate (a
// stateless, tenant-blind proxy, same pattern as Campaign & AI's social-post generator)
// and saved into the tenant's scans state through the existing tenant-data autosave —
// this endpoint's only job is the usage count, called by the client right after a
// successful /api/generate response. Same shape as api/outreach.js's POST increment.
import { resolveOrgId } from '../_lib/auth.js';
import { withTenant } from '../_lib/db.js';

// Same local-only flag as api/_lib/anthropic-client.js and api/outreach.js — when the
// server itself is in dry-run mode, the scan the client just generated came from
// /api/generate's canned placeholder content, so don't let it count against real usage.
const DRAFT_DRY_RUN = process.env.DRAFT_DRY_RUN === 'true';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId } = auth;

  try {
    if (DRAFT_DRY_RUN) {
      return res.status(200).json({ trendRadarScans: null, dryRun: true });
    }

    const count = await withTenant(orgId, async (client) => {
      const { rows: [row] } = await client.query(
        `insert into tenant_usage (tenant_id, month, trend_radar_scans)
         values ($1, date_trunc('month', now())::date, 1)
         on conflict (tenant_id, month) do update set trend_radar_scans = tenant_usage.trend_radar_scans + 1
         returning trend_radar_scans`,
        [orgId]
      );
      return row.trend_radar_scans;
    });

    return res.status(200).json({ trendRadarScans: count, dryRun: false });
  } catch (err) {
    return res.status(500).json({ error: 'Database operation failed', detail: err.message });
  }
}
