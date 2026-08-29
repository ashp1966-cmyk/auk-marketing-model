// Vercel serverless function — tenant-scoped outreach email drafts + review queue.
// GET returns saved drafts (joined with their prospect) for the caller's organization.
// POST persists a freshly-drafted email (the client already generated subject/body via
// /api/generate, same proxy pattern as the Campaign & AI tab) — this function only writes
// what it's given, it doesn't call Anthropic itself.
// PATCH approves a draft (sets approved_by to the caller). This is the ONLY mutation this
// checkpoint supports — there is no send path here. Sending is a later checkpoint, gated on
// approved_by being set by a human click.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';

// Same local-only flag as api/_lib/anthropic-client.js and api/send-outreach.js. Checked
// directly here (not passed by the client) because if the server itself is in dry-run mode,
// the subject/body the client is posting came from /api/generate's canned placeholder
// content regardless of what the client thinks — tag it so it can't be mistaken for a real
// draft in the review queue.
const DRAFT_DRY_RUN = process.env.DRAFT_DRY_RUN === 'true';

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
      const drafts = await withTenant(orgId, async (client) => {
        const { rows } = await client.query(
          `select e.id, e.prospect_id, e.subject, e.body, e.approved_by, e.sent_at, e.follow_up_of, e.dry_run, e.created_at,
                  p.company_name, p.contact_name, p.contact_email, p.status as prospect_status
           from outreach_emails e
           join prospects p on p.id = e.prospect_id
           where e.tenant_id = $1
           order by e.created_at desc
           limit 100`,
          [orgId]
        );
        return rows;
      });
      return res.status(200).json({ drafts });
    }

    if (req.method === 'POST') {
      const { prospectId, subject, body, followUpOf } = req.body || {};
      if (!prospectId || !subject || !body) {
        return res.status(400).json({ error: 'Missing prospectId, subject or body' });
      }

      const result = await withTenant(orgId, async (client) => {
        // Confirm the prospect actually belongs to this tenant before attaching a draft to it.
        const { rows: [prospect] } = await client.query(
          'select id, contact_email from prospects where id = $1 and tenant_id = $2',
          [prospectId, orgId]
        );
        if (!prospect) return { status: 404, body: { error: 'Prospect not found' } };
        if (!prospect.contact_email) {
          return { status: 400, body: { error: 'Prospect has no contact email — cannot draft outreach' } };
        }

        const { rows: [row] } = await client.query(
          `insert into outreach_emails (prospect_id, tenant_id, subject, body, follow_up_of, dry_run)
           values ($1, $2, $3, $4, $5, $6)
           returning id, prospect_id, subject, body, approved_by, sent_at, follow_up_of, dry_run, created_at`,
          [prospectId, orgId, subject, body, followUpOf || null, DRAFT_DRY_RUN]
        );
        if (!DRAFT_DRY_RUN) {
          await client.query(
            `insert into tenant_usage (tenant_id, month, outreach_drafts)
             values ($1, date_trunc('month', now())::date, 1)
             on conflict (tenant_id, month) do update set outreach_drafts = tenant_usage.outreach_drafts + 1`,
            [orgId]
          );
        }
        return { status: 200, body: { draft: row } };
      });

      return res.status(result.status).json(result.body);
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

    const result = await withTenant(orgId, async (client) => {
      const { rows: [existing] } = await client.query(
        'select id, sent_at from outreach_emails where id = $1 and tenant_id = $2',
        [id, orgId]
      );
      if (!existing) return { status: 404, body: { error: 'Draft not found' } };
      if (existing.sent_at) return { status: 400, body: { error: 'Already sent' } };

      const { rows: [row] } = await client.query(
        `update outreach_emails set approved_by = $1 where id = $2
         returning id, prospect_id, subject, body, approved_by, sent_at, follow_up_of, dry_run, created_at`,
        [userId, id]
      );
      return { status: 200, body: { draft: row } };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    return res.status(500).json({ error: 'Database operation failed', detail: err.message });
  }
}
