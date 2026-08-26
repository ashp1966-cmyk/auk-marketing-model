// Vercel serverless function — tenant-scoped prospecting runs, backed by Neon.
// GET returns saved runs (with their prospects) for the caller's organization.
// POST persists a freshly-generated research run (candidates come from the
// client, which already ran the web-search AI call via /api/generate) — this
// function only writes what it's given, it doesn't call Anthropic itself.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';

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
      const result = await withTenant(orgId, async (client) => {
        const { rows: runs } = await client.query(
          `select id, service_name, criteria, status, created_at
           from prospect_runs
           where tenant_id = $1
           order by created_at desc
           limit 20`,
          [orgId]
        );
        const runIds = runs.map((r) => r.id);
        const prospectsByRun = {};
        if (runIds.length) {
          const { rows } = await client.query(
            `select id, run_id, company_name, contact_name, contact_email, rationale, hubspot_id, verified, status, is_peer, created_at
             from prospects
             where tenant_id = $1 and run_id = any($2)
             order by id asc`,
            [orgId, runIds]
          );
          for (const p of rows) {
            (prospectsByRun[p.run_id] ??= []).push(p);
          }
        }
        return runs.map((r) => ({ ...r, prospects: prospectsByRun[r.id] || [] }));
      });
      return res.status(200).json({ runs: result });
    }

    // POST
    const { serviceName, criteria, candidates } = req.body || {};
    if (!serviceName || !Array.isArray(candidates)) {
      return res.status(400).json({ error: 'Missing serviceName or candidates' });
    }

    const result = await withTenant(orgId, async (client) => {
      const { rows: [run] } = await client.query(
        `insert into prospect_runs (tenant_id, service_name, criteria, status)
         values ($1, $2, $3::jsonb, 'running')
         returning id, service_name, criteria, status, created_at`,
        [orgId, serviceName, JSON.stringify(criteria || {})]
      );

      const inserted = [];
      for (const c of candidates) {
        // Never trust a client-asserted "verified" flag on its own — a candidate
        // with no contact email can't be considered verified regardless of what
        // the AI response said.
        const verified = !!c.verified && !!c.contact_email;
        const { rows: [row] } = await client.query(
          `insert into prospects (run_id, tenant_id, company_name, contact_name, contact_email, rationale, verified, status, is_peer)
           values ($1, $2, $3, $4, $5, $6, $7, 'new', $8)
           returning id, run_id, company_name, contact_name, contact_email, rationale, hubspot_id, verified, status, is_peer, created_at`,
          [run.id, orgId, c.company_name || '', c.contact_name || null, c.contact_email || null, c.rationale || null, verified, !!c.is_peer]
        );
        inserted.push(row);
      }

      const { rows: [updatedRun] } = await client.query(
        `update prospect_runs set status = 'done' where id = $1
         returning id, service_name, criteria, status, created_at`,
        [run.id]
      );
      await client.query(
        `insert into tenant_usage (tenant_id, month, research_runs)
         values ($1, date_trunc('month', now())::date, 1)
         on conflict (tenant_id, month) do update set research_runs = tenant_usage.research_runs + 1`,
        [orgId]
      );

      return { ...updatedRun, prospects: inserted };
    });

    return res.status(200).json({ run: result });
  } catch (err) {
    return res.status(500).json({ error: 'Database operation failed', detail: err.message });
  }
}
