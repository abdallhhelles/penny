'use strict';
/* Multilingual parsing: Ask Penny (Ctrl K) questions and quick reminders typed in English, Spanish, Arabic, Chinese and
   Hindi are understood. Loads the real renderer scripts into a vm sandbox (like schema.test.js), plus remind.js. */
const test = require('node:test'), assert = require('node:assert'), vm = require('vm'), fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', 'renderer') + path.sep;
function sandbox() {
  const el = () => new Proxy(function () {}, { get: (t, k) => (k === 'style' || k === 'classList' || k === 'dataset') ? new Proxy({}, { get: () => () => {}, set: () => true }) : (k === 'length' ? 0 : el()), apply: () => el() });
  const ctx = { console, Math, Date, JSON, Intl, setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, requestAnimationFrame: () => {}, crypto: require('crypto').webcrypto, TextEncoder, TextDecoder, atob, btoa,
    localStorage: { getItem: () => null, setItem: () => {} }, navigator: { language: 'en-US' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => el(), documentElement: { dataset: {}, style: { setProperty() {} }, lang: 'en', dir: 'ltr' }, body: el() },
    addEventListener() {}, ResizeObserver: class { observe() {} }, MutationObserver: class { observe() {} }, structuredClone };
  ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx); vm.runInContext('var PAGES={},DW={};', ctx);
  const html = fs.readFileSync(R + 'index.html', 'utf8');
  const skip = ['app.js', 'guide.js', 'lang.js', 'pages.js', 'pages2.js', 'explain.js', 'money.js', 'report.js', 'insights.js', 'docs.js', 'import-wizard.js', 'a11y.js', 'nav.js', 'ctxmenu.js', 'attach.js'];
  for (const f of [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => !skip.includes(f))) vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
  ctx.run = c => vm.runInContext(c, ctx);
  for (const l of fs.readdirSync(R + 'locales').filter(f => f.endsWith('.json'))) ctx.run(`I18N.register(${JSON.stringify(l.replace('.json', ''))}, ${fs.readFileSync(R + 'locales/' + l, 'utf8')})`);
  ctx.run("I18N.setLanguage('en'); S = normalize(demoData('Lee'));");
  return ctx;
}
const C = sandbox();
const rem = q => C.run(`parseReminder(${JSON.stringify(q)})`);
const day = n => C.run(`addDays(today(),${n})`);

test('reminders: times, repeats and dates in five languages', () => {
  let r = rem('pay rent on the 1st at 9am monthly'); assert.equal(r.time, '09:00'); assert.equal(r.repeat, 'monthly'); assert.equal(r.kind, 'rent');
  r = rem('每月1号上午9点交房租'); assert.equal(r.time, '09:00'); assert.equal(r.repeat, 'monthly'); assert.equal(r.kind, 'rent'); assert.equal(+r.date.slice(8), 1);
  r = rem('明天下午3点半看牙医'); assert.equal(r.time, '15:30'); assert.equal(r.date, day(1)); assert.equal(r.kind, 'appt');
  r = rem('हर महीने 1 तारीख सुबह 9 बजे किराया'); assert.equal(r.time, '09:00'); assert.equal(r.repeat, 'monthly'); assert.equal(r.kind, 'rent');
  r = rem('कल शाम 6 बजे दवा'); assert.equal(r.time, '18:00'); assert.equal(r.date, day(1)); assert.equal(r.kind, 'med');
  r = rem('pagar la factura de luz mañana a las 8 de la noche'); assert.equal(r.time, '20:00'); assert.equal(r.date, day(1)); assert.equal(r.kind, 'bill');
  r = rem('cita con el médico el día 15 a las 10'); assert.equal(r.time, '10:00'); assert.equal(+r.date.slice(8), 15); assert.equal(r.kind, 'appt');
  r = rem('دفع الإيجار كل شهر يوم 1 الساعة 9 صباحا'); assert.equal(r.time, '09:00'); assert.equal(r.repeat, 'monthly'); assert.equal(r.kind, 'rent');
  r = rem('موعد الطبيب غدا الساعة 4 مساء'); assert.equal(r.time, '16:00'); assert.equal(r.date, day(1)); assert.equal(r.kind, 'appt');
});

test('Ask Penny: questions in five languages map to the same answers', () => {
  const ask = (q, lang = 'en') => C.run(`(()=>{I18N.setLanguage(${JSON.stringify(lang)}); const a = askPenny(${JSON.stringify(q)}); I18N.setLanguage('en'); return a;})()`);
  const en = ask('how much did I spend last month?');
  assert.ok(en && /spent/.test(en.title), JSON.stringify(en));
  for (const [q, l] of [['上个月我花了多少钱', 'zh'], ['पिछले महीने मैंने कितना खर्च किया', 'hi'], ['¿cuánto gasté el mes pasado?', 'es'], ['كم صرفت الشهر الماضي', 'ar']]) {
    const a = ask(q, l); assert.ok(a, q); assert.equal(a.e, en.e, q);
    assert.equal(a.title.replace(/\D/g, '').slice(0, 4), en.title.replace(/\D/g, '').slice(0, 4), `${q} → ${a.title}`);
  }
  assert.ok(/net worth|Net worth/.test(ask('what is my net worth').title));
  assert.ok(ask('我的净资产') && ask('我的净资产').e === '💎');
  assert.ok(ask('मेरी नेट वर्थ') && ask('मेरी नेट वर्थ').e === '💎');
});

test('categories: Penny’s own names follow the language, renamed ones stay', () => {
  const names = () => C.run("S.categories.filter(c=>['c_groceries','c_dining'].includes(c.id)).map(c=>c.name).join('|')");
  assert.equal(names(), 'Groceries|Dining');
  C.run("S.categories.find(c=>c.id==='c_dining').name='Eating out'; S.categories.find(c=>c.id==='c_dining').nameAuto=false;");
  C.run("I18N.setLanguage('es'); syncCatNames(S)");
  assert.equal(C.run("S.categories.find(c=>c.id==='c_groceries').name"), C.run("tr('cat.def.groceries')"));
  assert.equal(C.run("S.categories.find(c=>c.id==='c_dining').name"), 'Eating out');
  C.run("I18N.setLanguage('en'); syncCatNames(S)");
  assert.equal(C.run("S.categories.find(c=>c.id==='c_groceries').name"), 'Groceries');
  assert.equal(C.run("Finance.bucketOf({id:'c_groceries',name:'杂货'})"), 'needs', 'logic uses the stable id');
});

test('smart entry: one-line expenses in five languages', () => {
  const p = q => C.run(`parseSmart(${JSON.stringify(q)})`);
  let r = p('coffee 4.5 at starbucks yesterday'); assert.equal(r.amount, 4.5); assert.equal(r.date, day(-1)); assert.equal(r.merchant, 'Starbucks');
  r = p('昨天在星巴克咖啡 4.5'); assert.equal(r.amount, 4.5); assert.equal(r.date, day(-1)); assert.ok(/星巴克/.test(r.merchant), r.merchant);
  r = p('कल स्टारबक्स पर कॉफ़ी 4.5'); assert.equal(r.amount, 4.5); assert.equal(r.date, day(-1)); assert.equal(r.merchant, 'स्टारबक्स');
  r = p('café 4,50 en starbucks ayer'); assert.equal(r.amount, 4.5); assert.equal(r.date, day(-1)); assert.equal(r.merchant, 'Starbucks');
  r = p('قهوة ٤٫٥ في ستاربكس أمس'); assert.equal(r.amount, 4.5); assert.equal(r.date, day(-1)); assert.equal(r.merchant, 'ستاربكس');
  r = p('工资 3000'); assert.equal(r.type, 'income'); assert.equal(r.amount, 3000);
  r = p('rent 1,250 3 days ago'); assert.equal(r.amount, 1250); assert.equal(r.date, day(-3));
});

test('the example phrases shown in each language are understood', () => {
  for (const l of ['en', 'zh', 'hi', 'es', 'ar']) {
    C.run(`I18N.setLanguage(${JSON.stringify(l)})`);
    const ph = C.run("tr('rem.quickPh')"), q = ph.slice(ph.search(/[:：]/) + 1).trim();
    const r = rem(q); assert.equal(r.time, '09:00', `${l}: ${q}`); assert.equal(r.repeat, 'monthly', `${l}: ${q}`); assert.equal(r.kind, 'rent', `${l}: ${q}`);
  }
  C.run("I18N.setLanguage('en')");
});
