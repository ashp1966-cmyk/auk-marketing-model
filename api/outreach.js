// Vercel serverless function — tenant-scoped outreach email drafts + review queue.
// GET returns saved drafts (joined with their prospect) for the caller's organization.
// POST persists a freshly-drafted email (the client already generated subject/body via
// /api/generate, same proxy pattern as the Campaign & AI tab) — this function only writes
// what it's given, it doesn't call Anthropic itself.
// PATCH approves a draft (sets approved_by to the caller). This is the ONLY mutation this
// checkpoint supports — there is no send path here. Sending is a later checkpoint, gated on
// approved_by being set by a human click.
import { neon } from '@neondatabase/serverless';
import { resolveOrgId } from './_lib/auth.js';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId, userId } = auth;

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        select e.id, e.prospect_id, e.subject, e.body, e.approved_by, e.sent_at, e.follow_up_of, e.created_at,
               p.company_name, p.contact_name, p.contact_email, p.status as prospect_status
        from outreach_emails e
        join prospects p on p.id = e.prospect_id
        where e.tenant_id = ${orgId}
        order by e.created_at desc
        limit 100
      `;
      return res.status(200).json({ drafts: rows });
    }

    if (req.method === 'POST') {
      const { prospectId, subject, body, followUpOf } = req.body || {};
      if (!prospectId || !subject || !body) {
        return res.status(400).json({ error: 'Missing prospectId, subject or body' });
      }

      // Confirm the prospect actually belongs to this tenant before attaching a draft to it.
      const [prospect] = await sql`
        select id, contact_email from prospects where id = ${prospectId} and tenant_id = ${orgId}
      `;
      if (!prospect) {
        return res.status(404).json({ error: 'Prospect not found' });
      }
      if (!prospect.contact_email) {
        return res.status(400).json({ error: 'Prospect has no contact email — cannot draft outreach' });
      }

      const [row] = await sql`
        insert into outreach_emails (prospect_id, tenant_id, subject, body, follow_up_of)
        values (${prospectId}, ${orgId}, ${subject}, ${body}, ${followUpOf || null})
        returning id, prospect_id, subject, body, approved_by, sent_at, follow_up_of, created_at
      `;
      await sql`
        insert into tenant_usage (tenant_id, month, ai_drafts)
        values (${orgId}, date_trunc('month', now())::date, 1)
        on conflict (tenant_id, month) do update set ai_drafts = tenant_usage.ai_drafts + 1
      `;
      return res.status(200).json({ draft: row });
    }

    // PATCH — approve a draft. This never sends anything; it only records human approval
    // so a later checkpoint's send step has something to gate on.
    const { id, action } = req.body || {};
    if (action !== 'approve') {
      return res.status(400).json({ error: 'Unsupported action' });
    }
    if (!id) {
      return res.status(400).json({ error: 'Missing id' });
    }

    const [existing] = await sql`
      select id, sent_at from outreach_emails where id = ${id} and tenant_id = ${orgId}
    `;
    if (!existing) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    if (existing.sent_at) {
      return res.status(400).json({ error: 'Already sent' });
    }

    const [row] = await sql`
      update outreach_emails set approved_by = ${userId} where id = ${id}
      returning id, prospect_id, subject, body, approved_by, sent_at, follow_up_of, created_at
    `;
    return res.status(200).json({ draft: row });
  } catch (err) {
    return res.status(500).json({ error: 'Database operation failed', detail: err.message });
  }
}
