// Vercel serverless function — sends a human-approved outreach_emails row via Resend,
// records sent_at, marks the prospect 'sent', and increments this tenant's monthly usage
// counter. This is the ONLY path that actually sends anything in the pipeline — it only
// acts on drafts that already have approved_by set (see api/outreach.js's PATCH), never
// on a raw draft.
//
// No verified sending domain yet, so this sends from Resend's shared onboarding@resend.dev
// address. Resend restricts that address to delivering only to the account's own verified
// email until a domain is added — expected and fine for now, not a bug.
//
// DRAFT_DRY_RUN (same local-only flag as api/_lib/anthropic-client.js — never set in
// Vercel's Production/Preview scopes): while true, this function is HARD-BLOCKED from ever
// sending to a real prospect's contact_email. It still calls the real Resend API (so the
// send path itself, quota handling, etc. all get exercised for real), but the recipient is
// forcibly overridden to DRY_RUN_RECIPIENT, which must also be set or the request is
// rejected outright rather than falling back to anything. The resulting row is tagged
// dry_run = true so it's excluded from tenant_usage counting and from
// api/cron-follow-up.js's eligibility query — dry-run activity must never look like real
// pipeline activity to anything downstream.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';

const DRAFT_DRY_RUN = process.env.DRAFT_DRY_RUN === 'true';

// tenants.name is the real org display name once a client has saved at least once via
// api/tenant-data.js's orgName piggyback (falls back to the raw org id before that happens,
// or if it's somehow still unset) — never hardcode a specific tenant's name here.
function fromAddress(tenantName, orgId) {
  const label = (tenantName && tenantName !== orgId) ? tenantName : 'Outreach';
  return `${label.replace(/[<>\r\n]/g, '')} <onboarding@resend.dev>`;
}

// Pure and exported so it can be tested in isolation, with no network/DB involved, to
// prove the one invariant that matters here: this can never resolve to a real prospect's
// address while dry-run is on.
export function resolveRecipient(contactEmail) {
  if (!DRAFT_DRY_RUN) return { to: contactEmail, blocked: false };
  const override = process.env.DRY_RUN_RECIPIENT;
  if (!override) return { to: null, blocked: true };
  return { to: override, blocked: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId } = auth;

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not configured' });
  }
  if (DRAFT_DRY_RUN && !process.env.DRY_RUN_RECIPIENT) {
    return res.status(500).json({ error: 'DRAFT_DRY_RUN is true but DRY_RUN_RECIPIENT is not set — refusing to send anything rather than risk a real prospect.' });
  }

  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  try {
    // Read + validate in one short tenant-scoped transaction, then do the Resend network
    // call with no DB connection held, then a second short transaction to record the
    // result — avoids holding a pooled connection open across a slow external call.
    const draftInfo = await withTenant(orgId, async (client) => {
      const { rows: [draft] } = await client.query(
        `select e.id, e.subject, e.body, e.approved_by, e.sent_at, e.prospect_id,
                p.contact_email, p.company_name
         from outreach_emails e
         join prospects p on p.id = e.prospect_id
         where e.id = $1 and e.tenant_id = $2`,
        [id, orgId]
      );
      if (!draft) return { status: 404, body: { error: 'Draft not found' } };
      if (!draft.approved_by) return { status: 400, body: { error: 'Draft has not been approved yet' } };
      if (draft.sent_at) return { status: 400, body: { error: 'Already sent' } };
      if (!draft.contact_email) return { status: 400, body: { error: 'Prospect has no contact email — cannot send' } };

      const { rows: [tenantRow] } = await client.query('select name from tenants where id = $1', [orgId]);
      return { draft, tenantName: tenantRow?.name };
    });

    if (draftInfo.status) return res.status(draftInfo.status).json(draftInfo.body);
    const { draft, tenantName } = draftInfo;

    const { to, blocked } = resolveRecipient(draft.contact_email);
    if (blocked) {
      return res.status(500).json({ error: 'DRAFT_DRY_RUN is true but DRY_RUN_RECIPIENT is not set — refusing to send.' });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromAddress(tenantName, orgId),
        to: [to],
        subject: DRAFT_DRY_RUN ? `[DRY RUN — real recipient was ${draft.contact_email}] ${draft.subject}` : draft.subject,
        text: draft.body,
      }),
    });
    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      // Resend's free tier caps sending at 100/day. When that cap is hit, surface it as
      // a distinct, actionable message rather than a generic "send failed" — this is an
      // expected, recoverable condition (try again tomorrow), not a bug to silently retry
      // or swallow.
      const isQuota = resendRes.status === 429 || resendData?.name === 'daily_quota_exceeded' || resendData?.name === 'rate_limit_exceeded';
      if (isQuota) {
        return res.status(429).json({
          error: 'Resend daily sending limit reached (free tier: 100 emails/day). This draft was NOT sent — try again after the limit resets, or approve fewer sends per day.',
          quotaExceeded: true,
          detail: resendData?.message,
        });
      }
      return res.status(resendRes.status).json({
        error: 'Resend rejected this email',
        detail: resendData?.message || `HTTP ${resendRes.status}`,
      });
    }

    const updatedDraft = await withTenant(orgId, async (client) => {
      const { rows: [updated] } = await client.query(
        `update outreach_emails set sent_at = now(), dry_run = $1 where id = $2
         returning id, prospect_id, subject, body, approved_by, sent_at, follow_up_of, dry_run, created_at`,
        [DRAFT_DRY_RUN, id]
      );
      if (!DRAFT_DRY_RUN) {
        // Dry-run sends never touch real pipeline state — the prospect isn't actually
        // "sent" to, and this activity isn't real tenant usage.
        await client.query(`update prospects set status = 'sent' where id = $1`, [draft.prospect_id]);
        await client.query(
          `insert into tenant_usage (tenant_id, month, emails_sent)
           values ($1, date_trunc('month', now())::date, 1)
           on conflict (tenant_id, month) do update set emails_sent = tenant_usage.emails_sent + 1`,
          [orgId]
        );
      }
      return updated;
    });

    return res.status(200).json({ draft: updatedDraft, resendId: resendData?.id });
  } catch (err) {
    return res.status(500).json({ error: 'Send failed', detail: err.message });
  }
}
