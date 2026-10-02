// Minimal checkout-init endpoint, pulled forward from Checkpoint 3 to generate a real
// charge.success event for Checkpoint 2's webhook verification
// (CLAUDE-CODE-BRIEF-paystack-billing.md). NOT the full Billing tab yet — no plan
// selection UI, `email` is accepted from the caller rather than a real per-tenant billing
// contact field (doesn't exist yet). Extend rather than replace when Checkpoint 3 proper
// is built.
import { resolveOrgId } from '../_lib/auth.js';
import { withTenant } from '../_lib/db.js';
import { classifyBillingStatus } from '../_lib/trial-gate.js';

// Checkout may start only for a tenant that has no live subscription to double up on: still
// trialing, or previously cancelled. Everything else is refused (allowlist, not a block-list), so
// a status added later is refused until someone deliberately allows it.
const CHECKOUT_ALLOWED = ['trialing', 'cancelled'];
const CHECKOUT_REFUSAL = {
  active: {
    code: 'plan_change_unavailable',
    message: 'To change plan, email sales@auk-maritime.com',
  },
  internal: {
    code: 'internal_account',
    message: "This is the platform owner account and doesn't use paid plans.",
  },
  // 'unrecognized' (past_due, suspended, anything unexpected) and any future classifier value.
  default: {
    code: 'checkout_unavailable',
    message: "We can't start a new subscription for this account right now. Please email sales@auk-maritime.com",
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth || !auth.orgId) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }

  const { planCode, email } = req.body || {};
  if (!planCode || typeof planCode !== 'string') {
    return res.status(400).json({ error: 'Missing planCode' });
  }
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Missing email' });
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Billing is not configured' });
  }

  try {
    // A new plan-bearing Paystack transaction on an active account would create a second
    // subscription without cancelling the first (double billing) and overwrite the stored codes
    // cancel.js needs. A tenant row that doesn't exist yet proceeds exactly as before. A DB failure
    // lands in the catch below (500) and creates no checkout, i.e. fails closed.
    const tenant = await withTenant(auth.orgId, async (client) => {
      const { rows: [row] } = await client.query(
        'select billing_status, plan_code from tenants where id = $1',
        [auth.orgId]
      );
      return row;
    });
    if (tenant) {
      const kind = classifyBillingStatus(tenant);
      if (!CHECKOUT_ALLOWED.includes(kind)) {
        const refusal = CHECKOUT_REFUSAL[kind] || CHECKOUT_REFUSAL.default;
        return res.status(409).json({ error: refusal.message, code: refusal.code });
      }
    }

    // amount omitted deliberately: Paystack derives it from the plan when `plan` is
    // given, and pulling this checkpoint's throwaway daily-cycle plan's amount in here
    // would just be duplicating a number Paystack already has as the source of truth.
    //
    // callback_url is derived from the request itself (not a hardcoded production
    // domain) so checkout initiated from a Preview deployment redirects back to that
    // same Preview URL, not production — avoids yet another Preview/production
    // mismatch. Lands on the Billing tab via ?tab=billing; the redirect itself doesn't
    // assert success, it just gets the person back to the page whose existing
    // status-fetch-on-load logic shows whatever the webhook has actually confirmed.
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const resp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        plan: planCode,
        metadata: { tenant_id: auth.orgId, plan_code: planCode },
        callback_url: `${origin}/?tab=billing`,
      }),
    });
    const json = await resp.json();
    if (!resp.ok || !json.status) {
      return res.status(502).json({ error: 'Paystack initialize failed', detail: json.message });
    }
    return res.status(200).json({ authorizationUrl: json.data.authorization_url });
  } catch (err) {
    return res.status(500).json({ error: 'Checkout init failed', detail: err.message });
  }
}
