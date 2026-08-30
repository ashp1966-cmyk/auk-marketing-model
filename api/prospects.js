// Vercel serverless function — tenant-scoped prospecting runs, backed by Neon.
// GET returns saved runs (with their prospects) for the caller's organization.
// POST persists a freshly-generated research run (candidates come from the
// client, which already ran the web-search AI call via /api/generate) — this
// function only writes what it's given, it doesn't call Anthropic itself.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';
import { checkTrialGate } from './_lib/trial-gate.js';

const MANUAL_UPLOAD_MAX_ROWS = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
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
            `select id, run_id, company_name, contact_name, contact_email, website, service_name, rationale, hubspot_id, verified, status, is_peer, created_at
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

    if (req.method === 'PATCH') {
      const { id, serviceName: newServiceName } = req.body || {};
      if (!id || !newServiceName) {
        return res.status(400).json({ error: 'Missing id or serviceName' });
      }
      const { rows: [row] } = await withTenant(orgId, (client) =>
        client.query(
          `update prospects set service_name = $1 where id = $2 and tenant_id = $3
           returning id, run_id, company_name, contact_name, contact_email, website, service_name, rationale, hubspot_id, verified, status, is_peer, created_at`,
          [newServiceName, id, orgId]
        )
      );
      if (!row) return res.status(404).json({ error: 'Prospect not found' });
      return res.status(200).json({ prospect: row });
    }

    // POST
    const { serviceName, criteria, candidates, source } = req.body || {};
    const isManualUpload = source === 'manual_upload';
    // serviceName is required for AI research (the whole prompt is built around one
    // service) but optional for uploads — an uploaded batch can defer the choice to
    // draft time, per-contact, since nothing about the upload itself depends on it.
    if ((!isManualUpload && !serviceName) || !Array.isArray(candidates)) {
      return res.status(400).json({ error: 'Missing serviceName or candidates' });
    }
    if (isManualUpload && candidates.length > MANUAL_UPLOAD_MAX_ROWS) {
      return res.status(400).json({ error: `A single upload can't exceed ${MANUAL_UPLOAD_MAX_ROWS} rows` });
    }

    const result = await withTenant(orgId, async (client) => {
      // Manual uploads have zero AI cost, so they're exempt from the trial's research-run
      // cap entirely — that cap exists to protect AI spend, which doesn't apply here.
      if (!isManualUpload) {
        // Defense-in-depth against a client that already generated the AI response before
        // getting blocked, or that skips /api/generate's own gate entirely — the real spend
        // prevention is /api/generate's checkTrialGate call, this one just stops the save.
        const gate = await checkTrialGate(client, orgId, 'research_runs');
        if (gate.blocked) return gate;
      }

      const { rows: [run] } = await client.query(
        `insert into prospect_runs (tenant_id, service_name, criteria, status)
         values ($1, $2, $3::jsonb, 'running')
         returning id, service_name, criteria, status, created_at`,
        [orgId, serviceName || null, JSON.stringify(criteria || {})]
      );

      const inserted = [];
      for (const c of candidates) {
        let verified, is_peer, rationale;
        const company_name = (c.company_name || '').trim();
        const contact_email = (c.contact_email || '').trim();
        if (isManualUpload) {
          // Never trust client-submitted rows blindly — this endpoint accepts arbitrary
          // client data here, not an AI-generated response. Re-validate the same rules
          // the upload UI already applied, and drop anything that fails rather than
          // trusting the client filtered correctly. Peer-detection and rationale are
          // fixed server-side, not client-asserted — the person who compiled their own
          // list has already made that judgment, there's no AI rationale to store.
          if (!company_name || !EMAIL_RE.test(contact_email)) continue;
          verified = true;
          is_peer = false;
          rationale = 'Manually uploaded';
        } else {
          // Never trust a client-asserted "verified" flag on its own — a candidate
          // with no contact email can't be considered verified regardless of what
          // the AI response said.
          verified = !!c.verified && !!contact_email;
          is_peer = !!c.is_peer;
          rationale = c.rationale || null;
        }
        const { rows: [row] } = await client.query(
          `insert into prospects (run_id, tenant_id, company_name, contact_name, contact_email, website, rationale, verified, status, is_peer)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9)
           returning id, run_id, company_name, contact_name, contact_email, website, service_name, rationale, hubspot_id, verified, status, is_peer, created_at`,
          [run.id, orgId, company_name, c.contact_name || null, contact_email || null, c.website || null, rationale, verified, is_peer]
        );
        inserted.push(row);
      }

      const { rows: [updatedRun] } = await client.query(
        `update prospect_runs set status = 'done' where id = $1
         returning id, service_name, criteria, status, created_at`,
        [run.id]
      );
      if (!isManualUpload) {
        await client.query(
          `insert into tenant_usage (tenant_id, month, research_runs)
           values ($1, date_trunc('month', now())::date, 1)
           on conflict (tenant_id, month) do update set research_runs = tenant_usage.research_runs + 1`,
          [orgId]
        );
      }

      return { ...updatedRun, prospects: inserted };
    });

    if (result.blocked) return res.status(result.status).json(result.body);
    return res.status(200).json({ run: result });
  } catch (err) {
    return res.status(500).json({ error: 'Database operation failed', detail: err.message });
  }
}
