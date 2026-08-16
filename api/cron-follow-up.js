// Vercel Cron — runs daily (see vercel.json). Finds outreach_emails that were sent 5+
// days ago and don't already have a follow-up drafted, drafts a follow-up per prospect
// via the Anthropic API directly (this runs server-side with no browser involved, so it
// calls Anthropic directly rather than through the /api/generate browser proxy), and adds
// each to the same human review queue as Checkpoint 3 — it NEVER sends anything itself.
//
// Known limitation: there is no inbound-email webhook, so "no reply after 5 days" can't
// actually be verified — this drafts a follow-up for every sent email past 5 days
// regardless of whether the prospect replied. Every such draft is tagged (via
// follow_up_of) so the UI can warn the reviewer to confirm silence before approving.
// Tracked as a real gap in CLAUDE.md ("reply detection via inbound webhook") — not
// forgotten, just out of scope for this checkpoint.
import { neon } from '@neondatabase/serverless';
import { callClaude } from './_lib/anthropic-client.js';

const sql = neon(process.env.DATABASE_URL);
const FOLLOW_UP_DAYS = 5;

// Kept identical to the AI_MARKETING_CROSS_SELL_PROMPT constant in src/App.jsx — this
// file can't import that one directly (App.jsx is JSX, this is a plain Node function),
// so keep both in sync by hand if the cross-sell pitch ever changes.
const AI_MARKETING_CROSS_SELL_PROMPT = `Also include a separate short paragraph (2-3 sentences MAXIMUM, no more) pitching AUK's AI-driven marketing consulting service as a secondary, standing offer — this is a cross-sell included in every outreach email, independent of the service above. Frame it around the prospect's own growth: AUK has built an advanced, AI-driven marketing system, custom-built per client, designed to grow market share and profitability — the outcome is the pitch, not the sophistication of the system. Include exactly ONE credible technical highlight, phrased close to this: "the same AI system sets a growth target, calculates exactly what it costs to win it, intelligently allocates budget to the best opportunities, and feeds qualified leads straight into a CRM — built on the same platform running AUK's own growth today." Do NOT explain the full pipeline (funnel stages, budget optimizer, capacity checks, etc.) — that level of detail belongs in a follow-up or one-pager, not this first-contact email`;

async function draftFollowUp({ companyName, contactName, serviceName, isPeer, rationale, segments, originalSubject, originalBody }) {
  const prompt = isPeer ? `You are a business development rep for AUK Marine & Mining, a South African maritime & mining services company (auk-maritime.com), writing a brief follow-up to a cold email sent 5 days ago to a company whose own core business overlaps with AUK's "${serviceName}" service line — so DO NOT pitch that service to them, they're a peer/competitor in it, not a customer.

Prospect company: ${companyName}
Prospect contact: ${contactName || "(no named contact — address the company generally)"}
Original email subject: ${originalSubject}
Original email body: ${originalBody}

Write a short, polite follow-up (do not assume they ignored the first email on purpose — they may simply be busy). Requirements:
- Reference the original email briefly without repeating it in full.
- Keep leading with AUK's AI-driven marketing consulting service as the pitch (same angle as the original — do not introduce "${serviceName}" here either).
- ${AI_MARKETING_CROSS_SELL_PROMPT}
- End with a low-friction call to action.
- Professional, warm, concise — no more than ~100 words in the body.
- Do not invent any facts about the prospect beyond what's given above.

Respond with ONLY valid JSON, no markdown fences, no preamble, exactly this structure:
{"subject":"...","body":"..."}` : `You are a business development rep for AUK Marine & Mining, a South African maritime & mining services company (auk-maritime.com), writing a brief follow-up to a cold email sent 5 days ago about the service "${serviceName}".

Prospect company: ${companyName}
Prospect contact: ${contactName || "(no named contact — address the company generally)"}
Why this prospect was originally flagged as a fit: ${rationale || "(not specified)"}
Concrete capabilities within this service: ${segments && segments.length ? segments.join(" · ") : "(none listed — name the service itself concretely)"}
Original email subject: ${originalSubject}
Original email body: ${originalBody}

Write a short, polite follow-up (do not assume they ignored the first email on purpose — they may simply be busy). Requirements:
- Reference the original email briefly without repeating it in full — add ONE new angle or detail, don't just resend the same pitch.
- ${AI_MARKETING_CROSS_SELL_PROMPT}
- End with a low-friction call to action.
- Professional, warm, concise — no more than ~100 words in the body overall, INCLUDING the cross-sell paragraph above.
- Do not invent any facts about the prospect beyond what's given above.

Respond with ONLY valid JSON, no markdown fences, no preamble, exactly this structure:
{"subject":"...","body":"..."}`;

  const { status, data } = await callClaude([{ role: 'user', content: prompt }], { max_tokens: 500 });
  if (status !== 200 || data.type === 'error') {
    throw new Error(`Anthropic API error: ${data?.error?.message || `HTTP ${status}`}`);
  }
  const text = (data.content || []).map((i) => (i.type === 'text' ? i.text : '')).join('').replace(/```json|```/g, '').trim();
  const jsonStart = text.indexOf('{');
  if (jsonStart === -1) throw new Error(`No JSON found in Anthropic response: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(jsonStart));
  if (!parsed.subject || !parsed.body) throw new Error('Incomplete follow-up draft');
  return parsed;
}

export default async function handler(req, res) {
  // Vercel automatically attaches this header on scheduled invocations when CRON_SECRET
  // is set — reject anything else so this publicly-reachable URL can't be triggered by
  // an outsider to burn API/Resend quota or spam the review queue.
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const eligible = await sql`
      select e.id as email_id, e.subject as original_subject, e.body as original_body,
             p.id as prospect_id, p.tenant_id, p.company_name, p.contact_name, p.rationale, p.is_peer,
             r.service_name
      from outreach_emails e
      join prospects p on p.id = e.prospect_id
      join prospect_runs r on r.id = p.run_id
      where e.sent_at is not null
        and e.sent_at <= now() - (${FOLLOW_UP_DAYS} || ' days')::interval
        and not exists (select 1 from outreach_emails f where f.follow_up_of = e.id)
    `;

    const svcsCache = new Map();
    const results = [];

    for (const row of eligible) {
      try {
        if (!svcsCache.has(row.tenant_id)) {
          const [tdata] = await sql`select data from tenant_data where tenant_id = ${row.tenant_id}`;
          svcsCache.set(row.tenant_id, tdata?.data?.svcs || []);
        }
        const svc = svcsCache.get(row.tenant_id).find((s) => s.name === row.service_name);
        const segments = svc?.mkt?.segments || [];

        const drafted = await draftFollowUp({
          companyName: row.company_name,
          contactName: row.contact_name,
          serviceName: row.service_name,
          isPeer: row.is_peer,
          rationale: row.rationale,
          segments,
          originalSubject: row.original_subject,
          originalBody: row.original_body,
        });

        await sql`
          insert into outreach_emails (prospect_id, tenant_id, subject, body, follow_up_of)
          values (${row.prospect_id}, ${row.tenant_id}, ${drafted.subject}, ${drafted.body}, ${row.email_id})
        `;
        await sql`
          insert into tenant_usage (tenant_id, month, ai_drafts)
          values (${row.tenant_id}, date_trunc('month', now())::date, 1)
          on conflict (tenant_id, month) do update set ai_drafts = tenant_usage.ai_drafts + 1
        `;
        results.push({ emailId: row.email_id, ok: true });
      } catch (err) {
        results.push({ emailId: row.email_id, ok: false, error: err.message });
      }
    }

    return res.status(200).json({
      checked: eligible.length,
      drafted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Cron follow-up failed', detail: err.message });
  }
}
