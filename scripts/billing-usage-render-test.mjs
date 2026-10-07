// Stubbed RENDER test of the real Billing component's usage meters (Phase 2 b); same harness pattern as
// billing-status-label-render-test.mjs. The status fetch never runs under server rendering, so the initial status and
// loading come from globals via two single-match build-time substitutions (in memory only; src/App.jsx is never modified).
//
// Usage: node scripts/billing-usage-render-test.mjs
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harness = path.join(root, '.render-check-usage');
const outDir = mkdtempSync(path.join(os.tmpdir(), 'usage-render-'));

const CONFIG = String.raw`import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));

const SUBSTITUTIONS = [
  { id: 'S1', desc: 'append "export { Billing };" so the real component can be imported', kind: 'append', text: '\nexport { Billing };\n' },
  { id: 'S2', desc: "Billing's initial status comes from globalThis.__BILL_STATUS instead of null",
    from: 'const [status, setStatus] = useState(null);', to: 'const [status, setStatus] = useState(globalThis.__BILL_STATUS ?? null);' },
  { id: 'S3', desc: "Billing's initial loading flag is false (the fetch never runs under server rendering)",
    from: 'const [loading, setLoading] = useState(true);', to: 'const [loading, setLoading] = useState(false);' },
];

function substitutionPlugin() {
  return {
    name: 'usage-render-substitutions',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/App.jsx')) return null;
      let out = code;
      console.log('=== build-time substitutions applied to src/App.jsx (in memory only) ===');
      for (const s of SUBSTITUTIONS) {
        if (s.kind === 'append') { out += s.text; console.log(s.id + ': ' + s.desc); continue; }
        const first = out.indexOf(s.from);
        const at = out.indexOf('function Billing(');
        if (first < 0 || first < at) throw new Error(s.id + ' did not match inside Billing');
        out = out.slice(0, first) + s.to + out.slice(first + s.from.length);
        console.log(s.id + ': ' + s.desc + '  [replaced the first match, inside Billing]');
      }
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
import { Billing } from '../src/App.jsx';

let failures = 0;
function check(name, pass, detail) { if (!pass) failures++; console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (!pass && detail ? '  -- ' + detail : '')); }
const count = (h, s) => h.split(s).length - 1;
const render = (status) => { globalThis.__BILL_STATUS = status; return renderToStaticMarkup(React.createElement(Billing, { companyName: 'Test Co' })); };

const LABELS = { research_runs: 'Research runs', trend_radar_scans: 'Trend Radar scans', campaign_drafts: 'Campaign drafts', outreach_drafts: 'Outreach email drafts' };
// Server-shaped usage objects (the render only displays what the server decided).
const paid = (used = {}, limits = {}, over = {}) => ({
  kind: 'active', window: 'month', planName: 'Starter', resetsOn: '2026-11-01', resetsText: '1 November', trialEndsAt: null,
  features: Object.fromEntries(Object.keys(LABELS).map((f) => [f, { label: LABELS[f], used: used[f] ?? 0, limit: limits[f] ?? 10, enabled: over[f] ?? true }])),
});
const trial = (used = {}, limits = {}) => ({
  kind: 'trialing', window: 'total', planName: null, resetsOn: null, resetsText: null, trialEndsAt: '2026-10-14T09:00:00.000Z',
  features: Object.fromEntries(Object.keys(LABELS).map((f) => [f, { label: LABELS[f], used: used[f] ?? 0, limit: limits[f] ?? 2, enabled: true }])),
});
const act = (usage) => ({ billingStatus: 'active', planCode: 'PLN_ek4cmy74mxanywt', paidUntil: null, cancelAtPeriodEnd: false, hasSubscriptionOnFile: true, usage });
const barOf = (h, label) => { const i = h.indexOf('aria-label="' + label + '"'); return i < 0 ? '' : h.slice(Math.max(0, i - 40), i + 260); };

// ---------- active
let h = render(act(paid({ research_runs: 3 })));
check('Active: card title names the plan from the server, and the four meters show', h.includes('Usage this month (Starter plan)') && count(h, 'role="progressbar"') === 4 && Object.values(LABELS).every((l) => h.includes(l)));
check('Active: "Research runs" reads "3 of 10 this month" and the reset line reads "Resets on 1 November."', h.includes('3 of 10 this month') && h.includes('Resets on 1 November.'));
check('Active: the research bar is a real progress bar with min 0, max 10, now 3, and 30% wide', /aria-valuemin="0"/.test(barOf(h, 'Research runs')) && /aria-valuemax="10"/.test(barOf(h, 'Research runs')) && /aria-valuenow="3"/.test(barOf(h, 'Research runs')) && barOf(h, 'Research runs').includes('width:30%'));
check('Active: nothing about reaching a limit or using most of the allowance is shown at 3 of 10', !h.includes('limit reached') && !h.includes('most of your allowance') && !h.includes('reached your limit'));
check('Active: the usage card sits after the status line and before the first plan card', h.indexOf('Current status') < h.indexOf('Usage this month') && h.indexOf('Usage this month') < h.indexOf('<h4 style="margin-top:0">Startup'));

// ---------- trialing
h = render({ billingStatus: 'trialing', planCode: null, paidUntil: null, usage: trial({ research_runs: 1 }) });
check('Trialing: title "Your trial usage", "1 of 2 used in your trial", and the trial end date line', h.includes('Your trial usage') && h.includes('1 of 2 used in your trial') && h.includes('Your trial ends on '));
check('Trialing: no monthly wording and no "Resets on"', !h.includes('this month') && !h.includes('Resets on'));

// ---------- no card
h = render({ billingStatus: 'trialing', planCode: 'internal', paidUntil: null, usage: null });
check('Internal (usage null): no usage card, "Internal account" still shown', !h.includes('Usage this month') && !h.includes('Your trial usage') && !h.includes('role="progressbar"') && h.includes('Internal account'));
h = render({ billingStatus: 'cancelled', planCode: 'PLN_ek4cmy74mxanywt', paidUntil: null, usage: null });
check('Cancelled (usage null): no usage card, resubscribe message still shown', !h.includes('Usage this month') && !h.includes('role="progressbar"') && h.includes('Choose a plan below to resubscribe'));
h = render(act({ kind: 'unrecognized', window: null, planName: null, resetsOn: null, resetsText: null, trialEndsAt: null, features: null }));
check('Unknown plan: the one-line message with the support address, no meters', /We can(&#x27;|')t show your usage because your plan isn(&#x27;|')t recognised\./.test(h) && h.includes('sales@auk-maritime.com') && !h.includes('role="progressbar"'));

// ---------- thresholds (limit 10)
const at = (n, over) => render(act(paid({ research_runs: n }, {}, over)));
h = at(7);
check('0.7: normal teal bar, no note', barOf(h, 'Research runs').includes('var(--teal)') && !h.includes('most of your allowance'));
h = at(8);
check('0.8: brass bar and ONE calm note "You\'ve used most of your allowance for research runs. It resets on 1 November."', barOf(h, 'Research runs').includes('var(--brass)') && h.includes('used most of your allowance for research runs.') && h.includes('It resets on 1 November.') && count(h, 'most of your allowance') === 1 && !h.includes('limit reached'));
h = at(9);
check('0.9: still brass with the same note, not "limit reached"', barOf(h, 'Research runs').includes('var(--brass)') && count(h, 'most of your allowance') === 1 && !h.includes('limit reached'));
h = at(10);
check('1.0: "10 of 10 this month, limit reached", full brass bar, and the limit note with the reset date and "To change plan, email"',
  h.includes('10 of 10 this month, limit reached') && barOf(h, 'Research runs').includes('width:100%') && barOf(h, 'Research runs').includes('var(--brass)')
  && h.includes('reached your limit for research runs. It resets on 1 November. To change plan, email'));
h = at(12);
check('Over the limit (a small overshoot): bar capped at 100% and aria-valuenow capped at the limit (10)', barOf(h, 'Research runs').includes('width:100%') && /aria-valuenow="10"/.test(barOf(h, 'Research runs')));
h = render({ billingStatus: 'trialing', planCode: null, paidUntil: null, usage: trial({ trend_radar_scans: 1 }, { trend_radar_scans: 1 }) });
check('Trial at 1 of 1 (singular cap): "1 of 1 used in your trial, trial limit reached" and "Subscribe to continue."', h.includes('1 of 1 used in your trial, trial limit reached') && h.includes('reached your trial limit for trend radar scans. Subscribe to continue.'));

// ---------- switch off, safety
h = render(act(paid({}, {}, { trend_radar_scans: false })));
check('Trend Radar switched off: "Not switched on for your account" and no bar for that row (3 bars)', h.includes('Not switched on for your account') && count(h, 'role="progressbar"') === 3 && barOf(h, 'Trend Radar scans') === '');
h = render(act({ ...paid(), features: { ...paid().features, research_runs: { label: '<img src=x onerror=alert(1)>', used: 1, limit: 10, enabled: true } } }));
check('A server label containing markup is shown as escaped text, never a real tag', h.includes('&lt;img src=x onerror=alert(1)&gt;') && !h.includes('<img'));
h = render(act(paid({ research_runs: 10, campaign_drafts: 9 })));
check('No alarm styling anywhere on the page: no red token, no warning symbol', !h.includes('--red') && !h.includes('#DC2626') && !/[⚠❗\u{1F6A8}]/u.test(h));

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
  const build = clean(execSync(`npx vite build --config .render-check-usage/vite.config.mjs --outDir "${outDir}" --emptyOutDir`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  console.log(build.split('\n').filter((l) => /^(===|S\d)/.test(l)).join('\n'));
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
