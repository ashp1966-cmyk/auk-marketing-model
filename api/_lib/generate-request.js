// Request shaping for /api/generate (Phase 1a of CLAUDE-CODE-BRIEF-plan-limits.md).
// The browser chooses `feature` and sends the whole Anthropic request, so nothing in the request
// can be trusted to describe the cost of the call. This rebuilds the request from an allowlist of
// exactly the fields the five call sites in src/App.jsx send; anything outside it is rejected
// (the caller turns { ok: false } into a 400). Pure function: no DB, no network.
export const MODEL = 'claude-sonnet-4-6';
export const WEB_SEARCH_MAX_USES = 5;
const WEB_SEARCH_TYPE = 'web_search_20250305';

// max_tokens ceilings are the highest value any call site sends today (campaign quick post 1000 /
// strategic 1200, outreach 700, research and Trend Radar 3000).
// maxPromptChars bounds the INPUT side. Unit: characters (JS string length) of the single user message.
// Inclusive: exactly at the ceiling is accepted, one over is rejected. Each is ~3x the largest prompt the
// five call sites produce with very long inputs (measured from src/App.jsx; see the brief). `hint` is the
// customer-facing pointer to which inputs make this feature's prompt long.
export const FEATURE_RULES = {
  campaign_drafts: {
    maxTokens: 1200, maxPromptChars: 7500, webSearch: false,
    hint: 'for example the service name, audience, geography or segments',
  },
  outreach_drafts: {
    maxTokens: 700, maxPromptChars: 9000, webSearch: false,
    hint: "for example the prospect's company name, contact name or rationale",
  },
  research_runs: {
    maxTokens: 3000, maxPromptChars: 7500, webSearch: true,
    hint: 'for example the service name, audience, geography or segments',
  },
  trend_radar_scans: {
    maxTokens: 3000, maxPromptChars: 10500, webSearch: true,
    hint: 'for example the number or length of your service names',
  },
};

const ALLOWED_KEYS = new Set(['feature', 'model', 'max_tokens', 'messages', 'tools']);
const ALLOWED_TOOL_KEYS = new Set(['type', 'name', 'max_uses']);
const fail = (message, code = 'invalid_request') => ({ ok: false, message, code });
// Customer-readable: no field names or limits, just what to shorten and where to get help.
const tooLongMessage = (hint) =>
  `This request is too long to process. Please shorten the text you've entered (${hint}) and try again, or email sales@auk-maritime.com if it keeps happening.`;

export function shapeGenerateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Request body must be a JSON object');
  // typeof first: Object.hasOwn coerces its key, so ["research_runs"] would otherwise pass as a feature.
  if (typeof body.feature !== 'string' || !Object.hasOwn(FEATURE_RULES, body.feature)) return fail('Unrecognized feature');
  const rules = FEATURE_RULES[body.feature];

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) return fail('Request contains a field that is not allowed');
  }
  if (body.model !== undefined && body.model !== MODEL) return fail('Unsupported model');

  const mt = body.max_tokens;
  if (!Number.isInteger(mt) || mt < 1 || mt > rules.maxTokens) {
    return fail(`max_tokens must be a whole number from 1 to ${rules.maxTokens} for this feature`);
  }

  const m = Array.isArray(body.messages) && body.messages.length === 1 ? body.messages[0] : null;
  if (!m || typeof m !== 'object' || Object.keys(m).some((k) => k !== 'role' && k !== 'content')
      || m.role !== 'user' || typeof m.content !== 'string' || !m.content.trim()) {
    return fail('messages must be exactly one user message with text content');
  }

  if (m.content.length > rules.maxPromptChars) {
    return fail(tooLongMessage(rules.hint), 'prompt_too_long');
  }

  let tools;
  if (rules.webSearch) {
    if (body.tools !== undefined) {
      const t = Array.isArray(body.tools) && body.tools.length === 1 ? body.tools[0] : null;
      const ok = t && typeof t === 'object' && !Array.isArray(t)
        && Object.keys(t).every((k) => ALLOWED_TOOL_KEYS.has(k))
        && t.type === WEB_SEARCH_TYPE && t.name === 'web_search'
        && (t.max_uses === undefined || (Number.isInteger(t.max_uses) && t.max_uses >= 1 && t.max_uses <= WEB_SEARCH_MAX_USES));
      if (!ok) return fail(`tools may only be the standard web_search tool (max_uses up to ${WEB_SEARCH_MAX_USES})`);
    }
    // Server-defined regardless of what the client sent: the client never controls the search budget.
    tools = [{ type: WEB_SEARCH_TYPE, name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }];
  } else if (body.tools !== undefined) {
    return fail('This feature does not allow tools');
  }

  return {
    ok: true,
    messages: [{ role: 'user', content: m.content }],
    opts: { model: MODEL, max_tokens: mt, ...(tools ? { tools } : {}) },
  };
}
