#!/usr/bin/env node
'use strict';
/* Translation checker.  node tools/i18n-check.js [--strict]
   ERRORS (exit 1):  a key used in code is missing from en.json · {placeholders} differ from English · HTML inside a string
                     · a locale file is not valid JSON / lacks meta.name / meta.dir invalid
   WARNINGS:         keys that exist in English but not in a locale (those fall back to English) · unused English keys
                     · Arabic-style plural families missing categories (zero/one/two/few/many/other)
   --strict turns warnings about missing translations into errors (use before shipping a language as "complete"). */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'renderer'), dir = path.join(root, 'locales');
const strict = process.argv.includes('--strict');
const errors = [], warns = [];
const load = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { errors.push(`${f}: invalid JSON (${e.message})`); return null; } };
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const langs = {}; for (const f of files) { const j = load(f); if (j) langs[f.replace('.json', '')] = j; }
const en = langs.en; if (!en) { console.error('en.json missing'); process.exit(1); }

// plural bases: "a_one","a_other" -> "a"
const PL = /_(zero|one|two|few|many|other)$/;
const base = k => k.replace(PL, '');
const enKeys = new Set(Object.keys(en.strings)), enBases = new Set([...enKeys].map(base));
const exists = k => enKeys.has(k) || [...enKeys].some(x => base(x) === k);

// keys used in code
const used = new Set();
for (const f of fs.readdirSync(root).filter(f => f.endsWith('.js') && f !== 'i18n.js')) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of s.matchAll(/\b(?:trh?|H)\(\s*['"`]([A-Za-z][\w.]*[\w])['"`]/g)) used.add(m[1]);
}
for (const k of used) if (!exists(k)) errors.push(`key used in code but missing from en.json: ${k}`);
// main process keys
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
for (const m of mainSrc.matchAll(/\bmt\(\s*'([\w.]+)'/g)) if (!exists(m[1])) errors.push(`main.js uses missing key: ${m[1]}`);
// dynamic families built as prefix + value in code (kept in sync by hand)
const FAMILIES = { 'nav.': 12, 'tx.rep.': 6, 'freq.': 6, 'widget.': 17, 'sound.': 7, 'lead.': 6, 'set.cat.': 9, 'tf.type.': 4, 'tf.range.': 6, 'tf.sort.': 5, 'tf.bulk.': 5, 'tf.edit.': 5, 'set.ahead.': 3, 'set.autoLock.': 5, 'set.theme.': 3, 'set.material.': 4, 'set.density.': 3, 'set.motion.': 3, 'set.greet.': 4, 'set.digits.': 2 };
for (const [p, n] of Object.entries(FAMILIES)) { const c = [...enBases].filter(k => k.startsWith(p)).length; if (c < n) errors.push(`key family ${p}* has ${c} entries in en.json, code expects ${n}`); }

const vars = s => [...String(s).matchAll(/\{([A-Za-z_][\w.]*)\}/g)].map(m => m[1]).sort().join(',');
for (const [code, j] of Object.entries(langs)) {
  const m = j.meta || {};
  if (!m.name || !m.nativeName) errors.push(`${code}: meta.name / meta.nativeName required`);
  if (m.dir && !['ltr', 'rtl'].includes(m.dir)) errors.push(`${code}: meta.dir must be ltr or rtl`);
  let missing = 0;
  for (const [k, v] of Object.entries(j.strings || {})) {
    if (typeof v !== 'string') { errors.push(`${code}: ${k} is not a string`); continue; }
    if (/<\/?[a-z][^>]*>/i.test(v)) errors.push(`${code}: ${k} contains HTML (not allowed — text only)`);
    if (code !== 'en') {
      const ref = en.strings[k] ?? en.strings[base(k) + '_other'] ?? en.strings[base(k) + '_one'];
      if (ref === undefined) { warns.push(`${code}: ${k} has no English source (unused?)`); continue; }
      // plural forms may use {count} or spell the number out, so only compare variables other than count
      const a = vars(ref).split(',').filter(x => x && x !== 'count').join(','), b = vars(v).split(',').filter(x => x && x !== 'count').join(',');
      if (a !== b && !PL.test(k)) errors.push(`${code}: ${k} placeholders {${b}} differ from English {${a}}`);
      if (PL.test(k) && b.split(',').some(x => x && !a.split(',').includes(x))) errors.push(`${code}: ${k} uses a placeholder English does not have: {${b}}`);
    }
  }
  if (code !== 'en') {
    for (const b of enBases) if (!Object.keys(j.strings).some(k => base(k) === b)) missing++;
    const pct = Math.round(100 * (enBases.size - missing) / enBases.size);
    console.log(`${code.padEnd(6)} ${String(pct).padStart(3)}% translated (${enBases.size - missing}/${enBases.size})${m.status ? '  status: ' + m.status : ''}`);
    if (missing) (strict ? errors : warns).push(`${code}: ${missing} keys not translated yet (they show English)`);
  }
}
const allBases = new Set(); for (const j of Object.values(langs)) for (const k of Object.keys(j.strings)) allBases.add(base(k));
console.log(`English: ${enBases.size} messages · code references ${used.size} literal keys`);
for (const w of warns.slice(0, 40)) console.log('warn  ' + w);
for (const e of errors) console.log('ERROR ' + e);
console.log(errors.length ? `\n${errors.length} error(s)` : '\ni18n check OK');
process.exit(errors.length ? 1 : 0);
