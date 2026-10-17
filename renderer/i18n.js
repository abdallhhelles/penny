'use strict';
/* =========================================================================
   Penny i18n core — translations only. No money, dates or calculations here
   (display formatting lives in fmt.js, financial logic in core.js).

   Works in the renderer (window.I18N / window.createI18n) and in Node (main process, tests).

   Message files:  renderer/locales/<code>.json   { "meta": {...}, "strings": { "key": "text {var}" } }
   Variables:      {name}                       -> value (numbers are formatted for the active locale)
   Plurals:        key_zero / _one / _two / _few / _many / _other, chosen with Intl.PluralRules from vars.count
   Fallback:       requested language -> its base language (es-MX -> es) -> English -> the key itself
   Two output modes (global helpers in the renderer; I18N.t / I18N.th on an instance). NOTE the names: the
   codebase uses `t` as a loop variable for transactions everywhere, so the helpers are tr() and trh().
     tr(key, vars)   plain text  (toasts, notifications, attributes after esc(), textContent)
     trh(key, vars)  HTML-safe   (message AND variables are escaped; text variables are wrapped in <bdi>)
   ========================================================================= */
function createI18n() {
  const FALLBACK = 'en';
  const RTL_BASES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb']);
  const bundles = new Map();          // code -> { meta, strings }
  const rules = new Map();            // code -> Intl.PluralRules
  const missing = new Set();          // "lang|key" already reported
  let lang = FALLBACK, chain = [FALLBACK], numberTag = FALLBACK, onMissing = null;
  const stats = { missingEverywhere: new Set(), fellBack: new Set() };

  const canon = c => {                // "es_mx" -> "es-MX", "AR" -> "ar"
    const p = String(c || '').replace(/_/g, '-').split('-').filter(Boolean);
    if (!p.length) return '';
    return p.map((x, i) => i === 0 ? x.toLowerCase() : x.length === 2 ? x.toUpperCase() : x.length === 4 ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x).join('-');
  };
  const baseOf = c => canon(c).split('-')[0];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function register(code, bundle) {
    const c = canon(code);
    if (!c || !bundle || typeof bundle !== 'object') return false;
    const strings = {};
    for (const [k, v] of Object.entries(bundle.strings || {})) if (typeof v === 'string') strings[k] = v;
    bundles.set(c, { meta: { ...(bundle.meta || {}) }, strings });
    rules.delete(c);
    return true;
  }
  const has = c => bundles.has(canon(c));
  const metaOf = c => (bundles.get(canon(c)) || {}).meta || {};

  /* choose the best available language for a preference ('auto' or a code) and the system locale */
  function resolve(pref, systemLocale, available) {
    const avail = (available || [...bundles.keys()]).map(canon);
    const pick = want => {
      const w = canon(want); if (!w) return '';
      const exact = avail.find(a => a.toLowerCase() === w.toLowerCase()); if (exact) return exact;
      const b = baseOf(w);
      return avail.find(a => a.toLowerCase() === b) || avail.find(a => baseOf(a) === b) || '';
    };
    if (pref && pref !== 'auto') { const p = pick(pref); if (p) return p; }
    return pick(systemLocale) || (avail.includes(FALLBACK) ? FALLBACK : (avail[0] || FALLBACK));
  }

  function chainFor(code) {
    const c = canon(code), b = baseOf(c), out = [];
    for (const x of [c, b, FALLBACK]) if (x && !out.includes(x)) out.push(x);
    return out;
  }
  function setLanguage(code) {
    lang = canon(code) || FALLBACK; chain = chainFor(lang);
    return { lang, dir: dir() };
  }
  const dir = c => { const code = canon(c || lang); const m = metaOf(code).dir; return m === 'rtl' || m === 'ltr' ? m : (RTL_BASES.has(baseOf(code)) ? 'rtl' : 'ltr'); };
  const isRTL = () => dir() === 'rtl';

  const catFor = (code, n) => {
    let r = rules.get(code);
    if (!r) { try { r = new Intl.PluralRules(code); } catch { r = new Intl.PluralRules(FALLBACK); } rules.set(code, r); }
    return r.select(n);
  };

  function lookup(key, count) {
    for (let i = 0; i < chain.length; i++) {
      const b = bundles.get(chain[i]); if (!b) continue;
      let msg;
      if (typeof count === 'number' && Number.isFinite(count)) {
        const cat = catFor(chain[i], Math.abs(count));
        if (count === 0) msg = b.strings[`${key}_zero`];          // an explicit "zero" form wins in every language
        if (msg === undefined) msg = b.strings[`${key}_${cat}`] ?? b.strings[`${key}_other`];
      }
      if (msg === undefined) msg = b.strings[key];
      if (msg !== undefined) { if (i > 0) stats.fellBack.add(key); return msg; }
    }
    return undefined;
  }

  function report(key) {
    stats.missingEverywhere.add(key);
    const id = lang + '|' + key; if (missing.has(id)) return; missing.add(id);
    try { if (onMissing) onMissing(key, lang); } catch {}
  }

  const fmtNum = n => { try { return new Intl.NumberFormat(numberTag).format(n); } catch { return String(n); } };
  const FSI = '⁨', PDI = '⁩';

  function render(msg, vars, html) {
    const rtl = isRTL();
    let out = html ? esc(msg) : msg;
    out = out.replace(/\{([A-Za-z_][\w.]*)\}/g, (m, name) => {
      if (!vars || !(name in vars) || vars[name] == null) return m;
      const v = vars[name];
      if (typeof v === 'number') return fmtNum(v);
      const s = String(v);
      if (html) return `<bdi>${esc(s)}</bdi>`;
      return rtl ? FSI + s + PDI : s;      // keep names/amounts from reordering the sentence around them
    });
    return out;
  }

  function translate(key, vars, html) {
    const count = vars && typeof vars.count === 'number' ? vars.count : undefined;
    const msg = lookup(key, count);
    if (msg === undefined) { report(key); return html ? esc(key) : key; }
    return render(msg, vars, html);
  }

  return {
    FALLBACK,
    register, has, meta: metaOf, resolve, setLanguage, dir, isRTL,
    get lang() { return lang; },
    get chain() { return chain.slice(); },
    t: (key, vars) => translate(key, vars, false),
    th: (key, vars) => translate(key, vars, true),
    raw: (code, key) => ((bundles.get(canon(code)) || {}).strings || {})[key],
    exists: key => lookup(key) !== undefined || lookup(key, 1) !== undefined,
    setNumberLocale: tag => { numberTag = tag || FALLBACK; },
    setMissingHandler: fn => { onMissing = fn; },
    available: () => [...bundles.entries()].map(([code, b]) => ({ code, name: b.meta.name || code, nativeName: b.meta.nativeName || b.meta.name || code, dir: dir(code), region: b.meta.region || '' })),
    stats: () => ({ fellBack: [...stats.fellBack], missingEverywhere: [...stats.missingEverywhere] }),
    canon, baseOf
  };
}

if (typeof module === 'object' && module.exports) module.exports = { createI18n };
else { window.createI18n = createI18n; window.I18N = createI18n(); window.tr = (k, v) => window.I18N.t(k, v); window.trh = (k, v) => window.I18N.th(k, v); }
