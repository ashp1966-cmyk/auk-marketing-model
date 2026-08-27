// Paystack webhook handler (CLAUDE-CODE-BRIEF-paystack-billing.md, Checkpoint 2).
//
// Cross-tenant by nature (a delivery arrives before we know which tenant it's for), so
// this runs on the owner-role connection (DATABASE_URL), same pattern as
// cron-follow-up.js and scripts/*.mjs — NOT withTenant()/DATABASE_URL_TENANT_APP.
// See scripts/add-billing-columns.sql for why webhook_events has no RLS/tenant_id.
//
// PARTIAL ON PURPOSE: charge.success is fully handled (its payload shape is confirmed
// from Paystack's own docs/guides). subscription.disable and invoice.payment_failed are
// only verified, deduped, and stored in webhook_events — NOT parsed or acted on yet.
// Their exact payload shape wasn't reliably confirmable ahead of time, and the brief
// explicitly warns against building parsing logic against a guessed/fabricated format.
// Real payloads get captured here (webhook_events.payload) by firing Paystack's dashboard
// test-event sender at a preview deployment of this endpoint — once inspected, come back
// and fill in the two TODO blocks below against what Paystack actually sent.
import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'crypto';

// Raw-body access requires disabling Vercel's default JSON body parsing — the signature
// must be computed over the exact bytes Paystack sent, not a re-serialized JSON.parse of
// them (re-serializing can reorder keys/whitespace and silently break the HMAC match).
export const config = { api: { bodyParser: false } };

const sql = neon(process.env.DATABASE_URL);

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  if (!signatureHeader) return false;

  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const gotBuf = Buffer.from(signatureHeader, 'hex');
  // Lengths can differ if the header is garbage/truncated — timingSafeEqual throws on
  // mismatched lengths rather than returning false, so guard first.
  if (expectedBuf.length !== gotBuf.length) return false;
  return timingSafeEqual(expectedBuf, gotBuf);
}

// Paystack doesn't guarantee a single canonical "event id" field across event types.
// Prefer data.id (present on charge/subscription objects), fall back through other
// plausible unique fields, and fall back further to a hash of the raw body so dedup never
// silently no-ops just because none of the expected id fields showed up.
function deriveEventId(event, data, rawBody) {
  const candidate = data?.id ?? data?.reference ?? data?.subscription_code ?? data?.invoice_code;
  if (candidate !== undefined && candidate !== null) return `${event}:${candidate}`;
  return `${event}:${createHmac('sha256', 'fallback').update(rawBody).digest('hex')}`;
}

async function findTenantId(data) {
  const metaTenantId = data?.metadata?.tenant_id;
  if (metaTenantId) {
    const [row] = await sql`select id from tenants where id = ${metaTenantId}`;
    if (row) return row.id;
  }
  const customerCode = data?.customer?.customer_code;
  if (customerCode) {
    const [row] = await sql`select id from tenants where paystack_customer_code = ${customerCode}`;
    if (row) return row.id;
  }
  const subscriptionCode = data?.subscription_code;
  if (subscriptionCode) {
    const [row] = await sql`select id from tenants where paystack_subscription_code = ${subscriptionCode}`;
    if (row) return row.id;
  }
  return null;
}

async function handleChargeSuccess(data) {
  const tenantId = await findTenantId(data);
  if (!tenantId) {
    // No tenant match yet (e.g. a canned test event with no real metadata/customer_code
    // tie-back, or the charge arrived before Checkpoint 3's checkout flow ever recorded
    // this customer). Nothing to update — not an error, just nothing to do.
    return { ok: true, tenantId: null };
  }

  const customerCode = data?.customer?.customer_code ?? null;
  const subscriptionCode = data?.subscription_code ?? null;
  const planCode = data?.metadata?.plan_code ?? data?.plan?.plan_code ?? null;

  // Monthly plans only (Starter/Growth/Agency, per the brief) — 31 days covers every
  // calendar month without shorting a 31-day one. Revisit if Paystack's real payload
  // (captured via the preview test) includes a usable next_payment_date we should prefer
  // over this fixed offset instead.
  await sql`
    update tenants
    set billing_status = 'active',
        paid_until = now() + interval '31 days',
        paystack_customer_code = coalesce(${customerCode}, paystack_customer_code),
        paystack_subscription_code = coalesce(${subscriptionCode}, paystack_subscription_code),
        plan_code = coalesce(${planCode}, plan_code)
    where id = ${tenantId}
  `;
  return { ok: true, tenantId };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Could not read request body' });
  }

  let signatureValid;
  try {
    signatureValid = verifySignature(rawBody, req.headers['x-paystack-signature']);
  } catch (err) {
    // Misconfiguration (missing secret), not a bad request — 500, not 400, so it doesn't
    // look to Paystack like a permanent rejection they should stop retrying.
    return res.status(500).json({ error: 'Webhook verification misconfigured' });
  }
  if (!signatureValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { event, data } = body;
  const eventId = deriveEventId(event, data, rawBody);

  try {
    // Atomic dedupe: if this event_id already exists, the insert is a no-op and returns
    // no row — that's the idempotency check and the "record it" step in one query, no
    // separate select-then-insert race window.
    const inserted = await sql`
      insert into webhook_events (event_id, provider, payload)
      values (${eventId}, 'paystack', ${sql.json(body)})
      on conflict (event_id) do nothing
      returning event_id
    `;
    if (inserted.length === 0) {
      return res.status(200).json({ ok: true, deduped: true });
    }

    if (event === 'charge.success') {
      await handleChargeSuccess(data);
    } else if (event === 'subscription.disable' || event === 'invoice.payment_failed') {
      // TODO: fill in once real payload shape is captured and reviewed (see file header).
      // Payload is already stored in webhook_events for inspection.
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Webhook processing failed', detail: err.message });
  }
}
