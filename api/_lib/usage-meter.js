// Atomic metering of AI use (Phase 1b of CLAUDE-CODE-BRIEF-plan-limits.md). Called from api/generate.js.
import { CAPS } from './trial-gate.js';

// The feature id IS the tenant_usage column, and is interpolated into SQL: only a real, own key of CAPS is allowed.
function column(feature) {
  if (typeof feature !== 'string' || !Object.hasOwn(CAPS, feature)) throw new Error('Unknown metered feature');
  return feature;
}

// 'total' = summed across ALL months (the trial); 'month' = the current calendar month only (paid plans, UTC).
const WINDOWS = ['total', 'month'];

// `client` must be inside withTenant(...) and already hold the tenant's advisory lock. ONE statement: counts one use
// into the current month's row, but only while the tenant's use for this feature in `window` is below `limit`
// (null = no limit). Returns the month it counted into ('YYYY-MM-DD'), or null when at the limit.
export async function reserveUnit(client, orgId, feature, limit, window = 'total') {
  const c = column(feature);
  if (typeof window !== 'string' || !WINDOWS.includes(window)) throw new Error('Unknown usage window');   // before any query
  const { rows: [row] } = await client.query(
    `insert into tenant_usage (tenant_id, month, ${c})
     select $1, date_trunc('month', now())::date, 1
      where $2::int is null or (select coalesce(sum(${c}), 0) from tenant_usage
              where tenant_id = $1 and ($3::text = 'total' or month = date_trunc('month', now())::date)) < $2::int
     on conflict (tenant_id, month) do update set ${c} = tenant_usage.${c} + 1
     returning month::text as month`,
    [orgId, limit, window]
  );
  return row ? row.month : null;
}

// Gives back one use in the SAME month row it was taken from (the call may have straddled a month change). Never below 0.
export async function refundUnit(client, orgId, feature, month) {
  const c = column(feature);
  await client.query(`update tenant_usage set ${c} = greatest(${c} - 1, 0) where tenant_id = $1 and month = $2::date`, [orgId, month]);
}
