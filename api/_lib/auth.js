// Shared Clerk session-token verification for tenant-scoped serverless functions.
// Not itself an API route — files/folders under api/ prefixed with "_" are skipped by Vercel.
import { verifyToken } from '@clerk/backend';

export async function resolveOrgId(req) {
  const authHeader = req.headers.authorization || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  // sendBeacon can't set custom headers, so callers that flush on page unload carry the
  // token in the JSON body instead — accept either source.
  const bodyToken = req.body && typeof req.body === 'object' ? req.body.token : null;
  const token = headerToken || bodyToken;
  if (!token) return null;

  try {
    // A modest clock-skew tolerance absorbs latency between the browser fetching a
    // short-lived (~60s) session token and this function verifying it, without which
    // any request delay near the token's expiry boundary surfaces as a false 401.
    const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY, clockSkewInMs: 10000 });
    // This Clerk instance issues v2 session tokens, which carry org info as a
    // compact `o: {id, rol, slg}` claim rather than a flat org_id field.
    const orgId = claims.org_id || claims.o?.id || null;
    if (!orgId) {
      // A valid token with no active organization: say so, so this 401 can be told apart from an
      // expired or invalid token in the log.
      console.error('[auth] token has no organization claim');
      return null;
    }
    return { orgId, userId: claims.sub };
  } catch (err) {
    // Say WHY verification failed (Clerk's reason code, e.g. token-expired) so a 401 is diagnosable from
    // the log. Only the reason code / error name is logged: never the token, secret key or header values.
    console.error('[auth] token verification failed:', err?.reason || err?.name || 'unknown');
    return null;
  }
}
