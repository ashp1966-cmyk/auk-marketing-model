// Is the caller's own tenant the internal (AUK) tenant? Same rule as isInternal in api/playbook-documents.js (that file is
// deliberately left untouched), extracted here so newer endpoints share one copy.
// `client` must already be inside withTenant(orgId, ...): RLS scopes this lookup to the caller's own tenants row.
export async function isInternal(client, orgId) {
  const { rows } = await client.query('select plan_code from tenants where id = $1', [orgId]);
  return rows[0]?.plan_code === 'internal';
}
