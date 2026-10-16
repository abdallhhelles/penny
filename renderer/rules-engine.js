'use strict';
/* =========================================================================
   Penny categorisation engine — pure functions, no UI, no globals (node-testable).

   How a category is chosen, in this order (first hit wins, and the source is reported so the UI can say why):
     1. YOUR RULES      "payee contains/equals/starts with …", optional amount range / account / type  ->  category (+ clean payee name)
     2. LEARNED         what you already filed under this payee (cleaned of store numbers: "STARBUCKS #1234" = "Starbucks"); most-used wins
     3. KEYWORDS        built-in English / Spanish / Arabic words (coffee, supermercado, بنزين …)
     4. nothing         the caller falls back to "Other" and the item can be reviewed in Clean-up
   Amounts and dates are never touched here. Categories only ever change on transactions of the same type
   (expense categories for expenses, income for income); transfers have no category.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RulesEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const fold = s => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ًͯ-ٟ]/g, '').trim();
  /* "POS PURCHASE STARBUCKS #1234 NYC" -> "starbucks nyc": drop bank noise words, store numbers and punctuation */
  const NOISE = /\b(pos|purchase|card|debit|credit|visa|mastercard|mc|payment|pmt|www|com|ach|ref|txn|online|inc|ltd|llc)\b/g;
  const normPayee = s => fold(s).replace(NOISE, ' ').replace(/[#*\d\-_/.,:]+/g, ' ').replace(/\s+/g, ' ').trim();
  const typeOfCat = x => (x === 'income' ? 'income' : 'expense');

  const KEYWORDS = [
    [/coffee|cafe|starbucks|restaurant|lunch|dinner|breakfast|pizza|burger|mcdonald|kfc|takeout|sushi|\bbar\b|brunch|restaurante|cafeter|comida|almuerzo|\bcena\b|مطعم|قهوة|كافيه|غداء|عشاء|وجبة/i, 'Dining'],
    [/grocer|supermarket|walmart|aldi|lidl|carrefour|costco|market|bakery|trader joe|whole foods|supermercado|panader|mercado|بقالة|سوبرماركت|هايبر|مخبز/i, 'Groceries'],
    [/uber|lyft|taxi|\bbus\b|metro|train|fuel|\bgas\b|petrol|parking|toll|careem|gasolina|autob|estacionamiento|بنزين|تاكسي|مواصلات|أوبر|اوبر|موقف/i, 'Transport'],
    [/\brent\b|mortgage|landlord|alquiler|hipoteca|arriendo|إيجار|ايجار/i, 'Housing'],
    [/electric|water|internet|wifi|phone bill|utility|utilities|electricidad|\bagua\b|\bluz\b|كهرباء|مياه|إنترنت|انترنت|فاتورة/i, 'Utilities'],
    [/netflix|spotify|disney|hulu|youtube|icloud|subscription|prime|adobe|chatgpt|suscrip|اشتراك/i, 'Subscriptions'],
    [/doctor|pharmacy|dentist|hospital|medicine|clinic|gym|farmacia|m[eé]dico|dentista|cl[ií]nica|gimnasio|صيدلية|طبيب|مستشفى|عيادة|نادي/i, 'Health'],
    [/amazon|clothes|shoes|zara|h&m|ikea|shopping|mall|ropa|zapatos|ملابس|حذاء|مول/i, 'Shopping'],
    [/movie|cinema|concert|game|steam|playstation|ticket|cine\b|concierto|juego|سينما|حفلة|لعبة/i, 'Entertainment'],
    [/flight|hotel|airbnb|booking|trip|airline|vuelo|viaje|طيران|فندق|رحلة/i, 'Travel'],
    [/course|tuition|book|udemy|school|university|curso|colegio|universidad|matr[ií]cula|دورة|مدرسة|جامعة|كتاب/i, 'Education'],
    [/gift|present|birthday|regalo|cumplea|هدية|عيد ميلاد/i, 'Gifts'],
    [/salary|paycheck|payroll|wage|salario|n[oó]mina|sueldo|راتب|مرتب/i, 'Salary'],
    [/freelance|client|invoice|cliente|factura|عميل/i, 'Freelance'],
    [/dividend|interest|stock|dividendo|inter[eé]s|أرباح|فوائد/i, 'Investments']
  ];

  /* ---- rules ---- */
  const num = v => (v === '' || v == null || !Number.isFinite(+v)) ? null : +v;
  function matches(r, x) {
    if (!r || r.on === false || !x) return false;
    const t = fold(r.text), lo = num(r.min), hi = num(r.max);
    if (!t && lo === null && hi === null) return false;            // a rule without a condition would match everything
    if (r.type && r.type !== 'any' && x.type !== r.type) return false;
    if (r.accountId && x.accountId !== r.accountId) return false;
    if (lo !== null && !(x.amount >= lo)) return false;
    if (hi !== null && !(x.amount <= hi)) return false;
    if (t) {
      const p = fold(x.merchant);
      if (r.op === 'equals') { if (p !== t) return false; }
      else if (r.op === 'starts') { if (!p.startsWith(t)) return false; }
      else if (!p.includes(t)) return false;
    }
    return true;
  }
  /* first matching rule that provides a category wins; first matching rule with a clean name provides the rename */
  function apply(rules, categories, x) {
    const out = {};
    if (!x || x.type === 'transfer') return out;
    for (const r of rules || []) {
      if (!matches(r, x)) continue;
      if (!out.category && r.category) {
        const c = (categories || []).find(c => c.id === r.category);
        if (c && c.type === typeOfCat(x.type)) { out.category = c.id; out.ruleId = r.id; }
      }
      if (out.merchant === undefined && r.rename && String(r.rename).trim()) { out.merchant = String(r.rename).trim(); out.renameRuleId = r.id; }
      if (out.category && out.merchant !== undefined) break;
    }
    return out;
  }

  /* A rule is "hidden" when an earlier enabled rule already matches everything it matches and also sets a category,
     so its own category can never be used. Returns {ruleId: hidingRuleId}. Conservative: only reports when provable. */
  function shadowed(rules) {
    const out = {}, list = (rules || []).filter(r => r && r.on !== false);
    const implies = (i, j) => {                                   // every transaction matching rule i also matches rule j
      const ti = fold(i.text), tj = fold(j.text), loI = num(i.min), hiI = num(i.max), loJ = num(j.min), hiJ = num(j.max);
      if (!tj && loJ === null && hiJ === null) return false;
      if (j.type && j.type !== 'any' && j.type !== i.type) return false;
      if (j.accountId && j.accountId !== i.accountId) return false;
      if (loJ !== null && !(loI !== null && loI >= loJ)) return false;
      if (hiJ !== null && !(hiI !== null && hiI <= hiJ)) return false;
      if (tj) {
        if (!ti) return false;
        const oj = j.op || 'contains', oi = i.op || 'contains';
        if (oj === 'contains') { if (!ti.includes(tj)) return false; }
        else if (oj === 'starts') { if (!((oi === 'starts' || oi === 'equals') && ti.startsWith(tj))) return false; }
        else if (oj === 'equals') { if (!(oi === 'equals' && ti === tj)) return false; }
      }
      return true;
    };
    for (let a = 1; a < list.length; a++) {
      if (!list[a].category) continue;
      for (let b = 0; b < a; b++) if (list[b].category && implies(list[a], list[b])) { out[list[a].id] = list[b].id; break; }
    }
    return out;
  }
  /* ---- learned from history ---- */
  function buildLearn(transactions, isFallback) {
    const idx = new Map();
    for (const t of transactions || []) {
      if (!t || !t.merchant || !t.category || t.type === 'transfer') continue;
      if (isFallback && isFallback(t.category)) continue;           // "Other" teaches nothing
      const k = t.type + '|' + normPayee(t.merchant); if (k.endsWith('|')) continue;
      let e = idx.get(k); if (!e) idx.set(k, e = new Map());
      const c = e.get(t.category) || { n: 0, last: '' }; c.n++; if ((t.date || '') > c.last) c.last = t.date || ''; e.set(t.category, c);
    }
    return idx;
  }
  function learned(idx, text, type) {
    const e = idx && idx.get(type + '|' + normPayee(text)); if (!e) return null;
    let best = null;
    for (const [cat, c] of e) if (!best || c.n > best.n || (c.n === best.n && c.last > best.last)) best = { cat, n: c.n, last: c.last };
    return best ? best.cat : null;
  }
  function keyword(text, type, categories) {
    for (const [re, name] of KEYWORDS) {
      if (!re.test(text)) continue;
      const c = (categories || []).find(c => fold(c.name) === fold(name));
      if (c && c.type === typeOfCat(type)) return c.id;
    }
    return null;
  }
  /* ctx: {rules, categories, learnIndex}; x: {merchant, type, amount?, accountId?} -> {id, source, merchant?} */
  function suggest(ctx, x) {
    if (!x || x.type === 'transfer') return { id: null, source: null };
    const a = apply(ctx.rules, ctx.categories, x);
    if (a.category) return { id: a.category, source: 'rule', ruleId: a.ruleId, merchant: a.merchant };
    const l = learned(ctx.learnIndex, x.merchant, x.type);
    if (l) return { id: l, source: 'learned', merchant: a.merchant };
    const k = keyword(String(x.merchant || '') + ' ' + String(x.note || ''), x.type, ctx.categories);
    if (k) return { id: k, source: 'keyword', merchant: a.merchant };
    return { id: null, source: null, merchant: a.merchant };
  }

  /* ---- clean-up: payees that sit in "Other" (or nothing), grouped, with a suggested category for each ---- */
  const FALLBACK_NAME = /^(other|other income|misc|miscellaneous|uncategori[sz]ed|otros?|otros ingresos|أخرى|اخرى|متنوع)$/i;
  const isFallbackCat = c => !!c && FALLBACK_NAME.test(String(c.name || '').trim());
  function groupUncategorized(transactions, categories, ctx) {
    const fb = new Set((categories || []).filter(isFallbackCat).map(c => c.id));
    const groups = new Map();
    for (const t of transactions || []) {
      if (!t || t.type === 'transfer' || !t.merchant) continue;
      if (t.category && !fb.has(t.category) && (categories || []).some(c => c.id === t.category)) continue;
      const key = t.type + '|' + normPayee(t.merchant); if (key.endsWith('|')) continue;
      let g = groups.get(key); if (!g) groups.set(key, g = { key, type: t.type, label: t.merchant, count: 0, total: 0, ids: [] });
      g.count++; g.total += t.amount || 0; g.ids.push(t.id);
    }
    const out = [...groups.values()].sort((a, b) => b.count - a.count || b.total - a.total);
    for (const g of out) { const s = suggest(ctx, { merchant: g.label, type: g.type }); g.suggest = s.id; g.source = s.source; }
    return out;
  }
  /* propose rules for payees that are consistently filed in one category (>=3 transactions, >=80% agree) and have no rule yet */
  function proposeRules(transactions, categories, rules) {
    const by = new Map();
    for (const t of transactions || []) {
      if (!t || t.type === 'transfer' || !t.merchant || !t.category) continue;
      const c = (categories || []).find(c => c.id === t.category); if (!c || isFallbackCat(c)) continue;
      const key = t.type + '|' + normPayee(t.merchant); if (key.endsWith('|')) continue;
      let e = by.get(key); if (!e) by.set(key, e = { type: t.type, names: new Map(), cats: new Map(), n: 0 });
      e.n++; e.names.set(t.merchant, (e.names.get(t.merchant) || 0) + 1); e.cats.set(t.category, (e.cats.get(t.category) || 0) + 1);
    }
    const out = [];
    for (const e of by.values()) {
      if (e.n < 3) continue;
      const [cat, n] = [...e.cats.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n / e.n < 0.8) continue;
      const text = [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const probe = { merchant: text, type: e.type, amount: 0 };
      if (apply(rules, categories, probe).category) continue;       // already covered
      out.push({ text, category: cat, type: e.type, count: e.n });
    }
    return out.sort((a, b) => b.count - a.count);
  }
  return { fold, normPayee, KEYWORDS, matches, apply, shadowed, buildLearn, learned, keyword, suggest, isFallbackCat, groupUncategorized, proposeRules };
});
