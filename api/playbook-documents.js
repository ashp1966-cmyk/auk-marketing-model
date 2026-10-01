// Vercel serverless function — Playbook documents ("Updated marketing information"), backed by Neon.
// PLATFORM-AUTHORED, TENANT-VISIBLE: not tenant-scoped. GET returns the same documents to every
// authenticated tenant; POST/DELETE are restricted to the internal tenant (plan_code = 'internal',
// the same marker api/admin/usage.js uses). The app-level check returns a clean 403; RLS on
// playbook_documents enforces the same rule as a backstop. Text extraction happens in the browser;
// this function only stores what it's given. No AI calls, no trial gating.
import { resolveOrgId } from './_lib/auth.js';
import { withTenant } from './_lib/db.js';

const ALLOWED_CATEGORIES = ['updated_marketing_info'];
const ALLOWED_MIME = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
];
const MAX_CONTENT_CHARS = 100000;
const MAX_FILENAME_CHARS = 255;
const COLUMNS = 'category, filename, mime_type, content, char_count, truncated, uploaded_by, uploaded_at';

// `client` must already be inside withTenant(orgId, ...) — RLS scopes this to the caller's own row.
async function isInternal(client, orgId) {
  const { rows } = await client.query('select plan_code from tenants where id = $1', [orgId]);
  return rows[0]?.plan_code === 'internal';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
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
        const { rows } = await client.query(`select ${COLUMNS} from playbook_documents order by category`);
        return { documents: rows, canManage: await isInternal(client, orgId) };
      });
      return res.status(200).json(result);
    }

    // POST / DELETE: only the internal tenant, checked before anything else is validated.
    const allowed = await withTenant(orgId, (client) => isInternal(client, orgId));
    if (!allowed) {
      return res.status(403).json({ error: 'Only the platform owner can manage this content' });
    }

    if (req.method === 'DELETE') {
      const category = req.query?.category;
      if (!ALLOWED_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Unknown category' });
      }
      const { rowCount } = await withTenant(orgId, (client) =>
        client.query('delete from playbook_documents where category = $1', [category])
      );
      if (!rowCount) return res.status(404).json({ error: 'Document not found' });
      return res.status(200).json({ deleted: true });
    }

    // POST — never trust client-computed metadata. char_count and truncated are derived here from
    // the content actually received, and the cap is enforced here regardless of what the browser did.
    const { category, filename, mimeType, content, truncated: clientTruncated } = req.body || {};
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Unknown category' });
    }
    if (!ALLOWED_MIME.includes(mimeType)) {
      return res.status(400).json({ error: 'Only Word (.docx) and PDF documents are supported' });
    }
    const cleanName = typeof filename === 'string' ? filename.trim().slice(0, MAX_FILENAME_CHARS) : '';
    if (!cleanName) {
      return res.status(400).json({ error: 'Missing filename' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing content' });
    }
    // Postgres text columns reject NUL bytes outright, and PDF extraction can produce them.
    const text = content.replace(/\u0000/g, '').trim();
    if (!text) {
      return res.status(400).json({
        error: 'No readable text found in this document (a scanned/image-only PDF has none to extract)',
      });
    }
    const wasTruncated = text.length > MAX_CONTENT_CHARS;
    const stored = wasTruncated ? text.slice(0, MAX_CONTENT_CHARS) : text;

    const { rows: [doc] } = await withTenant(orgId, (client) =>
      client.query(
        `insert into playbook_documents
           (category, filename, mime_type, content, char_count, truncated, uploaded_by, uploaded_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())
         on conflict (category) do update set
           filename = excluded.filename, mime_type = excluded.mime_type, content = excluded.content,
           char_count = excluded.char_count, truncated = excluded.truncated,
           uploaded_by = excluded.uploaded_by, uploaded_at = excluded.uploaded_at
         returning ${COLUMNS}`,
        [category, cleanName, mimeType, stored, stored.length, wasTruncated || clientTruncated === true, userId || null]
      )
    );
    return res.status(200).json({ document: doc });
  } catch (err) {
    return res.status(500).json({ error: 'Database operation failed', detail: err.message });
  }
}
