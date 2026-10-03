// Stubbed RENDER test of the real BizPlan (AI Trend Radar sub-tab) and AdminUsage components for the Trend Radar
// switch. Static markup cannot click, so: the Radar sub-tab is rendered in its three states (off / on / loading),
// and the Admin confirm panel is tested by starting the page with the panel's state already set. Every
// build-time substitution is printed, so you can see the markup under test is the real component.
//
// Usage: node scripts/trend-radar-switch-render-test.mjs
// It creates a temporary harness folder inside the project (module resolution needs node_modules) and a temporary
// output folder, and removes both when it finishes, whatever the result. src/App.jsx is never modified on disk.
// The sentence it checks against is the REAL FEATURE_DISABLED_MESSAGES.trend_radar from api/_lib/feature-flags.js.
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { FEATURE_DISABLED_MESSAGES } from '../api/_lib/feature-flags.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harness = path.join(root, '.render-check-switch');
const outDir = mkdtempSync(path.join(os.tmpdir(), 'trs-render-'));

const CONFIG = String.raw`import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));

const SUBSTITUTIONS = [
  { id: 'S1', desc: 'append "export { BizPlan, AdminUsage };" so the real components can be imported', kind: 'append', text: '\nexport { BizPlan, AdminUsage };\n' },
  { id: 'S2', desc: "BizPlan's initial sub-tab (view) comes from globalThis.__BIZ_VIEW instead of \"goals\" (so the AI Trend Radar sub-tab renders)",
    from: 'const [view, setView] = useState("goals");', to: 'const [view, setView] = useState(globalThis.__BIZ_VIEW || "goals");' },
  { id: 'S3', desc: "AdminUsage's initial tenants come from globalThis.__ADMIN_TENANTS and loading starts false (the usage fetch never runs under server rendering)",
    from: 'const [tenants, setTenants] = useState(null);\n  const [loading, setLoading] = useState(true);',
    to: 'const [tenants, setTenants] = useState(globalThis.__ADMIN_TENANTS || null);\n  const [loading, setLoading] = useState(false);' },
  { id: 'S4', desc: "AdminUsage's confirm-panel state starts from globalThis.__ADMIN_CONFIRM instead of null (static markup cannot click, so the panel is tested by starting the page with its state set)",
    from: 'const [confirm, setConfirm] = useState(null);', to: 'const [confirm, setConfirm] = useState(globalThis.__ADMIN_CONFIRM || null);' },
];

function substitutionPlugin() {
  return {
    name: 'switch-render-substitutions',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/App.jsx')) return null;
      let out = code;
      console.log('=== build-time substitutions applied to src/App.jsx (in memory only) ===');
      for (const s of SUBSTITUTIONS) {
        if (s.kind === 'append') { out += s.text; console.log(s.id + ': ' + s.desc); continue; }
        const hits = out.split(s.from).length - 1;
        if (hits !== 1) throw new Error(s.id + ' expected exactly 1 match, found ' + hits);
        out = out.replace(s.from, () => s.to);
        console.log(s.id + ': ' + s.desc + '  [matched exactly once]');
      }
      console.log('S0 (alias, not a source edit): @clerk/clerk-react -> clerk-stub.jsx');
      console.log('Everything else in BizPlan and AdminUsage (all JSX, conditions, handlers) is the real source.');
      return { code: out, map: null };
    },
  };
}

export default defineConfig({
  plugins: [substitutionPlugin()],
  resolve: { alias: { '@clerk/clerk-react': path.join(here, 'clerk-stub.jsx') } },
  ssr: { noExternal: true },
  build: { ssr: true, rollupOptions: { input: path.join(here, 'entry.jsx'), output: { entryFileNames: 'entry.mjs', format: 'es' } } },
  logLevel: 'warn',
});
`;

const STUB = String.raw`export const useAuth = () => ({ getToken: async () => 'stub-token', isLoaded: true, isSignedIn: true, orgId: 'org_stub' });
export const useClerk = () => ({ signOut: async () => {} });
export const useOrganization = () => ({ organization: { name: 'Test Co' } });
export const useUser = () => ({ user: { primaryEmailAddress: { emailAddress: 'a@b.invalid' } } });
export const SignIn = () => null;
`;

const ENTRY = String.raw`import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BizPlan, AdminUsage } from '../src/App.jsx';

const SENTENCE = process.env.TRN_SENTENCE;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const ESC_SENTENCE = esc(SENTENCE);
const count = (h, s) => h.split(s).length - 1;
let failures = 0;
function check(name, pass, detail) { if (!pass) failures++; console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (!pass && detail ? '  -- ' + detail : '')); }
const openTagOf = (html, label) => { const at = html.indexOf(label); const start = html.lastIndexOf('<button', at); return html.slice(start, html.indexOf('>', start) + 1); };

// ---------- BizPlan, AI Trend Radar sub-tab
const noop = () => {};
const scan = { id: 1, area: 'Industry & market trends', at: '1/1/2026, 10:00:00', summary: 'SAVEDSCANSUMMARY',
  trends: [{ trend: 'SAVEDTRENDNAME', detail: 'd', impact: 'High', effect: 'Opportunity', implication: 'i', adjustment: 'a' }] };
const bizProps = (extra) => Object.assign({
  svcs: [], calc: {}, goals5: {}, setGoals5: noop, goalActuals: {}, setGoalActuals: noop, roadmap: [], setRoadmap: noop,
  competitors: [], setCompetitors: noop, ideas: [], setIdeas: noop, scans: [scan], setScans: noop, companyName: 'Test Co',
  vision: 'VISION', swot: {}, pillars: [], focusAvoid: {}, bizModels: {}, ansoff: [], partners: [],
}, extra);
function renderBiz(extra) { globalThis.__BIZ_VIEW = 'radar'; return renderToStaticMarkup(React.createElement(BizPlan, bizProps(extra))); }
const savedVisible = (h) => ['Saved scans', 'SAVEDSCANSUMMARY', 'SAVEDTRENDNAME'].every((m) => h.includes(m));

let h = renderBiz({ trendRadarEnabled: false });
let tag = openTagOf(h, 'Scan trends');
check('Radar OFF (status loaded, not true): the Scan button is disabled', tag.includes('disabled=""'), tag);
check('Radar OFF: the button is linked to the sentence with aria-describedby="trend-radar-off"', tag.includes('aria-describedby="trend-radar-off"'), tag);
check('Radar OFF: the real server sentence is rendered once, as the text of the element with that id',
  count(h, ESC_SENTENCE) === 1 && h.includes('<div id="trend-radar-off" class="hint" style="margin-top:10px">' + ESC_SENTENCE + '</div>'));
check('Radar OFF: saved scans are visible (list, summary and trend cards)', savedVisible(h));

h = renderBiz({ trendRadarEnabled: true });
tag = openTagOf(h, 'Scan trends');
check('Radar ON: the Scan button is enabled', !tag.includes('disabled=""'), tag);
check('Radar ON: no aria-describedby, no sentence, no sentence element', !tag.includes('aria-describedby') && count(h, ESC_SENTENCE) === 0 && !h.includes('trend-radar-off'));
check('Radar ON: saved scans are visible', savedVisible(h));

for (const [label, extra] of [['prop absent', {}], ['prop undefined', { trendRadarEnabled: undefined }]]) {
  h = renderBiz(extra);
  tag = openTagOf(h, 'Scan trends');
  check('Radar LOADING (' + label + '): the Scan button is disabled', tag.includes('disabled=""'), tag);
  check('Radar LOADING (' + label + '): NO sentence, no sentence element and no aria-describedby', count(h, ESC_SENTENCE) === 0 && !h.includes('trend-radar-off') && !tag.includes('aria-describedby'));
  check('Radar LOADING (' + label + '): saved scans are visible', savedVisible(h));
}

// ---------- AdminUsage
const row = (id, name, plan, tr) => ({ id, name, billingStatus: 'active', planCode: plan, researchRuns: 0, campaignDrafts: 0, outreachDrafts: 0, trendRadarScans: 0, emailsSent: 0, over: {}, trendRadar: tr });
const TENANTS = [
  row('org_internal_000001', 'INTERNALCO', 'internal', { enabled: true, always: true }),
  row('org_on_ABCDEF', 'ONCO', null, { enabled: true, always: false }),
  row('org_off_123456', 'OFFCO', null, { enabled: false, always: false }),
];
function renderAdmin(confirm) { globalThis.__ADMIN_TENANTS = TENANTS; globalThis.__ADMIN_CONFIRM = confirm || null; return renderToStaticMarkup(React.createElement(AdminUsage)); }
const rowHtml = (html, name) => { const i = html.indexOf(name); return html.slice(html.lastIndexOf('<tr', i), html.indexOf('</tr>', i)); };

h = renderAdmin(null);
check('Admin: a "Trend Radar" column header is present', h.includes('>Trend Radar</th>'));
let r = rowHtml(h, 'INTERNALCO');
check('Admin: the internal row shows "Always on" and no toggle', r.includes('Always on') && !r.includes('Turn on') && !r.includes('Turn off'));
r = rowHtml(h, 'ONCO');
check('Admin: a tenant that is ON shows "On" and a "Turn off" button', r.includes('>On</span>') && r.includes('Turn off') && !r.includes('Always on'));
r = rowHtml(h, 'OFFCO');
check('Admin: a tenant that is OFF shows "Off" and a "Turn on" button', r.includes('>Off</span>') && r.includes('Turn on') && !r.includes('Always on'));
check('Admin: no confirm panel until a toggle is clicked', !h.includes('Turn AI Trend Radar'));
check('Admin: the page says Trend Radar is off for every client until switched on', h.includes('off for every client until you switch it on here'));

h = renderAdmin({ id: 'org_off_123456', name: 'OFFCO', enabled: true });
check('Admin confirm (turning ON): shows the tenant name AND the last 6 characters of the id', h.includes('Turn AI Trend Radar ON for OFFCO (…123456)?'));
check('Admin confirm (turning ON): says "Each scan costs real AI spend." and states no dollar figure', h.includes('Each scan costs real AI spend.') && !h.includes('$0.20') && !h.includes('$'));
check('Admin confirm (turning ON): has a confirm button and a Cancel button', h.includes('>Turn on</button>') && h.includes('>Cancel</button>'));
check('Admin confirm: the full tenant id is never shown, only its last 6 characters', !h.includes('org_off_123456'));

h = renderAdmin({ id: 'org_on_ABCDEF', name: 'ONCO', enabled: false });
check('Admin confirm (turning OFF): shows the name and last 6 characters, and says saved scans are kept',
  h.includes('Turn AI Trend Radar OFF for ONCO (…ABCDEF)?') && h.includes(esc("They keep their saved scans but can't run new ones.")) && !h.includes('costs real AI spend'));

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
`;

let code = 1;
try {
  mkdirSync(harness, { recursive: true });
  writeFileSync(path.join(harness, 'vite.config.mjs'), CONFIG);
  writeFileSync(path.join(harness, 'clerk-stub.jsx'), STUB);
  writeFileSync(path.join(harness, 'entry.jsx'), ENTRY);
  const clean = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const build = clean(execSync(`npx vite build --config .render-check-switch/vite.config.mjs --outDir "${outDir}" --emptyOutDir`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  console.log(build.split('\n').filter((l) => /^(===|S\d|Everything)/.test(l)).join('\n'));
  console.log('');
  const out = execSync(`node "${path.join(outDir, 'entry.mjs')}"`, { cwd: root, encoding: 'utf8', env: { ...process.env, TRN_SENTENCE: FEATURE_DISABLED_MESSAGES.trend_radar } });
  console.log(out);
  code = out.includes('ALL PASS') ? 0 : 1;
} catch (e) {
  console.log(String(e.stdout || ''));
  console.error(String(e.stderr || e.message));
  code = 1;
} finally {
  rmSync(harness, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
  console.log('Temporary folders removed: ' + (!existsSync(harness) && !existsSync(outDir)));
}
process.exit(code);
