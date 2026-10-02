// Extracts the five REAL /api/generate request bodies straight from src/App.jsx so tests can't drift
// from the actual call sites. Finds every fetch("/api/generate", {...}) call, takes the argument of its
// `body: JSON.stringify(...)`, and evaluates that object literal with `prompt` bound to a placeholder.
// Throws unless exactly the five known call sites are found (campaign x2, outreach, research, trend radar).
import { readFileSync } from 'fs';

const EXPECTED = ['campaign_drafts', 'campaign_drafts', 'outreach_drafts', 'research_runs', 'trend_radar_scans'];

// Index of the ")" closing the "(" at `open`. Skips string literals and comments so punctuation inside
// them (e.g. an apostrophe in a comment) can't unbalance the match.
function matchClose(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (s[i] !== q) { if (s[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '/' && s[i + 1] === '/') { while (s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 1; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced parentheses');
}

export function realPayloads(placeholder = 'PLACEHOLDER PROMPT') {
  const src = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const out = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf('fetch("/api/generate"', from);
    if (at < 0) break;
    const b = src.indexOf('body: JSON.stringify(', at);
    if (b < 0) throw new Error('fetch("/api/generate") without a body: JSON.stringify(');
    const open = b + 'body: JSON.stringify'.length;   // index of the "("
    const literal = src.slice(open + 1, matchClose(src, open));
    const payload = new Function('prompt', `return (${literal})`)(placeholder);
    out.push({ feature: payload.feature, payload });
    from = open;
  }
  const feats = out.map((o) => o.feature).sort();
  if (out.length !== 5 || JSON.stringify(feats) !== JSON.stringify([...EXPECTED].sort())) {
    throw new Error(`Expected exactly the 5 known call sites, found ${out.length}: ${feats.join(', ')}`);
  }
  return out;
}
