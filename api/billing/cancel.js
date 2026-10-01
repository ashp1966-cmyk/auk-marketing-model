// Self-service end-of-period subscription cancellation
// (CLAUDE-CODE-BRIEF-subscription-cancellation.md, Step 2). Tenant-scoped via withTenant(),
// same auth/RLS pattern as status.js.
//
// Calls Paystack's POST /subscription/disable with the subscription_code/email_token captured
// by the webhook's subscription.create branch. On success it records a PENDING cancellation
// (cancel_at_period_end) and leaves billing_status = 'active' -- access continues through
// paid_until; the period-end job (Step 4) does the actual flip.
//
// Failure window: if Paystack accepts the cancel but our DB write fails, the subscription is
// disabled while the row still looks active. Paystack then sends subscription.not_renew, which
// the webhook handler turns into the same cancel_at_period_end = true (self-healing).
//
// subscription_code / email_token are NEVER returned or logged; email_token is effectively a
// credential for the disable call.
import { resolveOrgId } from '../_lib/auth.js';
import { withTenant } from '../_lib/db.js';

const SUPPORT_EMAIL = 'sales@auk-maritime.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth || !auth.orgId) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId } = auth;

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Billing is not configured' });
  }

  // Optional one-line reason, capped at 200 chars, never required.
  const rawReason = req.body?.reason;
  const reason = typeof rawReason === 'string' ? rawReason.trim().slice(0, 200) : '';

  try {
    const tenant = await withTenant(orgId, async (client) => {
      const { rows } = await client.query(
        `select billing_status, paid_until, cancel_at_period_end,
                paystack_subscription_code, paystack_email_token
         from tenants where id = $1`,
        [orgId]
      );
      return rows[0] || null;
    });

    if (!tenant || tenant.billing_status !== 'active') {
      return res.status(409).json({ error: 'There is no active subscription to cancel.' });
    }
    if (tenant.cancel_at_period_end) {
      // Already pending: idempotent success, don't call Paystack a second time.
      return res.status(200).json({ cancelAtPeriodEnd: true, paidUntil: tenant.paid_until });
    }
    if (!tenant.paystack_subscription_code || !tenant.paystack_email_token) {
      return res.status(409).json({
        error: `We don't have your subscription details on file yet. Please email ${SUPPORT_EMAIL} and we'll cancel it for you.`,
      });
    }

    let resp, json;
    try {
      resp = await fetch('https://api.paystack.co/subscription/disable', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: tenant.paystack_subscription_code, token: tenant.paystack_email_token }),
      });
      json = await resp.json();
    } catch (err) {
      console.error('[billing-cancel] Paystack request failed');
      return res.status(502).json({ error: `Could not reach our payment provider. Please try again, or email ${SUPPORT_EMAIL}.` });
    }
    if (!resp.ok || !json?.status) {
      console.error('[billing-cancel] Paystack disable rejected', resp.status, json?.message);
      return res.status(502).json({ error: `Our payment provider could not cancel the subscription. Please try again, or email ${SUPPORT_EMAIL}.` });
    }

    try {
      await withTenant(orgId, async (client) => {
        await client.query(
          `update tenants
           set cancel_at_period_end = true,
               cancel_reason = $2,
               cancel_requested_at = now()
           where id = $1`,
          [orgId, reason || null]
        );
      });
    } catch (err) {
      // Paystack already disabled it; the not_renew webhook will record the flag. Don't tell
      // the client it failed -- it didn't.
      console.error('[billing-cancel] cancelled with Paystack but DB write failed; webhook will sync');
      return res.status(500).json({
        error: 'Your cancellation was submitted, but we could not record it yet. It should show here shortly; if not, email ' + SUPPORT_EMAIL + '.',
      });
    }

    return res.status(200).json({ cancelAtPeriodEnd: true, paidUntil: tenant.paid_until });
  } catch (err) {
    return res.status(500).json({ error: 'Cancellation failed' });
  }
}
