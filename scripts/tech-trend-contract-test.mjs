// SOURCE-SHAPE contract test for the Tech Trend UI (CLAUDE-CODE-BRIEF-tech-trend.md). It reads src/App.jsx as text
// (APP_SOURCE_PATH can point it at a modified copy, to prove it can fail). It does not click anything; every failure names
// the area and the assertion. The one cross-file check: the client's TT_LIMITS must match the server's LIMITS in
// api/tech-trend.js, number for number, and a mismatch names WHICH limit differs.
import { readFileSync } from 'fs';
import { appSource } from './lib/extract-app-source.mjs';

const src = appSource();
const server = readFileSync(new URL('../api/tech-trend.js', import.meta.url), 'utf8');
let failures = 0;
const expect = (area, assertion, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${area}] ${assertion}${!pass && detail ? '  -- ' + detail : ''}`);
};
const count = (s, sub) => s.split(sub).length - 1;

// Source of a TOP-LEVEL function: from "function name(" to the first closing brace at column 0.
function topLevelFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in src/App.jsx`);
  const end = source.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`end of function ${name} not found`);
  return source.slice(start, end + 2);
}
const readLimits = (text, constName) => {
  const m = text.match(new RegExp(`const ${constName} = \\{([^}]*)\\}`));
  if (!m) return null;
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*(\d+)/g)].map(([, k, v]) => [k, Number(v)]));
};

const tt = topLevelFunction(src, 'TechTrend');
const biz = topLevelFunction(src, 'BizPlan');

// ---- wiring
expect('Wiring', 'the sub-tab sits directly after AI Trend Radar: ["radar","AI Trend Radar"],["techtrend","Tech Trend"]', count(src, '["radar","AI Trend Radar"],["techtrend","Tech Trend"]') === 1);
expect('Wiring', 'BizPlan renders <TechTrend /> for that view, exactly once', count(biz, '{view === "techtrend" && <TechTrend />}') === 1);

// ---- plain text only
expect('Plain text', 'dangerouslySetInnerHTML appears nowhere in src/App.jsx', count(src, 'dangerouslySetInnerHTML') === 0);
expect('Plain text', 'the report body is rendered as a text node inside a pre-wrap block', count(tt, '{r.body}</div>') === 1 && tt.includes('whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>{r.body}'));
expect('Plain text', 'the confirm preview is the first 600 characters of the body, as text', tt.includes('{pending.body.slice(0, 600)}'));

// ---- links
const anchors = tt.match(/<a [^>]*>/g) || [];
expect('Links', 'there is at least one source link', anchors.length >= 1);
expect('Links', 'EVERY link opens in a new tab with rel="noopener noreferrer"', anchors.every((a) => a.includes('target="_blank"') && a.includes('rel="noopener noreferrer"')), anchors.join(' | '));
expect('Links', 'a source is rendered as a link only when its url is http(s) (ttSafeUrl), otherwise as plain text', tt.includes('{ttSafeUrl(s.url) ? <a href={s.url}') && /ttSafeUrl = \(u\) => typeof u === "string" && \/\^https\?:\\\/\\\/\/i\.test\(u\)/.test(src));

// ---- confirm flow
expect('Confirm flow', '"Publish to ALL customers?" appears exactly once', count(tt, 'Publish to ALL customers?') === 1);
expect('Confirm flow', 'exactly one fetch can write, with method: isEdit ? "PUT" : "POST", and it is inside publish()', count(tt, 'method: isEdit ? "PUT" : "POST"') === 1 && count(tt, 'method: ') === 2 && /const publish = async \(\) => \{[\s\S]*method: isEdit \? "PUT" : "POST"/.test(tt));
const review = (tt.match(/const review = \(\) => \{[\s\S]*?\n  \};/) || [''])[0];
expect('Confirm flow', 'review() (the form button) only validates and opens the panel: it makes no request', review.length > 0 && !review.includes('fetch(') && review.includes('setPending(form)'));
expect('Confirm flow', 'the publish button is only inside the confirm panel', count(tt, 'onClick={publish}') === 1 && tt.indexOf('onClick={publish}') > tt.indexOf('Publish to ALL customers?'));
expect('Confirm flow', 'the confirm panel itself shows actionErr (an error is visible next to the Publish button)', tt.indexOf('{actionErr && <div', tt.indexOf('Publish to ALL customers?')) > -1 && count(tt, '{actionErr && <div') === 2);
expect('Confirm flow', 'an edit says it replaces the current version', tt.includes('{pending.id && <> This <b>replaces</b>'));

// ---- remove
const removeFn = (tt.match(/const remove = async \(r\) => \{[\s\S]*?\n  \};/) || [''])[0];
expect('Remove', 'asks exactly "Remove this report for ALL customers?" before anything is sent', removeFn.includes('window.confirm("Remove this report for ALL customers?")') && removeFn.indexOf('window.confirm') < removeFn.indexOf('fetch('));
expect('Remove', 'uses DELETE with ?id= and encodeURIComponent', removeFn.includes('"/api/tech-trend?id=" + encodeURIComponent(r.id)') && removeFn.includes('method: "DELETE"'));
expect('Remove', 'after a successful remove, closes the form and clears the confirm if that report is open', removeFn.includes('if (form?.id === r.id) { setForm(null); setPending(null); }') && removeFn.indexOf('setReports(') < removeFn.indexOf('form?.id === r.id'));

// ---- who sees what
expect('Gating', 'the New report button is gated on canManage and a closed form', count(tt, '{canManage && !form && (') === 1);
expect('Gating', 'the form (and its confirm panel) is gated on canManage', count(tt, '{canManage && form && (') === 1);
expect('Gating', 'Edit and Remove are gated on canManage', count(tt, '{canManage && (\n              <div style={{ display: "flex", gap: 8 }}>') === 1 && tt.indexOf('>Edit</button>') > tt.indexOf('{canManage && (\n              <div'));
expect('Gating', 'canManage comes from the server response, not from anything on this page', tt.includes('setCanManage(!!data.canManage)'));

// ---- text
expect('Text', 'the form guidance is exactly: Summarise in your own words, list your sources, set the as-of date, and publish nothing confidential.', count(tt, 'Summarise in your own words, list your sources, set the as-of date, and publish nothing confidential.') === 1);
expect('Text', 'the page says the reports are general, not tailored to the customer\'s service lines', tt.includes('They are general: they are not tailored to your own service lines the way an AI Trend Radar scan is.'));
expect('Text', '"No reports yet" is shown when the list is empty', count(tt, 'No reports yet') === 1);

// ---- the request
const publishFn = (tt.match(/const publish = async \(\) => \{[\s\S]*?\n  \};/) || [''])[0];
expect('Request', 'the request body never carries published_by, updated_by or an id (the server sets them from the session)', publishFn.length > 0 && !/published_by|updated_by/.test(publishFn) && !/JSON\.stringify\(\{[^}]*\bid:/.test(publishFn));
expect('Request', 'PUT addresses the report with ?id= and encodeURIComponent', publishFn.includes('"/api/tech-trend?id=" + encodeURIComponent(pending.id)'));

// ---- limits: client TT_LIMITS must equal the server's LIMITS, and a mismatch names which limit
{
  const c = readLimits(src, 'TT_LIMITS');
  const s = readLimits(server, 'LIMITS');
  expect('Limits', 'both limit tables can be read (client TT_LIMITS in App.jsx, server LIMITS in api/tech-trend.js)', !!c && !!s);
  if (c && s) {
    expect('Limits', 'the client and server have the same set of limits', JSON.stringify(Object.keys(c).sort()) === JSON.stringify(Object.keys(s).sort()), `client=${Object.keys(c).sort()} server=${Object.keys(s).sort()}`);
    for (const key of Object.keys(s)) {
      expect('Limits', `limit "${key}": client equals server`, c[key] === s[key], `server ${s[key]}, client ${c[key]}`);
    }
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
