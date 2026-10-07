// SOURCE-SHAPE contract test for the client side of the Trend Radar switch (CLAUDE-CODE-BRIEF-trend-radar-switch.md).
// It reads src/App.jsx as text (APP_SOURCE_PATH can point it at a modified copy, to prove it can fail). It does
// not click anything; every failure names the area and the assertion.
//
// The one thing it compares against the SERVER is the sentence: it imports the REAL
// FEATURE_DISABLED_MESSAGES.trend_radar from api/_lib/feature-flags.js (not a copy) and requires the client's
// TREND_RADAR_OFF_MESSAGE to be strictly equal to it. Any difference at all fails.
import { FEATURE_DISABLED_MESSAGES } from '../api/_lib/feature-flags.js';
import { appSource } from './lib/extract-app-source.mjs';

const src = appSource();

// Source of a TOP-LEVEL function: from "function name(" to the first closing brace at column 0. (The brace-matching
// extractor in lib/ is for small helper functions: it treats an apostrophe in JSX text, like "model's", as the
// start of a string, so it mis-sizes whole components.)
function topLevelFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in src/App.jsx`);
  const end = source.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`end of function ${name} not found`);
  return source.slice(start, end + 2);
}
let failures = 0;
const expect = (area, assertion, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${area}] ${assertion}${!pass && detail ? '  -- ' + detail : ''}`);
};
const count = (s, sub) => s.split(sub).length - 1;

// ---- the sentence
{
  const m = src.match(/const TREND_RADAR_OFF_MESSAGE = ("(?:[^"\\]|\\.)*");/);
  expect('Client sentence', 'TREND_RADAR_OFF_MESSAGE is defined exactly once, as a plain double-quoted string', count(src, 'const TREND_RADAR_OFF_MESSAGE =') === 1 && !!m);
  const client = m ? JSON.parse(m[1]) : null;
  const server = FEATURE_DISABLED_MESSAGES.trend_radar;
  expect('Client sentence', "is STRICTLY EQUAL to the real FEATURE_DISABLED_MESSAGES.trend_radar from api/_lib/feature-flags.js (any difference fails)",
    typeof server === 'string' && client === server, `client=${JSON.stringify(client)} server=${JSON.stringify(server)}`);
  expect('Client sentence', 'the sentence text appears nowhere else in src/App.jsx (no second, drifting copy)', count(src, "Trend Radar isn't switched on for your account") === 1);   // the full sentence; the Billing meter's short "Not switched on for your account" label is a different, deliberate string
  expect('Client sentence', 'it is rendered through the constant, once', count(src, '{TREND_RADAR_OFF_MESSAGE}') === 1);
}

// ---- AppShell
{
  const prop = 'trendRadarEnabled={trialStatus ? trialStatus.features?.trendRadar === true : undefined}';
  expect('AppShell', 'passes trendRadarEnabled to BizPlan, exactly once, undefined while trialStatus is null/loading', count(src, prop) === 1);
  expect('AppShell', 'the loaded case compares with === true (a missing field is NOT enabled)', prop.includes('=== true') && count(src, 'trendRadar !== false') === 0 && count(src, 'trendRadar != false') === 0);
  expect('AppShell', 'only one place passes trendRadarEnabled', count(src, 'trendRadarEnabled={') === 1);
}

// ---- BizPlan
{
  const biz = topLevelFunction(src, 'BizPlan');
  expect('BizPlan', 'takes trendRadarEnabled as a prop', biz.includes('partners, trendRadarEnabled }) {'));
  expect('BizPlan', 'Scan button is disabled unless the prop === true: disabled={trendBusy || trendRadarEnabled !== true}', count(biz, 'disabled={trendBusy || trendRadarEnabled !== true}') === 1);
  expect('BizPlan', 'the sentence renders only when the prop === false (not while loading)', count(biz, '{trendRadarEnabled === false && (') === 1);
  expect('BizPlan', 'no falsy check on the prop anywhere (that would show the sentence while loading)', count(biz, '!trendRadarEnabled') === 0);
  expect('BizPlan', 'sentence element carries id="trend-radar-off"', count(biz, 'id="trend-radar-off"') === 1);
  expect('BizPlan', 'aria-describedby links the button to it, only when === false', count(biz, 'aria-describedby={trendRadarEnabled === false ? "trend-radar-off" : undefined}') === 1);
  // The saved-scans list and the open scan stay visible whatever the switch says: each is gated only on its own data.
  const at = biz.indexOf('Saved scans');
  const listGate = biz.lastIndexOf('{scans.length > 0 && (', at);
  expect('BizPlan', 'the saved-scans list is gated only on scans.length > 0 (not on the switch)', at > -1 && listGate > -1 && !biz.slice(listGate, at).includes('trendRadarEnabled'));
  const scanGate = biz.indexOf('{scan && (');
  expect('BizPlan', 'the open scan view is gated only on `scan` (not on the switch)', scanGate > -1 && !biz.slice(scanGate, scanGate + 400).includes('trendRadarEnabled'));
}

// ---- AdminUsage
{
  const adm = topLevelFunction(src, 'AdminUsage');
  expect('AdminUsage', 'posts to /api/admin/features for feature "trend_radar", from exactly one fetch', count(src, 'fetch("/api/admin/features"') === 1 && adm.includes('feature: "trend_radar"'));
  const upd = (adm.split('\n').find((l) => l.includes('setTenants((prev) =>')) || '');
  expect('AdminUsage', 'the row is updated from the SERVER reply (saved = json.feature?.enabled), not from confirm.enabled', adm.includes('const saved = json.feature?.enabled;') && upd.includes('enabled: saved') && !upd.includes('confirm.enabled'), upd.trim());
  expect('AdminUsage', 'a reply without a boolean is rejected, not guessed at', adm.includes('typeof saved !== "boolean"'));
  expect('AdminUsage', 'the confirm panel shows the tenant name AND the last 6 characters of the id', adm.includes('{confirm.name}') && adm.includes('confirm.id.slice(-6)'));
  expect('AdminUsage', 'the toggle button only opens the confirm panel (it never calls applySwitch)', /onClick=\{\(\) => \{ setSwitchErr\(""\); setConfirm\(/.test(adm) && count(adm, 'onClick={applySwitch}') === 1);
  expect('AdminUsage', 'the internal row shows "Always on", gated on t.trendRadar?.always', adm.includes('t.trendRadar?.always ?') && count(adm, '>Always on</span>') === 1);
  expect('AdminUsage', 'has the Trend Radar column header', count(adm, '>Trend Radar</th>') === 1);
}

// ---- no dollar figures
{
  expect('Money', '"$0.20" appears nowhere in src/App.jsx', count(src, '$0.20') === 0);
  expect('Money', '"about $0.20" appears nowhere in src/App.jsx', count(src, 'about $0.20') === 0);
  expect('Money', 'the confirm panel says "Each scan costs real AI spend." exactly once', count(src, 'Each scan costs real AI spend.') === 1);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
