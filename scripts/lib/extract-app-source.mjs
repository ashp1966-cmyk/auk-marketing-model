// Helpers for tests that need to look at src/App.jsx without a browser or a React runtime:
// read the source, pull out one top-level function by name (brace-matched, skipping strings,
// template literals and comments), so the REAL code can be evaluated with stubs.
import { readFileSync } from 'fs';

// APP_SOURCE_PATH lets a test be pointed at a modified COPY (used to prove the failure messages name the
// right call site); it defaults to the real src/App.jsx.
export const appSource = () => readFileSync(process.env.APP_SOURCE_PATH || new URL('../../src/App.jsx', import.meta.url), 'utf8');

function skipString(s, i) {            // i is at the opening quote; returns index of the closing quote
  const q = s[i];
  i++;
  while (s[i] !== q) { if (s[i] === '\\') i++; i++; }
  return i;
}

// Index of the bracket that closes the "(" or "{" at s[open]. Skips strings, template literals and comments.
export function matchPair(s, open) {
  const o = s[open];
  const c = o === '(' ? ')' : o === '{' ? '}' : null;
  if (!c) throw new Error(`matchPair: s[${open}] is not ( or {`);
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(s, i); continue; }
    if (ch === '/' && s[i + 1] === '/') { while (s[i] !== '\n') i++; continue; }
    if (ch === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 1; continue; }
    if (ch === o) depth++;
    else if (ch === c) { depth--; if (depth === 0) return i; }
  }
  throw new Error('matchPair: unbalanced');
}

// Source text of `function name(...) {...}` (or `async function name`), exactly as written in App.jsx.
export function extractFunction(src, name) {
  const m = new RegExp(`(?:async\\s+)?function ${name}\\s*\\(`).exec(src);
  if (!m) throw new Error(`function ${name} not found in src/App.jsx`);
  const parenOpen = m.index + m[0].length - 1;
  const parenClose = matchPair(src, parenOpen);
  const braceOpen = src.indexOf('{', parenClose);
  return src.slice(m.index, matchPair(src, braceOpen) + 1);
}
