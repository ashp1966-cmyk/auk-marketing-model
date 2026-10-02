// SOURCE-SHAPE contract test for the five /api/generate call sites in src/App.jsx. It reads the source as
// text and checks the structure we rely on. It does NOT run the click-through (no DOM runtime), so it can't
// prove behaviour; it exists to catch a regression, and every failure names the call site and the assertion.
import { appSource, extractFunction, matchPair } from './lib/extract-app-source.mjs';

const src = appSource();
let failures = 0;
const expect = (site, assertion, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${site}] ${assertion}${!pass && detail ? '  -- ' + detail : ''}`);
};

// Each window runs from the site's prompt to the end of its try/catch ("} finally {").
const SITES = [
  { name: 'Campaign strategic', marker: 'const prompt = `You are the voice of ', kind: 'usage', usagePath: '/api/usage/campaign-draft',
    label: 'campaign-strategic', shown: '[entry, ...c]', removal: /setStrategicPosts\(\(c\) => c\.filter/ },
  { name: 'Campaign quick post', marker: 'const prompt = `You are a senior B2B marketing strategist for ', kind: 'usage', usagePath: '/api/usage/campaign-draft',
    label: 'campaign-quick', shown: 'setCalendar((c) => [entry, ...c])', removal: /setCalendar\(\(c\) => c\.filter/ },
  { name: 'Trend Radar', marker: 'const prompt = `You are a senior strategy advisor to ', kind: 'usage', usagePath: '/api/usage/trend-radar-scan',
    label: 'trend-radar', shown: 'setActiveScanId(newScan.id)', removal: /setScans\(\(prev\) => prev\.filter/,
    rawSetter: 'setTrendRaw', stateDecl: 'const [trendRaw, setTrendRaw] = useState("")', component: '<CopyRawReply text={trendRaw} />' },
  { name: 'Outreach draft', marker: 'const prompt = `You are a business development rep for ', kind: 'save', savePath: '/api/outreach', label: 'outreach-draft' },
  { name: 'Prospect research', marker: 'const prompt = `You are a business development researcher for ', kind: 'save', savePath: '/api/prospects', label: 'research',
    rawSetter: 'setResearchRaw', stateDecl: 'const [researchRaw, setResearchRaw] = useState("")', component: '<CopyRawReply text={researchRaw} />' },
];
const count = (s, sub) => s.split(sub).length - 1;

// The code of an expression with the TEXT of string literals blanked out (template-literal ${...} parts are
// kept), so a message that merely contains the word "parsed" isn't mistaken for logging a variable.
function codeOnly(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { const q = c; i++; while (s[i] !== q) { if (s[i] === '\\') i++; i++; } out += ' '; continue; }
    if (c === '`') {
      i++;
      while (s[i] !== '`') {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === '$' && s[i + 1] === '{') {
          let d = 1; i += 2; let inner = '';
          while (d > 0) { if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (d === 0) break; } inner += s[i]; i++; }
          out += ' ' + codeOnly(inner) + ' '; i++; continue;
        }
        i++;
      }
      out += ' '; continue;
    }
    out += c;
  }
  return out;
}

for (const s of SITES) {
  const at = src.indexOf(s.marker);
  if (at < 0 || src.indexOf(s.marker, at + 1) >= 0) { expect(s.name, 'call site found exactly once in src/App.jsx', false, `marker "${s.marker}"`); continue; }
  const end = src.indexOf('} finally {', at);
  const w = src.slice(at, end);

  expect(s.name, 'makes exactly one /api/generate request', count(w, 'fetch("/api/generate"') === 1);
  expect(s.name, 'logs a parse failure through logParseFailure with its own label', w.includes(`logParseFailure("${s.label}", e)`));

  if (s.kind === 'usage') {
    expect(s.name, `counts usage via recordUsage(getToken, "${s.usagePath}") (fresh token, never throws)`, w.includes(`await recordUsage(getToken, "${s.usagePath}")`));
    expect(s.name, 'has no leftover usageRes / usageJson discard branch', !w.includes('usageRes') && !w.includes('usageJson'));
    expect(s.name, 'never removes the result from state when counting fails', !s.removal.test(w));
    const shownAt = w.indexOf(s.shown), usageAt = w.indexOf('recordUsage(');
    expect(s.name, 'shows the result in state BEFORE counting it', shownAt > -1 && usageAt > shownAt, `shown@${shownAt} usage@${usageAt}`);
  } else {
    const fetchAt = w.indexOf(`fetch("${s.savePath}"`);
    const tokenAt = w.search(/const saveToken = await getToken\(\{ skipCache: true \}\);/);
    expect(s.name, `fetches a fresh skipCache token before the ${s.savePath} request`, fetchAt > -1 && tokenAt > -1 && tokenAt < fetchAt, `token@${tokenAt} fetch@${fetchAt}`);
    const req = fetchAt > -1 ? w.slice(fetchAt, w.indexOf('});', fetchAt)) : '';
    expect(s.name, `authorises the ${s.savePath} request with the fresh token`, req.includes('Bearer ${saveToken}'));
    expect(s.name, `does not reuse the pre-generate token for the ${s.savePath} request`, !req.includes('Bearer ${token}'));
  }

  if (s.rawSetter) {
    expect(s.name, `keeps the raw reply via ${s.rawSetter}(e.rawReply)`, w.includes(`${s.rawSetter}(e.rawReply)`));
    expect(s.name, 'raw reply lives in component state (declared once with useState)', count(src, s.stateDecl) === 1);
    expect(s.name, '"Copy raw reply" is rendered exactly once, at this site', count(src, s.component) === 1);
  }
}

// ---- file-level guarantees, attributed to "All sites" / "Helpers"
{
  const bad = [];
  const re = /console\.(?:log|warn|error|info|debug)\(/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const call = src.slice(m.index, matchPair(src, open) + 1);
    if (/rawReply|trendRaw|researchRaw|\bparsed\b|\bdata\.content\b/.test(codeOnly(call))) bad.push(`line ${src.slice(0, m.index).split('\n').length}`);
  }
  expect('All sites', 'no console call references the raw reply or parsed output', bad.length === 0, bad.join(', '));
  expect('All sites', 'no fetch after /api/generate uses a bare `${token}` from before the AI call in the five windows',
    SITES.every((s) => { const at = src.indexOf(s.marker); const w = src.slice(at, src.indexOf('} finally {', at)); const gen = w.indexOf('fetch("/api/generate"'); return !w.slice(w.indexOf('});', gen)).includes('Bearer ${token}'); }));

  const rec = extractFunction(src, 'recordUsage');
  const log = extractFunction(src, 'logParseFailure');
  const ej = extractFunction(src, 'extractJson');
  expect('Helpers', 'recordUsage asks Clerk for a fresh token: getToken({ skipCache: true })', rec.includes('getToken({ skipCache: true })'));
  expect('Helpers', 'recordUsage never throws (whole body inside try/catch)', /try \{/.test(rec) && /catch/.test(rec));
  expect('Helpers', 'recordUsage logs route and status only (no token variable in a console call)', !/console\.\w+\([^)]*token/.test(rec));
  expect('Helpers', 'logParseFailure never references rawReply or e.message', !/rawReply|\.message/.test(log));
  expect('Helpers', 'extractJson attaches rawReply on all three failure paths', count(ej, 'rawReply') === 3, `found ${count(ej, 'rawReply')}`);
  expect('Helpers', 'CopyRawReply helper is defined once', count(src, 'function CopyRawReply(') === 1);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
