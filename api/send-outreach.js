// Vercel serverless function — sends a human-approved outreach_emails row via Resend,
// records sent_at, marks the prospect 'sent', and increments this tenant's monthly usage
// counter. This is the ONLY path that actually sends anything in the pipeline — it only
// acts on drafts that already have approved_by set (see api/outreach.js's PATCH), never
// on a raw draft.
//
// No verified sending domain yet, so this sends from Resend's shared onboarding@resend.dev
// address. Resend restricts that address to delivering only to the account's own verified
// email until a domain is added — expected and fine for now, not a bug.
import { neon } from '@neondatabase/serverless';
import { resolveOrgId } from './_lib/auth.js';

const sql = neon(process.env.DATABASE_URL);
const FROM_ADDRESS = 'AUK Marine & Mining <onboarding@resend.dev>';

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

  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  try {
    const [draft] = await sql`
      select e.id, e.subject, e.body, e.approved_by, e.sent_at, e.prospect_id,
             p.contact_email, p.company_name
      from outreach_emails e
      join prospects p on p.id = e.prospect_id
      where e.id = ${id} and e.tenant_id = ${orgId}
    `;
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    if (!draft.approved_by) {
      return res.status(400).json({ error: 'Draft has not been approved yet' });
    }
    if (draft.sent_at) {
      return res.status(400).json({ error: 'Already sent' });
    }
    if (!draft.contact_email) {
      return res.status(400).json({ error: 'Prospect has no contact email — cannot send' });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [draft.contact_email],
        subject: draft.subject,
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

    const [updatedDraft] = await sql`
      update outreach_emails set sent_at = now() where id = ${id}
      returning id, prospect_id, subject, body, approved_by, sent_at, follow_up_of, created_at
    `;
    await sql`update prospects set status = 'sent' where id = ${draft.prospect_id}`;
    await sql`
      insert into tenant_usage (tenant_id, month, emails_sent)
      values (${orgId}, date_trunc('month', now())::date, 1)
      on conflict (tenant_id, month) do update set emails_sent = tenant_usage.emails_sent + 1
    `;

    return res.status(200).json({ draft: updatedDraft, resendId: resendData?.id });
  } catch (err) {
    return res.status(500).json({ error: 'Send failed', detail: err.message });
  }
}
