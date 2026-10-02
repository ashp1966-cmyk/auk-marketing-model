// Tests the REAL helper functions in src/App.jsx (extractJson, jsonErrorOffset, logParseFailure, recordUsage),
// pulled out of the source by name and evaluated with stubbed console / fetch / JSON. No browser, no network,
// no Anthropic.
import { appSource, extractFunction } from './lib/extract-app-source.mjs';

const src = appSource();
const code = ['jsonErrorOffset', 'extractJson', 'logParseFailure', 'recordUsage'].map((n) => extractFunction(src, n)).join('\n\n');
function load({ consoleStub, fetchStub, jsonStub } = {}) {
  return new Function('console', 'fetch', 'JSON', `${code}\nreturn { jsonErrorOffset, extractJson, logParseFailure, recordUsage };`)(
    consoleStub ?? console,
    fetchStub ?? (async () => { throw new Error('unexpected fetch'); }),
    jsonStub ?? JSON,
  );
}

let failures = 0;
const check = (name, pass, detail = '') => { if (!pass) failures++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const thrown = (fn) => { try { fn(); } catch (e) { return e; } return null; };

// ---- jsonErrorOffset: every engine wording we know about --------------------------------------------------
{
  const { jsonErrorOffset } = load();
  const big = '{' + 'x'.repeat(7000) + '}';
  check('Chrome/Node "at position N (line L column C)" -> N', jsonErrorOffset("Expected ',' or ']' after array element in JSON at position 6982 (line 1 column 6983)", big) === 6982);
  check('Chrome/Node older wording "Unexpected token } in JSON at position 12" -> 12', jsonErrorOffset('Unexpected token } in JSON at position 12', big) === 12);
  check('Firefox "at line 1 column 6983 of the JSON data" -> 6982', jsonErrorOffset("JSON.parse: expected ',' or ']' after array element at line 1 column 6983 of the JSON data", big) === 6982);
  const multi = '{\n  "a": [1 2]\n}';
  const off = jsonErrorOffset("JSON.parse: expected ',' or ']' after array element at line 2 column 11 of the JSON data", multi);
  check('Firefox multi-line: line 2 column 11 -> offset 12, which is the offending "2"', off === 12 && multi[off] === '2', `offset=${off}`);
  check('Chrome "is not valid JSON" wording (no location) -> null', jsonErrorOffset(`Unexpected token 'x', "{"a":xx}" is not valid JSON`, big) === null);
  check('Safari wording (no location) -> null', jsonErrorOffset("JSON Parse error: Expected ',' or ']' after array element", big) === null);
  check('Firefox line beyond the text -> null', jsonErrorOffset('at line 9 column 1 of the JSON data', multi) === null);
  check('Firefox column beyond the text -> null', jsonErrorOffset('at line 1 column 99 of the JSON data', '{}') === null);
  check('Firefox column 0 -> null', jsonErrorOffset('at line 1 column 0 of the JSON data', '{}') === null);
  check('empty / unrelated message -> null', jsonErrorOffset('', big) === null && jsonErrorOffset('something else', big) === null);
}

// ---- extractJson with REAL JSON.parse errors --------------------------------------------------------------
{
  const { extractJson } = load();
  const good = (n) => `{"trend":"t${n}","detail":"d${n}"}`;
  const reply = 'Here is the scan. ' + '{"summary":"s","trends":[' + good(1) + ',' + good(2) + ' ' + good(3) + ']}' + ' trailing words';
  const err = thrown(() => extractJson(reply));
  check('missing comma between array elements: throws', err instanceof Error);
  check('  ...the original JSON.parse message is unchanged', /Expected|Unexpected/.test(err?.message || ''));
  check('  ...rawReply is the full reply text', err?.rawReply === reply);
  const shortSlice = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  check('  ...errorPosition is exactly the offset of the offending 3rd element (into the extracted JSON)', err?.errorPosition === shortSlice.indexOf(good(3)), `errorPosition=${err?.errorPosition} expected=${shortSlice.indexOf(good(3))}`);
  check('  ...around is at most 200 chars and contains the broken spot', typeof err?.around === 'string' && err.around.length <= 200 && err.around.includes(good(3)));

  const parts = Array.from({ length: 60 }, (_, i) => good(i + 1));
  const longReply = '{"summary":"s","trends":[' + parts.slice(0, 40).join(',') + ' ' + parts.slice(40).join(',') + ']}';
  const e2 = thrown(() => extractJson(longReply));
  check('long reply, error deep inside: errorPosition is exactly the offset of the offending 41st element', e2?.errorPosition === longReply.indexOf(good(41)), `errorPosition=${e2?.errorPosition} expected=${longReply.indexOf(good(41))}`);
  check('  ...around is exactly 200 chars and straddles the broken join', e2?.around?.length === 200 && e2.around.includes(`${good(40)} ${good(41)}`));
  check('  ...rawReply is the whole long reply', e2?.rawReply === longReply);

  const none = thrown(() => extractJson('no braces here at all'));
  check('no JSON object: still throws its message, with rawReply attached', /No JSON object/.test(none?.message) && none?.rawReply === 'no braces here at all');
  const open = thrown(() => extractJson('prefix {"a":[1,2'));
  check('unterminated object: still throws its message, with rawReply attached', /Unterminated/.test(open?.message) && open?.rawReply === 'prefix {"a":[1,2');
  const ok = extractJson('noise {"summary":"s","trends":[{"a":1}]} noise');
  check('valid reply still parses to the same object, no extra properties', JSON.stringify(ok) === '{"summary":"s","trends":[{"a":1}]}');
}

// ---- extractJson when the engine gives no "position N": Firefox / Chrome-new / Safari wordings -------------
{
  const mk = (message) => load({ jsonStub: { parse: () => { throw new SyntaxError(message); } } }).extractJson;
  const text = 'xx {"a":[1, 2 3]} yy';
  const slice = '{"a":[1, 2 3]}';
  const ff = thrown(() => mk("JSON.parse: expected ',' or ']' after array element at line 1 column 12 of the JSON data")(text));
  check('Firefox wording: line/column converted to an offset into the slice', ff?.errorPosition === 11 && slice[ff.errorPosition] === '3', `errorPosition=${ff?.errorPosition}`);
  check('  ...around is built from that offset and contains the slice', ff?.around === slice && ff?.rawReply === text);
  const ch = thrown(() => mk(`Unexpected token '3', "{"a":[1, 2 3]}" is not valid JSON`)(text));
  check('Chrome "is not valid JSON" wording: errorPosition null, around null, rawReply still kept', ch?.errorPosition === null && ch?.around === null && ch?.rawReply === text);
  check('  ...the engine message is untouched', ch?.message.includes('is not valid JSON'));
  const sf = thrown(() => mk("JSON Parse error: Expected ',' or ']' after array element")(text));
  check('Safari wording: errorPosition null, rawReply kept', sf?.errorPosition === null && sf?.rawReply === text);
}

// ---- logParseFailure: ONLY position + the 200-char window --------------------------------------------------
{
  const calls = [];
  const L = load({ consoleStub: { error: (...a) => calls.push(a), warn: () => {}, log: () => {} } });
  const e = Object.assign(new Error('MSG-SHOULD-NOT-APPEAR Expected something'), {
    rawReply: 'FULLREPLY ' + 'z'.repeat(500) + ' TAILMARKER', errorPosition: 250, around: 'a'.repeat(200),
  });
  L.logParseFailure('trend-radar', e);
  const flat = JSON.stringify(calls);
  check('exactly one console.error call', calls.length === 1);
  check('logs the label and the position', flat.includes('[trend-radar]') && flat.includes('position 250'));
  check('logs the 200-char window and nothing around it', calls[0]?.[1] === '…' + 'a'.repeat(200) + '…');
  check('nothing else from the reply (no FULLREPLY, TAILMARKER or the z-run)', !flat.includes('FULLREPLY') && !flat.includes('TAILMARKER') && !flat.includes('zzzzzzzzzz'));
  check('does not log e.message', !flat.includes('MSG-SHOULD-NOT-APPEAR'));
  calls.length = 0;
  L.logParseFailure('research', Object.assign(new Error('m'), { rawReply: 'R', errorPosition: null, around: null }));
  check('unknown position: says "position unknown", logs no window', calls.length === 1 && JSON.stringify(calls).includes('position unknown') && calls[0][1] === '');
}

// ---- recordUsage: fresh token every time, never throws, logs route + status only ---------------------------
{
  function run(fetchImpl, getTokenImpl) {
    const warns = []; const tokenCalls = []; const fetchCalls = [];
    const getToken = getTokenImpl ?? (async (opts) => { tokenCalls.push(opts); return `TOKENMARKER-${tokenCalls.length}`; });
    const fetchStub = async (url, init) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };
    const R = load({ consoleStub: { warn: (...a) => warns.push(a), error: () => {}, log: () => {} }, fetchStub });
    return { R, warns, tokenCalls, fetchCalls, getToken };
  }
  const okRes = async () => ({ ok: true, status: 200 });

  let t = run(okRes);
  let r = await t.R.recordUsage(t.getToken, '/api/usage/trend-radar-scan');
  check('200: returns true and does not warn', r === true && t.warns.length === 0);
  check('  ...asked Clerk for a FRESH token (skipCache: true)', t.tokenCalls.length === 1 && t.tokenCalls[0]?.skipCache === true);
  check('  ...POSTed to the route with that token', t.fetchCalls[0]?.url === '/api/usage/trend-radar-scan' && t.fetchCalls[0].init.method === 'POST' && t.fetchCalls[0].init.headers.Authorization === 'Bearer TOKENMARKER-1');
  await t.R.recordUsage(t.getToken, '/api/usage/campaign-draft');
  check('second call fetches a second fresh token (never reuses one)', t.tokenCalls.length === 2 && t.tokenCalls.every((o) => o?.skipCache === true) && t.fetchCalls[1].init.headers.Authorization === 'Bearer TOKENMARKER-2');

  for (const status of [401, 402, 500]) {
    t = run(async () => ({ ok: false, status }));
    r = await t.R.recordUsage(t.getToken, '/api/usage/campaign-draft');
    const flat = JSON.stringify(t.warns);
    check(`${status}: returns false, does not throw, warns once with route and status only`, r === false && t.warns.length === 1 && flat.includes('/api/usage/campaign-draft') && flat.includes(String(status)));
    check(`  ...the ${status} warning carries no token`, !flat.includes('TOKENMARKER'));
  }
  t = run(async () => { throw new TypeError('Failed to fetch'); });
  r = await t.R.recordUsage(t.getToken, '/api/usage/trend-radar-scan');
  check('network failure: returns false, does not throw, warns once, no token or error text in it', r === false && t.warns.length === 1 && !JSON.stringify(t.warns).includes('TOKENMARKER') && !JSON.stringify(t.warns).includes('Failed to fetch'));
  t = run(okRes, async () => { throw new Error('clerk down'); });
  r = await t.R.recordUsage(t.getToken, '/api/usage/trend-radar-scan');
  check('getToken failure: returns false, does not throw, no request sent', r === false && t.warns.length === 1 && t.fetchCalls.length === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
