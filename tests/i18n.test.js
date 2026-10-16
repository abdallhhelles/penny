'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { createI18n } = require('../renderer/i18n.js');
const Fmt = require('../renderer/fmt.js');
const L = c => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'locales', c + '.json'), 'utf8'));
const make = () => { const i = createI18n(); for (const c of ['en', 'es', 'ar']) i.register(c, L(c)); return i; };

test('locale files pass the checker (keys, placeholders, no HTML)', () => {
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'i18n-check.js')], { stdio: 'pipe' });
});
test('interpolation + English plurals', () => {
  const i = make(); i.setLanguage('en');
  assert.equal(i.t('tx.deleted'), 'Transaction deleted');
  assert.equal(i.t('rel.inDays', { count: 1 }), 'In 1 day');
  assert.equal(i.t('rel.inDays', { count: 5 }), 'In 5 days');
  assert.equal(i.t('tf.selected', { count: 0 }), 'Nothing selected');
  assert.equal(i.t('tf.selected', { count: 3 }), '3 selected');
});
test('Arabic uses all six plural forms', () => {
  const i = make(); i.setLanguage('ar');
  const w = n => i.t('notif.billsDue', { count: n }).replace(/[⁨⁩]/g, '');
  assert.match(w(0), /لا توجد/); assert.match(w(1), /واحدة/); assert.match(w(2), /فاتورتان/);
  assert.match(w(3), /فواتير/); assert.match(w(11), /فاتورة/); assert.match(w(100), /فاتورة/);
  assert.equal(i.dir(), 'rtl'); assert.equal(i.isRTL(), true);
});
test('fallback: requested -> base language -> English -> key (and reports only true misses)', () => {
  const i = createI18n(); const seen = [];
  i.setMissingHandler(k => seen.push(k));
  i.register('en', { meta: { name: 'English' }, strings: { a: 'A-en', b: 'B-en' } });
  i.register('es', { meta: { name: 'Spanish' }, strings: { a: 'A-es' } });
  i.setLanguage('es-MX');
  assert.equal(i.t('a'), 'A-es'); assert.equal(i.t('b'), 'B-en'); assert.equal(i.t('zzz'), 'zzz');
  assert.deepEqual(seen, ['zzz']);
});
test('resolve(): preference, system locale, unknown language', () => {
  const i = make();
  assert.equal(i.resolve('auto', 'ar-EG'), 'ar'); assert.equal(i.resolve('auto', 'es-MX'), 'es');
  assert.equal(i.resolve('auto', 'ja-JP'), 'en'); assert.equal(i.resolve('es', 'ar'), 'es'); assert.equal(i.resolve('xx', 'ar'), 'ar');
});
test('th() escapes message and variables (names cannot inject HTML)', () => {
  const i = make(); i.setLanguage('en');
  const out = i.th('bill.recorded', { name: '<img src=x onerror=alert(1)>' });
  assert.ok(!out.includes('<img')); assert.ok(out.includes('&lt;img'));
});
test('user-added language works with no code change', () => {
  const i = make(); i.register('fr', { meta: { name: 'French', nativeName: 'Français', dir: 'ltr', region: 'fr-FR' }, strings: { 'nav.settings': 'Réglages' } });
  i.setLanguage('fr'); assert.equal(i.t('nav.settings'), 'Réglages'); assert.equal(i.t('nav.accounts'), 'Accounts');
  assert.ok(i.available().some(l => l.code === 'fr'));
});
test('formatting is display only: amounts survive any locale unchanged', () => {
  for (const loc of ['en-US', 'es-ES', 'ar-SA', 'de-DE']) for (const digits of ['latn', 'native']) {
    const f = Fmt.create({ locale: loc, currency: 'USD', digits });
    const text = f.money(1234.5);
    assert.equal(Fmt.parseNumber(text.replace(/[^\d.,٠-٩۰-۹٫٬\-]/g, '')), 1234.5, `${loc}/${digits}: ${text}`);
  }
});
test('Gregorian calendar and Latin digits by default, even for ar-SA', () => {
  const f = Fmt.create({ locale: 'ar-SA', currency: 'SAR', digits: 'latn' });
  assert.match(f.dateShort('2026-10-14'), /2026|14/); assert.ok(!/[٠-٩]/.test(f.money(1234.5)));
  assert.ok(/[٠-٩]/.test(Fmt.create({ locale: 'ar-EG', currency: 'EGP', digits: 'native' }).money(1234.5)));
});
test('parseNumber/toAscii accept Arabic-Indic input', () => {
  assert.equal(Fmt.toAscii('١٢٣٫٥'), '123.5'); assert.equal(Fmt.parseNumber('١٢٣٫٥٠'), 123.5); assert.equal(Fmt.parseNumber('1,234.50'), 1234.5);
});
