// Vercel serverless function — syncs tenant-scoped prospects (status = 'new')
// into HubSpot as Company + Contact records, find-or-create on both, then marks
// each prospect 'queued' with the HubSpot record id it now maps to.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';

const HUBSPOT_API = 'https://api.hubapi.com';
// Safety cap per call — avoids one request firing an unbounded burst of HubSpot
// API calls if a large backlog of 'new' prospects has built up.
const MAX_PER_SYNC = 25;

async function hubspotFetch(path, options = {}) {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function searchOne(objectType, propertyName, value) {
  const { ok, data } = await hubspotFetch(`/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
      properties: [propertyName],
      limit: 1,
    }),
  });
  if (ok && data.results && data.results.length) return data.results[0].id;
  return null;
}

async function findOrCreateCompany(companyName, domain) {
  const existing = domain
    ? await searchOne('companies', 'domain', domain)
    : await searchOne('companies', 'name', companyName);
  if (existing) return existing;

  const properties = { name: companyName };
  if (domain) properties.domain = domain;
  const { ok, data } = await hubspotFetch('/crm/v3/objects/companies', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });
  if (!ok) throw new Error(data?.message || 'Failed to create HubSpot company');
  return data.id;
}

async function findOrCreateContact(email, contactName, companyName) {
  const existing = await searchOne('contacts', 'email', email);
  if (existing) return existing;

  const [firstname, ...rest] = (contactName || '').trim().split(/\s+/).filter(Boolean);
  const lastname = rest.join(' ') || undefined;
  const properties = { email };
  if (firstname) properties.firstname = firstname;
  if (lastname) properties.lastname = lastname;
  if (companyName) properties.company = companyName;
  const { ok, data } = await hubspotFetch('/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });
  if (!ok) throw new Error(data?.message || 'Failed to create HubSpot contact');
  return data.id;
}

async function associateContactToCompany(contactId, companyId) {
  // Best-effort — a failed association shouldn't undo an otherwise-successful sync.
  try {
    await hubspotFetch(`/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`, {
      method: 'PUT',
    });
  } catch (err) {}
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

  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'HUBSPOT_ACCESS_TOKEN is not configured' });
  }

  try {
    const pending = await withTenant(orgId, async (client) => {
      const { rows } = await client.query(
        `select id, company_name, contact_name, contact_email
         from prospects
         where tenant_id = $1 and status = 'new'
         order by id asc
         limit $2`,
        [orgId, MAX_PER_SYNC]
      );
      return rows;
    });

    const results = [];
    for (const p of pending) {
      try {
        const domain = p.contact_email ? p.contact_email.split('@')[1] : null;
        const companyId = await findOrCreateCompany(p.company_name, domain);

        let contactId = null;
        if (p.contact_email) {
          contactId = await findOrCreateContact(p.contact_email, p.contact_name, p.company_name);
          await associateContactToCompany(contactId, companyId);
        }

        const hubspotId = contactId || companyId;
        results.push({ id: p.id, ok: true, hubspotId, companyId, contactId });
      } catch (err) {
        results.push({ id: p.id, ok: false, error: err.message });
      }
    }

    // Apply all successful updates in one short tenant-scoped transaction, after every
    // HubSpot network call has already finished — avoids holding a DB connection open
    // across the loop of external API round trips above.
    const successes = results.filter((r) => r.ok);
    if (successes.length) {
      await withTenant(orgId, async (client) => {
        for (const r of successes) {
          await client.query(`update prospects set hubspot_id = $1, status = 'queued' where id = $2`, [r.hubspotId, r.id]);
        }
      });
    }

    return res.status(200).json({
      synced: successes.length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Sync failed', detail: err.message });
  }
}
