// Shared Anthropic Messages API client for server-side callers — api/generate.js's browser
// proxy and api/cron-follow-up.js's direct server-side drafting. Not itself an endpoint —
// files/folders under api/ prefixed with "_" are skipped by Vercel's routing.
//
// Centralizing this also gives every caller the same dry-run escape hatch: set
// DRAFT_DRY_RUN=true in .env.local (NEVER in Vercel's Production/Preview scopes — this
// returns fake content, it must never run for a real user) to iterate on drafting/cron
// logic locally without a valid ANTHROPIC_API_KEY or spending real API credits — e.g.
// exactly the situation that came up testing api/cron-follow-up.js while the real key
// turned out to be invalid.
const DRY_RUN = process.env.DRAFT_DRY_RUN === 'true';

// A single JSON blob covering the field names every current caller parses out of a
// response (outreach/follow-up drafts want subject+body, prospecting research wants
// candidates, the social post generator wants post/hashtags/bestTime/frequency/rationale)
// so any caller's JSON.parse(text).<field> access gets a sane placeholder regardless of
// which endpoint is dry-running.
const DRY_RUN_TEXT = JSON.stringify({
  subject: '[DRY RUN] Test subject — no real Anthropic call was made',
  body: '[DRY RUN] Test body — no real Anthropic call was made.',
  candidates: [],
  post: '[DRY RUN] Test post',
  hashtags: [],
  bestTime: '',
  frequency: '',
  rationale: '[DRY RUN] no real call made',
});

export async function callClaude(messages, opts = {}) {
  if (DRY_RUN) {
    return {
      status: 200,
      data: {
        id: 'msg_dryrun',
        type: 'message',
        role: 'assistant',
        model: 'dry-run',
        content: [{ type: 'text', text: DRY_RUN_TEXT }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, ...opts, messages }),
  });
  const data = await response.json();
  return { status: response.status, data };
}
