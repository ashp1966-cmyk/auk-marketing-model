// Tech Trend: shared reports. PLATFORM-AUTHORED, TENANT-VISIBLE: not tenant-scoped. GET returns the same
// reports to every authenticated tenant; POST/PUT/DELETE are restricted to the internal tenant
// (plan_code = 'internal'), checked BEFORE any validation or lookup so a non-AUK caller learns nothing
// about what exists. RLS enforces the same rule as a backstop. No AI call, no trial gating.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';
import { isInternal } from './_lib/internal.js';

const LIMITS = { title: 200, topic: 100, body: 20000, sources: 20, sourceName: 200, sourceUrl: 2000 };
const LIST_LIMIT = 100;   // NB: 100 reports of 20,000 multi-byte characters could exceed Vercel's ~4.5 MB response limit; revisit if AUK publishes many long reports.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = 'id, title, topic, body, sources, as_of::text as as_of, published_by, published_at, updated_by, updated_at';

// Postgres text and jsonb both reject NUL bytes, and jsonb (and UTF-8 encoding) reject lone UTF-16 surrogates, so
// both are stripped from EVERY client string we store (title, topic, body, source names and urls). A valid
// surrogate pair (an emoji) is left alone: a high surrogate must be followed by a low one, and a low one preceded
// by a high one. No `u` flag, so the pattern works on UTF-16 code units.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const clean = (v) => (typeof v === 'string' ? v.replace(/\u0000/g, '').replace(LONE_SURROGATE, '').trim() : null);
const bad = (message) => ({ ok: false, message });

function validReportDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;   // a real calendar date
  return d.getTime() <= Date.now() + 24 * 60 * 60 * 1000;                             // not in the future (1 day of timezone slack)
}

function validSourceUrl(u) {
  if (!/^https?:\/\//i.test(u)) return false;          // http(s) only: no javascript:, data:, file: ...
  try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; }
}

// Returns { ok: true, value } with every field rebuilt from validated input (nothing passes through as-is).
function validateReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('Request body must be a JSON object');
  const title = clean(input.title);
  if (!title) return bad(`Title is required (up to ${LIMITS.title} characters)`);
  if (title.length > LIMITS.title) return bad(`Title is too long (up to ${LIMITS.title} characters)`);

  const topic = input.topic == null ? '' : clean(input.topic);
  if (topic === null) return bad('Topic must be text');
  if (topic.length > LIMITS.topic) return bad(`Topic is too long (up to ${LIMITS.topic} characters)`);

  const body = clean(input.body);
  if (!body) return bad('The report text is required');
  if (body.length > LIMITS.body) return bad(`The report text is too long (up to ${LIMITS.body.toLocaleString('en-US')} characters)`);

  if (!validReportDate(input.as_of)) return bad('"As of" must be a real date (YYYY-MM-DD), not in the future');

  const raw = input.sources == null ? [] : input.sources;
  if (!Array.isArray(raw)) return bad('Sources must be a list');
  if (raw.length > LIMITS.sources) return bad(`At most ${LIMITS.sources} sources`);
  const sources = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return bad('Each source needs a name');
    const name = clean(s.name);
    if (!name || name.length > LIMITS.sourceName) return bad(`Each source needs a name (up to ${LIMITS.sourceName} characters)`);
    const entry = { name };
    if (s.url != null && clean(s.url) !== '') {
      const url = clean(s.url);
      if (url === null || url.length > LIMITS.sourceUrl || !validSourceUrl(url)) return bad('Source links must start with http:// or https://');
      entry.url = url;
    }
    sources.push(entry);
  }
  return { ok: true, value: { title, topic, body, as_of: input.as_of, sources } };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = await resolveOrgId(req);
  if (!auth) {
    return res.status(401).json({ error: 'Missing or invalid session, or no active organization' });
  }
  const { orgId, userId } = auth;

  try {
    if (req.method === 'GET') {
      const result = await withTenant(orgId, async (client) => {
        const { rows } = await client.query(
          `select ${COLUMNS} from tech_trend_reports order by as_of desc, published_at desc limit ${LIST_LIMIT}`
        );
        return { reports: rows, canManage: await isInternal(client, orgId) };
      });
      return res.status(200).json(result);
    }

    // POST / PUT / DELETE: internal tenant only, checked before anything else (including the id and the body).
    const allowed = await withTenant(orgId, (client) => isInternal(client, orgId));
    if (!allowed) {
      return res.status(403).json({ error: 'Only the platform owner can manage this content' });
    }

    if (req.method === 'POST') {
      const v = validateReport(req.body);
      if (!v.ok) return res.status(400).json({ error: 'invalid_report', message: v.message });
      const { rows: [report] } = await withTenant(orgId, (client) =>
        client.query(
          `insert into tech_trend_reports (title, topic, body, sources, as_of, published_by)
           values ($1, $2, $3, $4::jsonb, $5::date, $6) returning ${COLUMNS}`,
          [v.value.title, v.value.topic, v.value.body, JSON.stringify(v.value.sources), v.value.as_of, userId || null]
        )
      );
      return res.status(200).json({ report });
    }

    // PUT and DELETE address a report by ?id=<uuid>. A malformed id is a 400, not a Postgres error.
    const id = req.query?.id;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return res.status(400).json({ error: 'invalid_report', message: 'Invalid report id' });
    }

    if (req.method === 'DELETE') {
      const { rowCount } = await withTenant(orgId, (client) =>
        client.query('delete from tech_trend_reports where id = $1', [id])
      );
      if (!rowCount) return res.status(404).json({ error: 'Report not found' });
      return res.status(200).json({ deleted: true });
    }

    // PUT: replaces the editable fields; published_by / published_at stay as first published, and the editor is
    // recorded in updated_by (from the caller's session, never from the body) with updated_at = now().
    const v = validateReport(req.body);
    if (!v.ok) return res.status(400).json({ error: 'invalid_report', message: v.message });
    const { rows: [report] } = await withTenant(orgId, (client) =>
      client.query(
        `update tech_trend_reports
            set title = $2, topic = $3, body = $4, sources = $5::jsonb, as_of = $6::date, updated_by = $7, updated_at = now()
          where id = $1 returning ${COLUMNS}`,
        [id, v.value.title, v.value.topic, v.value.body, JSON.stringify(v.value.sources), v.value.as_of, userId || null]
      )
    );
    if (!report) return res.status(404).json({ error: 'Report not found' });
    return res.status(200).json({ report });
  } catch {
    // No error text goes back to the caller: this route is readable by every tenant.
    return res.status(500).json({ error: 'Database operation failed' });
  }
}
