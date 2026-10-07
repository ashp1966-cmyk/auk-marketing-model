// Stubbed RENDER test of the real Billing component's "Current status" line (same harness pattern as
// tech-trend-render-test.mjs). The status fetch never runs under server rendering, so the initial status/loading come
// from globals via two single-match build-time substitutions (in memory only; src/App.jsx is never modified).
//
// Usage: node scripts/billing-status-label-render-test.mjs
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harness = path.join(root, '.render-check-bill');
const outDir = mkdtempSync(path.join(os.tmpdir(), 'bill-render-'));

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
    name: 'bill-render-substitutions',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/App.jsx')) return null;
      let out = code;
      console.log('=== build-time substitutions applied to src/App.jsx (in memory only) ===');
      for (const s of SUBSTITUTIONS) {
        if (s.kind === 'append') { out += s.text; console.log(s.id + ': ' + s.desc); continue; }
        const first = out.indexOf(s.from);
        // Billing's own line only: the first match after "function Billing(" (other components use other names).
        const at = out.indexOf('function Billing(');
        const hits = out.split(s.from).length - 1;
        if (hits < 1 || first < at) throw new Error(s.id + ' did not match inside Billing, hits=' + hits);
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
const render = (status) => { globalThis.__BILL_STATUS = status; return renderToStaticMarkup(React.createElement(Billing, { companyName: 'Test Co' })); };
// The status line: "Current status: <strong>X</strong> · plan Y"
const line = (h) => (h.match(/Current status: <strong>(.*?)<\/strong>(?:<span> · plan (.*?)<\/span>)?/) || []);

let h = render({ billingStatus: 'trialing', planCode: 'internal', paidUntil: null });
let m = line(h);
check('Internal tenant (trialing + plan_code internal): the line reads "Internal" and "plan internal"', m[1] === 'Internal' && m[2] === 'internal', JSON.stringify(m.slice(1)));
check('Internal tenant: the word "Trial" is not shown in the status line', !/Current status: <strong>Trial/.test(h));

h = render({ billingStatus: 'trialing', planCode: null, paidUntil: null });
m = line(h);
check('Trialing tenant (no plan): the line still reads "Trial", with no plan text', m[1] === 'Trial' && m[2] === undefined, JSON.stringify(m.slice(1)));

h = render({ billingStatus: 'active', planCode: 'PLN_ek4cmy74mxanywt', paidUntil: null });
m = line(h);
check('Paid tenant: still "Active" with its plan name "Starter"', m[1] === 'Active' && m[2] === 'Starter', JSON.stringify(m.slice(1)));

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
  const build = clean(execSync(`npx vite build --config .render-check-bill/vite.config.mjs --outDir "${outDir}" --emptyOutDir`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
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
