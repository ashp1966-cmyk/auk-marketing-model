// Level 1: pure tests of api/_lib/generate-request.js. The five payloads are the REAL ones read out of
// src/App.jsx, so a change to a call site that the server would reject fails here.
import { shapeGenerateRequest, FEATURE_RULES, MODEL, WEB_SEARCH_MAX_USES } from '../api/_lib/generate-request.js';
import { realPayloads } from './lib/real-generate-payloads.mjs';

let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const SERVER_TOOL = [{ type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }];

const real = realPayloads('Test prompt');
check('found exactly 5 real call sites (campaign x2, outreach, research, trend radar)', real.length === 5);
const by = (f) => real.filter((r) => r.feature === f);

// 0. The approved numbers and hints are pinned, so an accidental edit is caught here.
const APPROVED = {
  campaign_drafts:   { maxTokens: 1200, maxPromptChars: 7500,  hint: 'for example the service name, audience, geography or segments' },
  outreach_drafts:   { maxTokens: 700,  maxPromptChars: 9000,  hint: "for example the prospect's company name, contact name or rationale" },
  research_runs:     { maxTokens: 3000, maxPromptChars: 7500,  hint: 'for example the service name, audience, geography or segments' },
  trend_radar_scans: { maxTokens: 3000, maxPromptChars: 10500, hint: 'for example the number or length of your service names' },
};
check('exactly the four known features have rules', JSON.stringify(Object.keys(FEATURE_RULES).sort()) === JSON.stringify(Object.keys(APPROVED).sort()));
for (const [f, want] of Object.entries(APPROVED)) {
  const got = FEATURE_RULES[f] || {};
  check(`${f}: max_tokens ${want.maxTokens}, prompt ceiling ${want.maxPromptChars}, own hint pinned`,
    got.maxTokens === want.maxTokens && got.maxPromptChars === want.maxPromptChars && got.hint === want.hint);
}
check('web_search allowed only for research_runs and trend_radar_scans',
  Object.entries(FEATURE_RULES).every(([f, r]) => r.webSearch === (f === 'research_runs' || f === 'trend_radar_scans')));

// 1. Every real payload is accepted and rebuilt exactly.
real.forEach(({ feature, payload }, i) => {
  const r = shapeGenerateRequest(payload);
  const search = FEATURE_RULES[feature].webSearch;
  const expectKeys = search ? ['max_tokens', 'model', 'tools'] : ['max_tokens', 'model'];
  check(`real payload #${i + 1} (${feature}, max_tokens ${payload.max_tokens}) accepted`, r.ok === true);
  check(`  ...forwarded body has exactly ${expectKeys.join('/')} + one user message, nothing else`,
    r.ok && JSON.stringify(Object.keys(r.opts).sort()) === JSON.stringify(expectKeys)
    && r.messages.length === 1 && r.messages[0].role === 'user' && r.messages[0].content === 'Test prompt'
    && Object.keys(r.messages[0]).length === 2 && r.opts.model === MODEL && r.opts.max_tokens === payload.max_tokens);
  if (search) check('  ...tools are the server-defined web_search tool with max_uses 5', JSON.stringify(r.opts.tools) === JSON.stringify(SERVER_TOOL));
});
const trend = by('trend_radar_scans')[0].payload;
check('Trend Radar real payload had NO max_uses; output now caps it at 5 (the intended change)',
  trend.tools[0].max_uses === undefined && shapeGenerateRequest(trend).opts.tools[0].max_uses === 5);
check('research real payload max_uses 5 unchanged', by('research_runs')[0].payload.tools[0].max_uses === 5);

// 2. Non-string features (and prototype names) are rejected.
const base = clone(by('research_runs')[0].payload);
for (const [label, v] of [['array ["research_runs"]', ['research_runs']], ['number', 1], ['null', null], ['object', {}], ['boolean', true], ['missing', undefined], ['"constructor"', 'constructor'], ['"__proto__"', '__proto__'], ['"toString"', 'toString']]) {
  const p = { ...base }; if (v === undefined) delete p.feature; else p.feature = v;
  check(`feature ${label} -> rejected`, shapeGenerateRequest(p).ok === false);
}
check('body not an object -> rejected', [null, [], 'x', 5].every((b) => shapeGenerateRequest(b).ok === false));

// 3. Field allowlist.
const camp = clone(by('campaign_drafts')[0].payload);
for (const f of ['system', 'temperature', 'stream', 'thinking', 'metadata', 'top_p', 'stop_sequences']) {
  check(`extra field "${f}" -> rejected`, shapeGenerateRequest({ ...camp, [f]: 1 }).ok === false);
}
check('model opus -> rejected', shapeGenerateRequest({ ...camp, model: 'claude-opus-4-1' }).ok === false);
check('model omitted -> accepted (server sets it)', (() => { const p = clone(camp); delete p.model; const r = shapeGenerateRequest(p); return r.ok && r.opts.model === MODEL; })());

// 4. max_tokens ceilings, per feature, at and over.
for (const [f, rules] of Object.entries(FEATURE_RULES)) {
  const p = clone(by(f)[0].payload);
  check(`${f}: max_tokens ${rules.maxTokens} accepted`, shapeGenerateRequest({ ...p, max_tokens: rules.maxTokens }).ok);
  check(`${f}: max_tokens ${rules.maxTokens + 1} rejected`, !shapeGenerateRequest({ ...p, max_tokens: rules.maxTokens + 1 }).ok);
}
for (const [label, v] of [['0', 0], ['-5', -5], ['string "500"', '500'], ['1.5', 1.5], ['null', null], ['missing', undefined]]) {
  const p = clone(camp); if (v === undefined) delete p.max_tokens; else p.max_tokens = v;
  check(`max_tokens ${label} -> rejected`, !shapeGenerateRequest(p).ok);
}

// 5. messages.
for (const [label, v] of [['empty array', []], ['two messages', [camp.messages[0], camp.messages[0]]], ['assistant role', [{ role: 'assistant', content: 'x' }]],
  ['non-string content', [{ role: 'user', content: ['x'] }]], ['empty content', [{ role: 'user', content: '   ' }]], ['extra key', [{ role: 'user', content: 'x', name: 'n' }]], ['not an array', 'hi']]) {
  check(`messages: ${label} -> rejected`, !shapeGenerateRequest({ ...camp, messages: v }).ok);
}

// 6. tools.
for (const f of ['campaign_drafts', 'outreach_drafts']) {
  const p = clone(by(f)[0].payload);
  check(`${f}: tools present -> rejected`, !shapeGenerateRequest({ ...p, tools: clone(by('research_runs')[0].payload.tools) }).ok);
  check(`${f}: empty tools array -> rejected`, !shapeGenerateRequest({ ...p, tools: [] }).ok);
}
check('research payload sent under feature campaign_drafts -> rejected (tools + max_tokens)', !shapeGenerateRequest({ ...base, feature: 'campaign_drafts' }).ok);
const tool = (t) => ({ ...base, tools: [t] });
const okTool = { type: 'web_search_20250305', name: 'web_search' };
check('search tool max_uses 5 accepted', shapeGenerateRequest(tool({ ...okTool, max_uses: 5 })).ok);
check('search tool max_uses omitted accepted', shapeGenerateRequest(tool(okTool)).ok);
check('search tool client max_uses 2 accepted but server forces 5', shapeGenerateRequest(tool({ ...okTool, max_uses: 2 })).opts.tools[0].max_uses === 5);
for (const [label, t] of [['max_uses 6', { ...okTool, max_uses: 6 }], ['max_uses "5"', { ...okTool, max_uses: '5' }], ['max_uses 0', { ...okTool, max_uses: 0 }],
  ['wrong type', { ...okTool, type: 'bash_20250124' }], ['wrong name', { ...okTool, name: 'bash' }], ['extra key', { ...okTool, allowed_domains: ['x.com'] }], ['not an object', 'web_search']]) {
  check(`search tool ${label} -> rejected`, !shapeGenerateRequest(tool(t)).ok);
}
check('two tools -> rejected', !shapeGenerateRequest({ ...base, tools: [okTool, okTool] }).ok);
check('tools not an array -> rejected', !shapeGenerateRequest({ ...base, tools: okTool }).ok);

// 7. Prompt-size ceilings. Unit: characters (JS string length) of the single user message.
//    Inclusive: exactly at the ceiling is accepted, one over is rejected. Tested for EVERY real call site.
const msg = (hint) => `This request is too long to process. Please shorten the text you've entered (${hint}) and try again, or email sales@auk-maritime.com if it keeps happening.`;
const withContent = (p, content) => ({ ...clone(p), messages: [{ role: 'user', content }] });
real.forEach(({ feature, payload }, i) => {
  const cap = APPROVED[feature].maxPromptChars;
  const at = shapeGenerateRequest(withContent(payload, 'x'.repeat(cap)));
  const over = shapeGenerateRequest(withContent(payload, 'x'.repeat(cap + 1)));
  check(`site #${i + 1} ${feature}: exactly ${cap} chars ACCEPTED (and forwarded intact)`, at.ok === true && at.messages[0].content.length === cap);
  check(`site #${i + 1} ${feature}: ${cap + 1} chars REJECTED with code prompt_too_long`, over.ok === false && over.code === 'prompt_too_long');
  check(`site #${i + 1} ${feature}: message is exactly the template with this feature's own hint`, over.message === msg(APPROVED[feature].hint));
});
// Whitespace counts toward the length (the check uses the raw string, not the trimmed one).
{
  const f = 'campaign_drafts'; const cap = APPROVED[f].maxPromptChars; const p = by(f)[0].payload;
  check('whitespace counts: ceiling-1 chars + one space = exactly ceiling -> accepted', shapeGenerateRequest(withContent(p, 'x'.repeat(cap - 1) + ' ')).ok === true);
  check('whitespace counts: ceiling chars + one space = ceiling+1 -> rejected', shapeGenerateRequest(withContent(p, 'x'.repeat(cap) + ' ')).ok === false);
}
// Customer-facing wording: each feature's message contains ITS hint, nothing technical, no "notes".
for (const [f, a] of Object.entries(APPROVED)) {
  const over = shapeGenerateRequest(withContent(by(f)[0].payload, 'x'.repeat(a.maxPromptChars + 1)));
  check(`${f}: message contains its own hint`, over.message.includes(`(${a.hint})`));
  check(`${f}: message has no max_tokens / ceiling / chars / notes, and gives the sales email`,
    !/max_tokens|ceiling|chars|notes/i.test(over.message) && over.message.includes('sales@auk-maritime.com'));
}
const msgOf = (f) => shapeGenerateRequest(withContent(by(f)[0].payload, 'x'.repeat(APPROVED[f].maxPromptChars + 1))).message;
check('outreach message does not carry the campaign/research hint', !msgOf('outreach_drafts').includes(APPROVED.campaign_drafts.hint));
check('trend radar message does not carry the campaign/research hint', !msgOf('trend_radar_scans').includes(APPROVED.campaign_drafts.hint));
check('campaign and research share one hint, as approved', msgOf('campaign_drafts') === msgOf('research_runs'));

// 8. Other rejections keep the generic code.
check('other rejections carry code invalid_request', shapeGenerateRequest({ ...camp, system: 'x' }).code === 'invalid_request');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
