// Vercel Cron — daily check for trialing tenants over their trial usage caps
// (CLAUDE-CODE-BRIEF-usage-alerting.md Part 2). Reporting/notification only: no
// blocking, no writes to any tenant/tenant_usage row, no changes to any write path.
//
// Deliberately a separate file with its own cron schedule from api/cron-follow-up.js
// (not extended into it), so a bug in one can never block or crash the other.
//
// Uses the plain neon() HTTP tag against the owner DATABASE_URL/POSTGRES_URL, same as
// api/cron-follow-up.js and api/webhooks/paystack.js — this queries across every tenant
// in one pass, no single org to scope app.current_tenant_id to.
//
// CAPS mirrors api/admin/usage.js's CAPS const (kept in sync by hand — same duplication
// pattern already used for AI_MARKETING_CROSS_SELL_PROMPT across src/App.jsx and
// api/cron-follow-up.js, since these are separate files with no shared import path).
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

const CAPS = { research_runs: 2, campaign_drafts: 2, outreach_drafts: 2, trend_radar_scans: 1 };
const CAP_LABELS = {
  research_runs: 'research runs',
  campaign_drafts: 'campaign drafts',
  outreach_drafts: 'outreach drafts',
  trend_radar_scans: 'Trend Radar scans',
};

export default async function handler(req, res) {
  // Same guard as api/cron-follow-up.js — Vercel auto-attaches this header on scheduled
  // invocations when CRON_SECRET is set, so the publicly-reachable cron URL can't be
  // triggered by an outsider to spam Resend or fish for tenant names.
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const rows = await sql`
      select t.id, t.name,
             coalesce(u.research_runs, 0)     as research_runs,
             coalesce(u.campaign_drafts, 0)   as campaign_drafts,
             coalesce(u.outreach_drafts, 0)   as outreach_drafts,
             coalesce(u.trend_radar_scans, 0) as trend_radar_scans
      from tenants t
      left join tenant_usage u
        on u.tenant_id = t.id and u.month = date_trunc('month', now())::date
      where t.billing_status = 'trialing' and coalesce(t.plan_code, '') != 'internal'
    `;

    const flagged = [];
    for (const r of rows) {
      const overs = Object.keys(CAPS)
        .filter((key) => r[key] > CAPS[key])
        .map((key) => `${CAP_LABELS[key]} (${r[key]}, cap ${CAPS[key]})`);
      if (overs.length) flagged.push({ name: r.name, overs });
    }

    // Send only when there's something to report — no daily "all clear" noise mail.
    if (flagged.length === 0) {
      return res.status(200).json({ flagged: 0 });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'RESEND_API_KEY is not configured', flagged: flagged.length });
    }
    if (!process.env.USAGE_ALERT_EMAIL) {
      return res.status(500).json({ error: 'USAGE_ALERT_EMAIL is not configured', flagged: flagged.length });
    }

    const text = `The following trialing tenant(s) are over their trial usage cap:\n\n${flagged
      .map((f) => `- ${f.name}: ${f.overs.join(', ')}`)
      .join('\n')}`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'AUK Usage Alerts <onboarding@resend.dev>',
        to: [process.env.USAGE_ALERT_EMAIL],
        subject: `Trial usage alert — ${flagged.length} tenant${flagged.length > 1 ? 's' : ''} over cap`,
        text,
      }),
    });
    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      return res.status(resendRes.status).json({
        error: 'Resend rejected the alert email',
        detail: resendData?.message || `HTTP ${resendRes.status}`,
        flagged: flagged.length,
      });
    }

    return res.status(200).json({ flagged: flagged.length, tenants: flagged.map((f) => f.name), resendId: resendData?.id });
  } catch (err) {
    return res.status(500).json({ error: 'Usage alert check failed', detail: err.message });
  }
}
