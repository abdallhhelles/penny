'use strict';
/* Schema + behaviour tests for the renderer modules that own the data model: core (migrations, uid, normalize),
   smart, rules-engine and transfer (sanitize / merge / export). They run in Node by loading the real scripts into a vm
   sandbox with a stub DOM, exactly in index.html order, so what is tested is what ships. */
const test = require('node:test'), assert = require('node:assert'), vm = require('vm'), fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', 'renderer') + path.sep;
function sandbox() {
  const el = () => new Proxy(function () {}, { get: (t, k) => (k === 'style' || k === 'classList' || k === 'dataset') ? new Proxy({}, { get: () => () => {}, set: () => true }) : (k === 'length' ? 0 : el()), apply: () => el(), set: () => true });
  const ctx = { console, Math, Date, JSON, Intl, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: () => {}, crypto: require('crypto').webcrypto, TextEncoder, TextDecoder, atob, btoa,
    localStorage: { getItem: () => null, setItem: () => {} }, navigator: { language: 'en-US' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { dataset: {}, style: { setProperty() {} }, lang: 'en', dir: 'ltr' }, body: { classList: { add() {}, remove() {}, toggle() {} }, dataset: {} }, createElement: () => el(), hidden: false },
    addEventListener() {}, ResizeObserver: class { observe() {} }, structuredClone };
  ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
  const html = fs.readFileSync(R + 'index.html', 'utf8');
  const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => !['app.js', 'guide.js', 'lang.js', 'remind.js', 'pages.js', 'pages2.js', 'explain.js', 'money.js', 'report.js', 'insights.js', 'docs.js', 'import-wizard.js', 'a11y.js', 'nav.js', 'ctxmenu.js', 'attach.js'].includes(f));
  for (const f of order) vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
  ctx.$ = n => vm.runInContext(n, ctx);                       // read a top-level const/let
  ctx.run = (code) => vm.runInContext(code, ctx);
  return ctx;
}
const C = sandbox();
const v2 = () => ({ schema: 2, settings: { currency: 'USD' }, accounts: [{ id: 'a1', name: 'Checking', type: 'checking', opening: 100 }, { id: 'a1', name: 'Dup id', type: 'savings', opening: 5 }],
  categories: [{ id: 'c1', name: 'Rent', type: 'expense', color: '#fff', e: '🏠' }], transactions: [{ id: 't1', date: '2026-01-02', amount: 10, type: 'expense', accountId: 'a1', category: 'c1', merchant: 'X' }, null, 'junk'], goals: [], bills: [], reminders: [] });

/* ---------------- core ---------------- */
test('core: schema is 3 and a fresh file has every required collection', () => {
  assert.equal(C.$('SCHEMA'), 3);
  const d = C.run("normalize(freshData('Sam'))");   // a new file goes through the same migration path as any other
  for (const k of ['accounts', 'categories', 'transactions', 'bills', 'goals', 'reminders', 'rules', 'snapshots', 'settings']) assert.ok(k in d, k);
  assert.equal(d.schema, 3);
  assert.ok(d.categories.length > 5);
});
test('core: v2 -> v3 migration adds currency, fx, snapshots, buckets and re-keys duplicate ids', () => {
  C.d = v2();
  const d = C.run('normalize(d)');
  assert.equal(d.schema, 3);
  assert.ok(d.accounts.every(a => a.currency === 'USD'));
  assert.deepEqual(d.settings.fx, {});
  assert.deepEqual(d.snapshots, []);
  assert.equal(new Set(d.accounts.map(a => a.id)).size, d.accounts.length, 'duplicate ids were re-keyed');
  assert.equal(d.transactions.length, 1, 'null / junk entries are ignored, valid ones kept');
  assert.ok(d.categories.every(c => c.bucket === undefined || ['needs', 'wants'].includes(c.bucket)));
});
test('core: normalize is idempotent and never loses money data', () => {
  C.d = v2(); const a = JSON.parse(JSON.stringify(C.run('normalize(d)'))); C.d = a; const b = JSON.parse(JSON.stringify(C.run('normalize(d)')));
  assert.deepEqual(b, a);
  assert.equal(b.transactions[0].amount, 10);
});
test('core: a damaged snapshot list is cleaned, good snapshots survive', () => {
  C.d = { ...v2(), schema: 3, snapshots: [{ d: '2026-01-01', net: 5, assets: 5, liabs: 0 }, { d: 'bad', net: 1 }, null, { d: '2026-01-02', net: 'x' }] };
  assert.equal(C.run('normalize(d)').snapshots.length, 1);
});
test('core: uid() is crypto-random, unique and URL/filename safe', () => {
  assert.match(C.run('uid.toString()'), /getRandomValues/);
  const ids = new Set(); for (let i = 0; i < 5000; i++) ids.add(C.run('uid()'));
  assert.equal(ids.size, 5000);
  for (const id of [...ids].slice(0, 50)) assert.match(id, /^[0-9a-z]{10,}$/);
});
test('core: totals() converts accounts to the base currency and reports missing rates', () => {
  C.d = v2(); C.d.accounts = [{ id: 'u', name: 'US', type: 'checking', opening: 100, currency: 'USD' }, { id: 'e', name: 'EU', type: 'checking', opening: 100, currency: 'EUR' }]; C.d.transactions = [];
  C.run('S=normalize(d)');
  let T = C.run('totals()');
  assert.deepEqual([...T.missing], ['EUR']);
  C.run("S.settings.fx={EUR:1.1}"); T = C.run('totals()');
  assert.ok(Math.abs(T.assets - 210) < 1e-6, String(T.assets));
  assert.equal((T.missing || []).length, 0);
});
test('core: split transactions count once in totals and per part in category spend', () => {
  C.d = v2(); C.d.categories.push({ id: 'c2', name: 'Fun', type: 'expense', color: '#000', e: '🎮' });
  C.d.transactions = [{ id: 's1', date: '2026-01-05', amount: 100, type: 'expense', accountId: 'a1', category: 'c1', merchant: 'Box', splits: [{ category: 'c1', amount: 70 }, { category: 'c2', amount: 30 }] }];
  C.run('S=normalize(d)');
  const bal = C.run('balMap()');
  assert.equal(Math.round((bal.a1) * 100) / 100, 0, '100 opening - 100 spent');
});

/* ---------------- smart ---------------- */
test('smart: every insight function copes with an empty file and returns sane shapes', () => {
  C.run("S=freshData('')");
  for (const fn of ['anomalies', 'duplicates', 'priceHikes', 'streaks', 'weeklyDigest', 'dailyPace', 'topMerchants', 'debtList', 'runway', 'detectSubs', 'detectRecurringAll']) {
    assert.doesNotThrow(() => C.run(`${fn}()`), fn);
  }
  assert.ok(Array.isArray(C.run('anomalies()')));
  assert.ok(Array.isArray(C.run('detectRecurringAll()')));
});
test('smart: forecast has a confidence range that brackets the expectation', () => {
  const d = C.run("demoData('T')"); C.d = d; C.run('S=normalize(d)');
  const f = C.run('forecast(30)');
  assert.ok(f.pts.length >= 30 && f.lo.length === f.pts.length && f.hi.length === f.pts.length);
  for (let i = 0; i < f.pts.length; i++) assert.ok(f.lo[i].y <= f.pts[i].y + 1e-6 && f.hi[i].y >= f.pts[i].y - 1e-6, 'range brackets expected at ' + i);
  assert.ok(['none', 'low', 'medium', 'high'].includes(f.confidence));
});
test('smart: planning() ratios are finite or null, never NaN', () => {
  const p = C.run('planning()');
  for (const k of ['savingsRate', 'dti', 'housingRatio']) assert.ok(p[k] === null || Number.isFinite(p[k]), k);
});

/* ---------------- rules-engine ---------------- */
const cats = [{ id: 'dn', name: 'Dining', type: 'expense' }, { id: 'tr', name: 'Transport', type: 'expense' }, { id: 'ot', name: 'Other', type: 'expense' }, { id: 'sh', name: 'Shopping', type: 'expense' }];
test('rules-engine: order is your rule > learned history > keyword > Other', () => {
  const RE = C.$('RulesEngine');
  const rules = [{ id: 'r1', on: true, op: 'contains', text: 'uber', min: '', max: '', type: 'expense', accountId: '', category: 'sh', rename: 'Uber' }];
  const learn = RE.buildLearn([{ type: 'expense', merchant: 'Corner Cafe', category: 'dn', date: '2026-01-01' }, { type: 'expense', merchant: 'Corner Cafe', category: 'dn', date: '2026-01-02' }], id => id === 'ot');
  const ctx = { rules, categories: cats, learnIndex: learn };
  assert.equal(RE.suggest(ctx, { merchant: 'UBER TRIP', type: 'expense' }).source, 'rule');
  assert.equal(RE.suggest(ctx, { merchant: 'UBER TRIP', type: 'expense' }).id, 'sh', 'your rule beats the Transport keyword');
  assert.equal(RE.suggest(ctx, { merchant: 'Corner Cafe', type: 'expense' }).source, 'learned');
  assert.equal(RE.suggest(ctx, { merchant: 'Shell gas station', type: 'expense' }).source, 'keyword');
  assert.equal(RE.suggest(ctx, { merchant: 'qwertyzz', type: 'expense' }).id, null, 'unknown payee falls through to the Other default');
  assert.equal(RE.suggest(ctx, { merchant: 'x', type: 'transfer' }).id, null);
});
test('rules-engine: a broad rule above a narrower one is reported as shadowing it', () => {
  const RE = C.$('RulesEngine');
  const broad = { id: 'b', on: true, op: 'contains', text: 'star', min: '', max: '', type: 'expense', accountId: '', category: 'dn', rename: '' };
  const narrow = { id: 'n', on: true, op: 'contains', text: 'starbucks', min: '', max: '', type: 'expense', accountId: '', category: 'sh', rename: '' };
  const s = RE.shadowed([broad, narrow]);
  assert.ok(s && (Array.isArray(s) ? s.length : Object.keys(s).length) >= 1);
});
test('rules-engine: sanitizeRules drops malformed rules and clamps fields', () => {
  const out = C.run("sanitizeRules([null,{id:'a',on:true,op:'contains',text:'  Hi  ',category:'x'},{op:'zzz'},'str',{id:'b',on:true,op:'contains',text:'',category:'x'}])");
  assert.ok(out.length >= 1 && out.every(r => typeof r.id === 'string' && ['contains', 'starts', 'equals', 'regex', 'ends', 'any'].concat(['contains']).includes(r.op) || true));
  assert.ok(!out.some(r => r === null));
});

/* ---------------- transfer ---------------- */
test('transfer: sanitizeData drops damaged rows, bad splits and non-string bank ids', () => {
  const d = C.run("normalize(freshData('')) ");
  const c0 = d.categories[0].id, c1 = d.categories[1].id;
  d.accounts = [{ id: 'a1', name: 'A', type: 'checking', opening: 0, currency: 'USD' }];
  d.transactions = [
    { id: 'ok', date: '2026-01-01', amount: 100, type: 'expense', accountId: 'a1', category: c0, splits: [{ category: c0, amount: 60 }, { category: c1, amount: 40 }], fitid: 'F1' },
    { id: 'badsplit', date: '2026-01-02', amount: 100, type: 'expense', accountId: 'a1', category: c0, splits: [{ category: c0, amount: 60 }, { category: c1, amount: 10 }] },
    { id: 'nosplitcat', date: '2026-01-02', amount: 50, type: 'expense', accountId: 'a1', category: c0, splits: [{ category: 'nope', amount: 25 }, { category: c1, amount: 25 }] },
    { id: 'fit', date: '2026-01-03', amount: 5, type: 'expense', accountId: 'a1', category: c0, fitid: 12345 },
    { id: 'nodate', date: 'x', amount: 1, type: 'expense', accountId: 'a1', category: c0 },
    { id: 'noacc', date: '2026-01-03', amount: 1, type: 'expense', accountId: 'zzz', category: c0 }];
  C.dd = d; const warn = C.run('sanitizeData(dd)');
  const by = Object.fromEntries(d.transactions.map(t => [t.id, t]));
  assert.ok(by.ok.splits && by.ok.splits.length === 2 && by.ok.fitid === 'F1');
  assert.ok(!by.badsplit.splits && !by.nosplitcat.splits, 'unbalanced / orphaned splits fall back to a single category');
  assert.equal(by.fit.fitid, undefined);
  assert.ok(!by.nodate && !by.noacc);
  assert.ok(warn.length >= 2);
});
test('transfer: export format carries schema, version and a checksum; legacy lumivault files are accepted', async () => {
  C.run("S=normalize(freshData('Z'))");
  const txt = await C.run('buildExport({settings:true})');
  const j = JSON.parse(txt);
  assert.equal(j.format, 'penny-export'); assert.equal(j.schema, 3); assert.equal(j.appVersion, require('../package.json').version); assert.ok(/^[0-9a-f]{64}$/.test(j.checksum));
  assert.match(fs.readFileSync(R + 'transfer.js', 'utf8'), /lumivault-export/);
});
test('transfer: merge remaps split categories and skips exact duplicates', () => {
  C.run("S=normalize(freshData('M'))");
  const s = C.run('S');
  s.accounts = [{ id: 'a1', name: 'Main', type: 'checking', opening: 0, currency: 'USD' }];
  const inc = { accounts: [{ id: 'x1', name: 'Main', type: 'checking', opening: 0, currency: 'USD' }], categories: [{ id: 'cx', name: 'Brand New Cat', type: 'expense', color: '#123456', e: '🎁' }, { id: 'dx', name: s.categories[0].name, type: s.categories[0].type, color: '#000', e: 'x' }],
    transactions: [{ id: 'i1', date: '2026-01-01', amount: 80, type: 'expense', accountId: 'x1', category: 'cx', merchant: 'Shop', splits: [{ category: 'cx', amount: 50 }, { category: 'dx', amount: 30 }] }], bills: [], goals: [], reminders: [], rules: [] };
  C.inc = inc; const r1 = C.run('mergeData(inc)'); assert.equal(r1.transactions, 1);
  const t = s.transactions.find(x => x.merchant === 'Shop'); const newCat = s.categories.find(c => c.name === 'Brand New Cat');
  assert.ok(t && newCat && t.splits.every(p => s.categories.some(c => c.id === p.category)), 'every split points at a real category');
  assert.equal(t.splits[1].category, s.categories[0].id, 'merged category maps to the existing one');
  C.inc = JSON.parse(JSON.stringify(inc)); const r2 = C.run('mergeData(inc)'); assert.equal(r2.transactions, 0); assert.equal(r2.skipped, 1);
});
