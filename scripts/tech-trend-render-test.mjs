// Stubbed RENDER test of the real TechTrend component (and its sub-tab in BizPlan). Static markup cannot click, so the
// AUK form and the red confirm panel are tested by starting the page with that state already set. Every build-time
// substitution is printed, so you can see the markup under test is the real component.
//
// Usage: node scripts/tech-trend-render-test.mjs
// It creates a temporary harness folder inside the project (module resolution needs node_modules) and a temporary
// output folder, and removes both when it finishes, whatever the result. src/App.jsx is never modified on disk.
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harness = path.join(root, '.render-check-tt');
const outDir = mkdtempSync(path.join(os.tmpdir(), 'tt-render-'));

const CONFIG = String.raw`import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));

const SUBSTITUTIONS = [
  { id: 'S1', desc: 'append "export { BizPlan, TechTrend };" so the real components can be imported', kind: 'append', text: '\nexport { BizPlan, TechTrend };\n' },
  { id: 'S2', desc: "BizPlan's initial sub-tab (view) comes from globalThis.__BIZ_VIEW instead of \"goals\" (so the Tech Trend sub-tab renders)",
    from: 'const [view, setView] = useState("goals");', to: 'const [view, setView] = useState(globalThis.__BIZ_VIEW || "goals");' },
  { id: 'S3', desc: "TechTrend's initial reports (null = loading) and canManage come from globalThis.__TT_REPORTS / __TT_CAN (the fetch never runs under server rendering)",
    from: 'const [reports, setReports] = useState(null);   // null while loading\n  const [canManage, setCanManage] = useState(false);',
    to: 'const [reports, setReports] = useState(globalThis.__TT_REPORTS ?? null);\n  const [canManage, setCanManage] = useState(!!globalThis.__TT_CAN);' },
  { id: 'S4', desc: "TechTrend's form state starts from globalThis.__TT_FORM instead of null (static markup cannot click, so the form is tested by starting the page with it open)",
    from: 'const [form, setForm] = useState(null);   // null = closed; otherwise the report being written or edited', to: 'const [form, setForm] = useState(globalThis.__TT_FORM || null);' },
  { id: 'S5', desc: "TechTrend's confirm-panel state starts from globalThis.__TT_PENDING instead of null (same reason)",
    from: 'const [pending, setPending] = useState(null);   // the filled-in form awaiting the red confirm', to: 'const [pending, setPending] = useState(globalThis.__TT_PENDING || null);' },
  { id: 'S6', desc: "TechTrend's action-error text starts from globalThis.__TT_ERR instead of empty (to show an error is displayed inside the confirm panel)",
    from: 'const [actionErr, setActionErr] = useState("");\n\n  useEffect(() => {\n    let cancelled = false;\n    (async () => {\n      try {\n        const token = await getToken();\n        const res = await fetch("/api/tech-trend"',
    to: 'const [actionErr, setActionErr] = useState(globalThis.__TT_ERR || "");\n\n  useEffect(() => {\n    let cancelled = false;\n    (async () => {\n      try {\n        const token = await getToken();\n        const res = await fetch("/api/tech-trend"' },
];

function substitutionPlugin() {
  return {
    name: 'tt-render-substitutions',
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
      console.log('Everything else in TechTrend and BizPlan (all JSX, conditions, handlers) is the real source.');
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
import { BizPlan, TechTrend } from '../src/App.jsx';

const count = (h, s) => h.split(s).length - 1;
let failures = 0;
function check(name, pass, detail) { if (!pass) failures++; console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (!pass && detail ? '  -- ' + detail : '')); }

const R1 = { id: 'id-1', title: 'TITLE_ONE', topic: 'TOPIC_ONE', body: 'BODY_ONE first line\nsecond line <script>alert(1)</script> and <b>bold</b>',
  sources: [{ name: 'SRC_LINK', url: 'https://example.com/a?x=1&y=2' }, { name: 'SRC_PLAIN' }, { name: 'SRC_BAD', url: 'javascript:alert(1)' }],
  as_of: '2026-09-01', published_by: 'u', published_at: '2026-09-02T10:00:00Z', updated_by: null, updated_at: null };
const R2 = { id: 'id-2', title: 'TITLE_TWO', topic: '', body: 'BODY_TWO', sources: [], as_of: '2026-08-01', published_by: 'u', published_at: '2026-08-02T10:00:00Z', updated_by: 'u', updated_at: '2026-08-05T10:00:00Z' };

function renderTT(s) {
  globalThis.__TT_REPORTS = s.reports; globalThis.__TT_CAN = !!s.can; globalThis.__TT_FORM = s.form || null; globalThis.__TT_PENDING = s.pending || null; globalThis.__TT_ERR = s.err || '';
  return renderToStaticMarkup(React.createElement(TechTrend));
}

// ---------- a customer (cannot manage)
let h = renderTT({ reports: [R1, R2], can: false });
check('Customer: title, topic, "As of" date and body are shown', ['TITLE_ONE', 'TOPIC_ONE', 'As of 2026-09-01', 'BODY_ONE first line'].every((t) => h.includes(t)));
check('Customer: a body containing <script>alert(1)</script> and <b>bold</b> is shown as ESCAPED TEXT', h.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && h.includes('&lt;b&gt;bold&lt;/b&gt;'));
check('Customer: the page HTML contains NO "<script" tag at all, and no real <b>bold</b> tag from the body', !h.includes('<script') && !h.includes('<b>bold'));
check('Customer: a safe source is a link: href, target="_blank" and rel="noopener noreferrer"', h.includes('<a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"'));
check('Customer: a source with a javascript: url is plain text, never a link (exactly one <a in the page)', h.includes('SRC_BAD') && !h.includes('href="javascript') && count(h, '<a ') === 1);
check('Customer: a source with no url is plain text', h.includes('SRC_PLAIN'));
check('Customer: an updated report shows its "updated" note', h.includes('updated '));
check('Customer: NO New report, Edit or Remove, and no form', !h.includes('New report') && !h.includes('>Edit<') && !h.includes('Remove') && !h.includes('Review and publish'));
check('Customer: the page says the reports are general, not tailored to their service lines', h.includes('not tailored to your own service lines'));

h = renderTT({ reports: [], can: false });
check('Empty list: "No reports yet"', h.includes('No reports yet') && !h.includes('Loading'));
h = renderTT({ reports: null, can: false });
check('Loading (reports not yet fetched): "Loading…" and NOT "No reports yet"', h.includes('Loading') && !h.includes('No reports yet'));

// ---------- AUK (can manage)
h = renderTT({ reports: [R1, R2], can: true });
check('AUK: a New report button, and an Edit and a Remove button for each of the two reports', h.includes('New report') && count(h, '>Edit</button>') === 2 && count(h, ' Remove</button>') === 2);
check('AUK: the form and the confirm panel are not shown until they are opened', !h.includes('Review and publish') && !h.includes('Publish to ALL customers?'));

const FORM = { title: '', topic: '', as_of: '2026-10-01', body: '', sources: [{ name: '', url: '' }] };
h = renderTT({ reports: [R1], can: true, form: FORM });
check('AUK new-report form: heading, guidance sentence, Review and publish, Cancel', h.includes('New report') && h.includes('Summarise in your own words, list your sources, set the as-of date, and publish nothing confidential.') && h.includes('Review and publish') && h.includes('>Cancel<'));
check('AUK new-report form: input limits are set (title 200, topic 100, text 20000, source name 200, url 2000)', ['maxLength="200"', 'maxLength="100"', 'maxLength="20000"', 'maxLength="2000"'].every((m) => h.includes(m)));
check('AUK new-report form: no confirm panel yet, and the New report BUTTON is replaced by the form', !h.includes('Publish to ALL customers?') && count(h, '<button class="btn"><svg') === 0);
h = renderTT({ reports: [R1], can: true, form: { id: 'id-1', title: 'T', topic: '', as_of: '2026-09-01', body: 'B', sources: [] } });
check('AUK edit form: heading says "Edit report", and Edit buttons are disabled while a form is open', h.includes('Edit report') && h.includes('disabled=""'));

const LONG = 'P'.repeat(1000);
let pend = { title: 'PENDING_TITLE', topic: 'PENDING_TOPIC', as_of: '2026-10-01', body: LONG, sources: [{ name: 'S1', url: 'https://a.example' }, { name: '', url: '' }] };
h = renderTT({ reports: [R1], can: true, form: pend, pending: pend });
check('AUK confirm panel: "Publish to ALL customers?" with the title, topic, as-of date and the number of named sources', h.includes('Publish to ALL customers?') && h.includes('PENDING_TITLE') && h.includes('PENDING_TOPIC') && h.includes('as of 2026-10-01') && h.includes('1 source(s)'));
// Only the PREVIEW block is checked: with the form open the page also holds the full body in the textarea, as it should.
const pvStart = h.indexOf('Text that will be published'); const pvEnd = h.indexOf('Publish to all customers</button>');
const preview = h.slice(pvStart, pvEnd);
check('AUK confirm panel: the PREVIEW is exactly the first 600 characters, then an ellipsis (not the 601st)', pvStart > -1 && pvEnd > pvStart && preview.includes('P'.repeat(600) + '…') && !preview.includes('P'.repeat(601)));
check('AUK confirm panel: the form underneath still holds the full body (all 1000 characters) for editing', h.includes('P'.repeat(1000)));
check('AUK confirm panel: "Publish to all customers" and "Back to editing" buttons; the form\'s Review button is hidden', h.includes('Publish to all customers</button>') && h.includes('Back to editing') && !h.includes('Review and publish'));
check('AUK confirm panel (new report): does not claim to replace anything', !h.includes('replaces'));
h = renderTT({ reports: [R1], can: true, form: { ...pend, id: 'id-1' }, pending: { ...pend, id: 'id-1' } });
check('AUK confirm panel (edit): says it replaces the version customers can read now', h.includes('replaces'));
h = renderTT({ reports: [R1], can: true, form: pend, pending: pend, err: 'ERRTEXT_FROM_SERVER' });
const first = h.indexOf('ERRTEXT_FROM_SERVER'); const panel = h.indexOf('Publish to ALL customers?');
check('AUK: an action error is shown above the form AND again inside the red confirm panel (twice, the second after the panel heading)', count(h, 'ERRTEXT_FROM_SERVER') === 2 && h.indexOf('ERRTEXT_FROM_SERVER', first + 1) > panel, 'count=' + count(h, 'ERRTEXT_FROM_SERVER'));
h = renderTT({ reports: [R1], can: true, form: FORM, err: 'ERRTEXT_FROM_SERVER' });
check('AUK: with no confirm panel open the error shows once (above the form)', count(h, 'ERRTEXT_FROM_SERVER') === 1);

// ---------- the sub-tab in BizPlan
const noop = () => {};
const bizProps = { svcs: [], calc: {}, goals5: {}, setGoals5: noop, goalActuals: {}, setGoalActuals: noop, roadmap: [], setRoadmap: noop, competitors: [], setCompetitors: noop,
  ideas: [], setIdeas: noop, scans: [], setScans: noop, companyName: 'Test Co', vision: 'VISION', swot: {}, pillars: [], focusAvoid: {}, bizModels: {}, ansoff: [], partners: [] };
globalThis.__BIZ_VIEW = 'techtrend'; globalThis.__TT_REPORTS = [R1]; globalThis.__TT_CAN = false; globalThis.__TT_FORM = null; globalThis.__TT_PENDING = null; globalThis.__TT_ERR = '';
h = renderToStaticMarkup(React.createElement(BizPlan, bizProps));
check('BizPlan: the "Tech Trend" sub-tab button appears once, after "AI Trend Radar"', count(h, '>Tech Trend</button>') === 1 && h.indexOf('AI Trend Radar') > -1 && h.indexOf('AI Trend Radar') < h.indexOf('>Tech Trend</button>'));
check('BizPlan: in that sub-tab the reports show and the AI Trend Radar controls do not', h.includes('TITLE_ONE') && !h.includes('Scan trends'));

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
  const build = clean(execSync(`npx vite build --config .render-check-tt/vite.config.mjs --outDir "${outDir}" --emptyOutDir`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  console.log(build.split('\n').filter((l) => /^(===|S\d|Everything)/.test(l)).join('\n'));
  console.log('');
  const out = execSync(`node "${path.join(outDir, 'entry.mjs')}"`, { cwd: root, encoding: 'utf8' });
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
