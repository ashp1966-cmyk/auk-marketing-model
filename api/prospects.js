// Vercel serverless function — tenant-scoped prospecting runs, backed by Neon.
// GET returns saved runs (with their prospects) for the caller's organization.
// POST persists a freshly-generated research run (candidates come from the
// client, which already ran the web-search AI call via /api/generate) — this
// function only writes what it's given, it doesn't call Anthropic itself.
import { neon } from '@neondatabase/serverless';
import { resolveOrgId } from './_lib/auth.js';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId } = auth;

  try {
    if (req.method === 'GET') {
      const runs = await sql`
        select id, service_name, criteria, status, created_at
        from prospect_runs
        where tenant_id = ${orgId}
        order by created_at desc
        limit 20
      `;
      const runIds = runs.map((r) => r.id);
      const prospectsByRun = {};
      if (runIds.length) {
        const rows = await sql`
          select id, run_id, company_name, contact_name, contact_email, rationale, hubspot_id, verified, status, is_peer, created_at
          from prospects
          where tenant_id = ${orgId} and run_id = any(${runIds})
          order by id asc
        `;
        for (const p of rows) {
          (prospectsByRun[p.run_id] ??= []).push(p);
        }
      }
      const result = runs.map((r) => ({ ...r, prospects: prospectsByRun[r.id] || [] }));
      return res.status(200).json({ runs: result });
    }

    // POST
    const { serviceName, criteria, candidates } = req.body || {};
    if (!serviceName || !Array.isArray(candidates)) {
      return res.status(400).json({ error: 'Missing serviceName or candidates' });
    }

    const [run] = await sql`
      insert into prospect_runs (tenant_id, service_name, criteria, status)
      values (${orgId}, ${serviceName}, ${JSON.stringify(criteria || {})}::jsonb, 'running')
      returning id, service_name, criteria, status, created_at
    `;

    const inserted = [];
    for (const c of candidates) {
      // Never trust a client-asserted "verified" flag on its own — a candidate
      // with no contact email can't be considered verified regardless of what
      // the AI response said.
      const verified = !!c.verified && !!c.contact_email;
      const [row] = await sql`
        insert into prospects (run_id, tenant_id, company_name, contact_name, contact_email, rationale, verified, status, is_peer)
        values (${run.id}, ${orgId}, ${c.company_name || ''}, ${c.contact_name || null}, ${c.contact_email || null}, ${c.rationale || null}, ${verified}, 'new', ${!!c.is_peer})
        returning id, run_id, company_name, contact_name, contact_email, rationale, hubspot_id, verified, status, is_peer, created_at
      `;
      inserted.push(row);
    }

    const [updatedRun] = await sql`
      update prospect_runs set status = 'done' where id = ${run.id}
      returning id, service_name, criteria, status, created_at
    `;

    return res.status(200).json({ run: { ...updatedRun, prospects: inserted } });
  } catch (err) {
    return res.status(500).json({ error: 'Database operation failed', detail: err.message });
  }
}
