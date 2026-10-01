// Vercel Cron — daily period-end flip for cancelled subscriptions
// (CLAUDE-CODE-BRIEF-subscription-cancellation.md, Step 4). A tenant that cancelled through
// POST /api/billing/cancel (or Paystack's subscription.not_renew, see api/webhooks/paystack.js)
// has cancel_at_period_end = true but stays billing_status = 'active' so access continues
// through paid_until. Once paid_until has passed, this job flips them to 'cancelled' -- an
// explicit status that api/_lib/trial-gate.js's classifyBillingStatus locks out on purpose
// (NOT reused 'trialing', which would only lock them out incidentally via the trial caps).
//
// Deliberately a separate file with its own cron schedule from the other crons, so a bug in
// one can never block or crash another. Uses the plain neon() HTTP tag against the owner
// DATABASE_URL/POSTGRES_URL, same as api/cron-usage-alert.js -- one cross-tenant statement,
// no single org to scope app.current_tenant_id to.
//
// Idempotent: a flipped row no longer matches (billing_status is no longer 'active' and the
// flag is cleared), so re-running changes nothing. cancel_reason / cancel_requested_at are
// kept as history. Daily cadence means up to ~24h lag after paid_until -- fine for monthly plans.
//
// NOT handled here (separate tracked gap): involuntary lapse -- a tenant whose payment fails or
// who simply isn't renewed WITHOUT cancelling stays 'active'; nothing flips them.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export default async function handler(req, res) {
  // Same guard as the other crons: Vercel attaches this header on scheduled invocations when
  // CRON_SECRET is set, so the publicly-reachable cron URL can't be triggered by an outsider.
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const flipped = await sql`
      update tenants
      set billing_status = 'cancelled',
          cancel_at_period_end = false
      where billing_status = 'active'
        and cancel_at_period_end = true
        and paid_until < now()
        and coalesce(plan_code, '') <> 'internal'
      returning id, name
    `;
    // Ids/names only (no codes, tokens or reasons) so a run is auditable in the function log.
    for (const t of flipped) console.log(`[cron-period-end] cancelled ${t.name} (${t.id})`);
    return res.status(200).json({ flipped: flipped.length });
  } catch (err) {
    console.error('[cron-period-end] failed');
    return res.status(500).json({ error: 'Period-end flip failed' });
  }
}
