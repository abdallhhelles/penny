'use strict';
/* =========================================================================
   Penny finance engine — pure functions, no UI, no globals (node-testable).
   Everything that produces a money number you might act on lives here, so it can be unit-tested
   and so it is kept apart from display formatting (fmt.js). Amounts are plain numbers in the currency stated;
   nothing here reads or writes app data.

   Contents
     dates      pd ymd addDays addMonths diffDays
     stats      median quantile mad robustSigma outliers
     currency   makeFx
     net worth  upsertSnapshot compactSnapshots
     ratios     bucketOf split503020 savingsRate emergency dti housing
     budgets    rollingBudget
     splits     splitsOf validateSplits
     guards     isFuture findDuplicates
     returns    xirr
     loans      paymentFor amortize
     recurring  detectRecurring
     forecast   spendForecast
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Finance = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const r2 = n => Math.round(n * 100) / 100;
  const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------- dates ('YYYY-MM-DD', local calendar days; no time zones involved) ---------------- */
  const pad = n => String(n).padStart(2, '0');
  const pd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const addMonths = (s, n, anchor) => {
    const d = pd(s), a = anchor || d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(a, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d);
  };
  const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
  const isYMD = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && ymd(pd(s)) === s;

  /* ---------------- robust statistics ---------------- */
  const sorted = a => a.slice().sort((x, y) => x - y);
  function quantile(a, q) {
    if (!a.length) return NaN; const s = sorted(a), p = (s.length - 1) * clamp(q, 0, 1), lo = Math.floor(p), hi = Math.ceil(p);
    return s[lo] + (s[hi] - s[lo]) * (p - lo);
  }
  const median = a => quantile(a, .5);
  const mad = a => { if (!a.length) return NaN; const m = median(a); return median(a.map(x => Math.abs(x - m))); };
  const robustSigma = a => 1.4826 * mad(a);   // MAD scaled to equal the standard deviation for normal data
  const mean = a => (a.length ? sum(a) / a.length : NaN);
  const stdev = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a, x => (x - m) ** 2) / (a.length - 1)); };

  /* One-off detection for spending amounts. Amounts are right-skewed, so the test runs on ln(amount) with the
     modified z-score (Iglewicz & Hoaglin): z = 0.6745 * (x - median) / MAD, flagged when z > zMax (default 3.5).
     Only high outliers are removed (a very small purchase is not a one-off). Needs >= 8 values; otherwise nothing is removed. */
  function outliers(values, { zMax = 3.5, min = 8 } = {}) {
    const idx = values.map((v, i) => i).filter(i => values[i] > 0);
    if (idx.length < min) return { dropped: [], keepMask: values.map(() => true), median: median(values), limit: Infinity };
    const L = idx.map(i => Math.log(values[i])), m = median(L); let d = mad(L);
    if (!(d > 0)) { const iqr = quantile(L, .75) - quantile(L, .25); d = iqr / 1.349 * 0.6745; }   // many identical amounts: fall back to the IQR
    const limit = d > 0 ? Math.exp(m + zMax * d / 0.6745) : Math.exp(m) * 10;   // no spread at all: anything 10x the usual amount is a one-off
    const keepMask = values.map(v => !(v > limit));
    return { dropped: values.map((v, i) => i).filter(i => !keepMask[i]), keepMask, median: Math.exp(m), limit };
  }

  /* ---------------- currency ---------------- */
  /* rates: { EUR: 1.08 } means 1 EUR = 1.08 <base>. Rates are typed by the user (Penny never goes online), so a
     missing rate is reported, never guessed: convert() returns null and the caller shows a warning. */
  function makeFx(base, rates = {}) {
    const rate = cur => { if (!cur || cur === base) return 1; const r = Number(rates[cur]); return r > 0 && isFinite(r) ? r : null; };
    return { base, rate, convert: (n, cur) => { const r = rate(cur); return r == null ? null : n * r; }, has: cur => rate(cur) != null };
  }

  /* ---------------- net-worth snapshots ---------------- */
  /* one record per day: { d:'YYYY-MM-DD', net, assets, liabs }. Today's record is overwritten as balances change. */
  function upsertSnapshot(list, snap) {
    const out = Array.isArray(list) ? list.filter(s => s && isYMD(s.d)) : [];
    const i = out.findIndex(s => s.d === snap.d);
    const rec = { d: snap.d, net: r2(snap.net), assets: r2(snap.assets), liabs: r2(snap.liabs) };
    if (i >= 0) out[i] = rec; else out.push(rec);
    return out.sort((a, b) => (a.d < b.d ? -1 : 1));
  }
  /* keep every day for the last 400 days, then one record per month (the last of each month) so the file stays small */
  function compactSnapshots(list, today) {
    const cut = addDays(today, -400), keep = [], byMonth = new Map();
    for (const s of list) { if (s.d >= cut) keep.push(s); else byMonth.set(s.d.slice(0, 7), s); }
    return [...byMonth.values(), ...keep].sort((a, b) => (a.d < b.d ? -1 : 1));
  }

  /* ---------------- planning ratios ---------------- */
  const NEEDS = /^(groceries|transport|housing|utilities|health|education|insurance|rent|mortgage|childcare)$/i;
  const bucketOf = c => (c && (c.bucket === 'needs' || c.bucket === 'wants')) ? c.bucket : (c && NEEDS.test(String(c.name || '').trim()) ? 'needs' : 'wants');

  /* 50/30/20 — needs / wants / savings as a share of income.
     savings = income - needs - wants (anything you did not spend, including money moved to savings). */
  function split503020({ income, needs, wants }) {
    if (!(income > 0)) return null;
    const savings = income - needs - wants, t = { needs: .5, wants: .3, savings: .2 };
    const share = { needs: needs / income, wants: wants / income, savings: savings / income };
    const status = k => (k === 'savings' ? (share[k] >= t[k] ? 'ok' : 'under') : (share[k] <= t[k] ? 'ok' : 'over'));
    return { income, amounts: { needs, wants, savings }, share, target: t, status: { needs: status('needs'), wants: status('wants'), savings: status('savings') } };
  }
  const savingsRate = (income, expenses) => (income > 0 ? (income - expenses) / income : null);
  /* months of essential spending covered by liquid cash (falls back to all spending when no essentials are known) */
  const emergency = (liquid, monthlyEssential, target = 6) => {
    if (!(monthlyEssential > 0)) return null;
    const months = Math.max(0, liquid) / monthlyEssential; return { months, target, ratio: months / target, gap: Math.max(0, target * monthlyEssential - Math.max(0, liquid)) };
  };
  const dti = (monthlyDebtPayments, grossMonthlyIncome) => (grossMonthlyIncome > 0 ? monthlyDebtPayments / grossMonthlyIncome : null);
  const housing = (monthlyHousing, grossMonthlyIncome) => (grossMonthlyIncome > 0 ? monthlyHousing / grossMonthlyIncome : null);

  /* ---------------- rolling (envelope) budgets ---------------- */
  /* roll: 'off' | 'surplus' (unspent carries forward, overspending does not) | 'both' (overspending also reduces next period).
     spentPrev: spending of each earlier period, oldest first. */
  function rollingBudget({ budget, roll = 'off', spentPrev = [] }) {
    if (roll !== 'surplus' && roll !== 'both') return { carry: 0, available: budget };
    let carry = 0;
    for (const s of spentPrev) { const left = budget + carry - s; carry = roll === 'both' ? left : Math.max(0, left); }
    return { carry: r2(carry), available: r2(budget + carry) };
  }

  /* ---------------- split transactions ---------------- */
  const splitsOf = t => (Array.isArray(t.splits) && t.splits.length ? t.splits.map(s => ({ category: s.category, amount: Number(s.amount) || 0 })) : [{ category: t.category, amount: t.amount }]);
  function validateSplits(total, splits) {
    const s = r2(sum(splits, x => x.amount)), diff = r2(total - s);
    return { ok: splits.length >= 2 && splits.every(x => x.amount > 0 && x.category) && Math.abs(diff) < 0.005, sum: s, diff };
  }

  /* ---------------- guards ---------------- */
  const isFuture = (date, today) => date > today;
  const fold = s => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9؀-ۿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  /* A likely double entry: same account, type and amount within +/- `days`, and a similar payee (or one side blank).
     A shared bank id (fitid) is a certain duplicate. */
  function findDuplicates(c, existing, { days = 2 } = {}) {
    const cm = fold(c.merchant), out = [];
    for (const t of existing) {
      if (t.id && c.id && t.id === c.id) continue;
      if (c.fitid && t.fitid && c.fitid === t.fitid && t.accountId === c.accountId) { out.push({ t, certain: true }); continue; }
      if (t.type !== c.type || t.accountId !== c.accountId || Math.abs(t.amount - c.amount) >= 0.005) continue;
      if (Math.abs(diffDays(t.date, c.date)) > days) continue;
      const tm = fold(t.merchant);
      if (!cm || !tm || cm === tm || cm.includes(tm) || tm.includes(cm)) out.push({ t, certain: false });
    }
    return out;
  }

  /* ---------------- XIRR ---------------- */
  /* flows: [{ date, amount }], money paid in negative, money received (and the final value) positive.
     Annualised internal rate of return on actual dates (days / 365). Newton's method, with bisection as a fallback. */
  function xirr(flows, guess = 0.1) {
    const f = flows.filter(x => x && isYMD(x.date) && isFinite(x.amount) && x.amount !== 0);
    if (f.length < 2 || !f.some(x => x.amount < 0) || !f.some(x => x.amount > 0)) return null;
    const t0 = f.reduce((m, x) => (x.date < m ? x.date : m), f[0].date);
    const yrs = f.map(x => ({ a: x.amount, t: diffDays(t0, x.date) / 365 }));
    const days = Math.max(...yrs.map(x => x.t)) * 365;
    if (days < 1) return null;
    const val = r => sum(yrs, x => x.a / Math.pow(1 + r, x.t));
    const der = r => sum(yrs, x => -x.t * x.a / Math.pow(1 + r, x.t + 1));
    let r = guess, ok = false;
    for (let i = 0; i < 60; i++) {
      const v = val(r), d = der(r); if (!isFinite(v) || !isFinite(d) || d === 0) break;
      const n = r - v / d; if (!(n > -0.9999)) break;
      if (Math.abs(n - r) < 1e-10) { r = n; ok = true; break; } r = n;
    }
    if (!ok || !isFinite(r)) {
      let lo = -0.9999, hi = 100, flo = val(lo), fhi = val(hi);
      if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
      for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2, fm = val(mid); if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
      r = (lo + hi) / 2;
    }
    return { rate: r, days: Math.round(days), short: days < 90 };   // under ~3 months an annualised figure is not meaningful
  }

  /* ---------------- loans ---------------- */
  const paymentFor = (principal, apr, months) => { const r = apr / 1200; return r === 0 ? principal / months : principal * r / (1 - Math.pow(1 + r, -months)); };
  /* Month-by-month schedule. Interest is rounded to the cent each month like a lender statement; the last payment is trimmed. */
  function amortize({ principal, apr, payment, months, extra = 0, start, maxMonths = 1200 }) {
    const out = { payment: 0, schedule: [], months: 0, totalInterest: 0, totalPaid: 0, payoffDate: null, neverPaysOff: false };
    if (!(principal > 0)) return out;
    const r = apr / 1200;
    let pay = payment > 0 ? payment : (months > 0 ? paymentFor(principal, apr, months) : 0);
    pay = r2(pay); out.payment = pay;
    if (!(pay > 0)) { out.neverPaysOff = true; return out; }
    let bal = principal, date = start || null, n = 0;
    while (bal > 0.004 && n < maxMonths) {
      n++; const interest = r2(bal * r), want = pay + extra;
      if (want <= interest && n === 1) { out.neverPaysOff = true; return out; }
      const principalPaid = (months > 0 && n >= months && !(payment > 0)) ? bal : Math.min(bal, r2(want - interest)), paid = r2(principalPaid + interest);
      bal = r2(bal - principalPaid); date = start ? addMonths(start, n, pd(start).getDate()) : null;   // always from the first date, so the 31st does not drift to the 28th
      out.schedule.push({ n, date, interest, principal: principalPaid, paid, balance: bal });
      out.totalInterest = r2(out.totalInterest + interest); out.totalPaid = r2(out.totalPaid + paid);
    }
    if (bal > 0.004) out.neverPaysOff = true;
    out.months = out.schedule.length; out.payoffDate = date;
    return out;
  }

  /* ---------------- recurring detection ---------------- */
  const CADENCES = [['weekly', 7, 1.5], ['biweekly', 14, 2.5], ['monthly', 30.4, 4], ['quarterly', 91, 7], ['yearly', 365, 12]];
  /* Looks for payees that repeat on a steady rhythm. Returns suggestions only; nothing is created automatically.
     tx: transactions (income and expense, not transfers, not already generated from a bill). */
  function detectRecurring(tx, { known = new Set(), today, norm = fold } = {}) {
    const groups = new Map();
    for (const t of tx) {
      if (!t || t.type === 'transfer' || t.billId || !t.merchant || !isYMD(t.date) || !(t.amount > 0)) continue;
      const k = t.type + '|' + norm(t.merchant); if (!norm(t.merchant)) continue;
      (groups.get(k) || groups.set(k, []).get(k)).push(t);
    }
    const out = [];
    for (const [k, arr] of groups) {
      arr.sort((a, b) => (a.date < b.date ? -1 : 1));
      const name = arr[arr.length - 1].merchant; if (known.has(norm(name))) continue;
      const gaps = []; for (let i = 1; i < arr.length; i++) gaps.push(diffDays(arr[i - 1].date, arr[i].date));
      if (!gaps.length) continue;
      const mg = median(gaps);
      const cad = CADENCES.find(([, d, tol]) => Math.abs(mg - d) <= tol); if (!cad) continue;
      const [freq, dd, tol] = cad, minCount = freq === 'yearly' ? 2 : freq === 'quarterly' ? 3 : 3;
      if (arr.length < minCount) continue;
      const fit = gaps.filter(g => Math.abs(g - mg) <= Math.max(tol, mg * 0.1)).length / gaps.length;
      if (fit < 0.75) continue;
      const amts = arr.map(t => t.amount), ma = median(amts), dev = median(amts.map(a => Math.abs(a - ma) / ma));
      if (dev > 0.35) continue;                                    // amounts all over the place: not a subscription/bill
      const last = arr[arr.length - 1], interval = freq === 'monthly' ? 30.4 : dd;
      if (today && diffDays(last.date, today) > interval * 2.5) continue;   // stopped a while ago
      const anchor = Math.round(median(arr.map(t => pd(t.date).getDate())));
      const step = d => (freq === 'weekly' ? addDays(d, 7) : freq === 'biweekly' ? addDays(d, 14) : freq === 'monthly' ? addMonths(d, 1, anchor) : freq === 'quarterly' ? addMonths(d, 3, anchor) : addMonths(d, 12, anchor));
      let next = step(last.date), g = 0; while (today && next < today && g++ < 400) next = step(next);
      const conf = clamp(0.4 * fit + 0.3 * (1 - dev / 0.35) + 0.3 * Math.min(1, arr.length / 6), 0, 1);
      out.push({ name, type: last.type, amount: r2(ma), freq, count: arr.length, confidence: Math.round(conf * 100) / 100, amountVariation: Math.round(dev * 1000) / 1000, next, anchor, lastDate: last.date, category: last.category, accountId: last.accountId });
    }
    return out.sort((a, b) => b.confidence - a.confidence || b.amount - a.amount);
  }

  /* ---------------- spending forecast ----------------
     Inputs:  hist  variable expense transactions [{date, amount}] already converted to one currency, EXCLUDING bills
              today 'YYYY-MM-DD',  horizon days ahead.
     Method:  1. window = up to the last `lookback` days (but not before your first transaction)
              2. one-offs removed with outliers() (reported, not hidden)
              3. level  = mean daily spend of what is left (a median of daily totals would be 0 on quiet days and understate the total)
              4. weekday pattern = each weekday's share of the level, shrunk halfway to flat, only with >= 8 weeks of data
              5. month-of-year pattern = same month in earlier years vs your average month, shrunk by n/(n+2), only with >= 13 months
              6. range  = 80% band: +/-1.2816 sigma, sigma from the robust (MAD) spread of weekly totals scaled by sqrt(days/7)
                         (or the daily standard deviation x1.5 while there is under 8 weeks of history). Never below zero.
     Output:  { daily, typicalWeek, excluded[], points:[{date, expected, low, high}] (cumulative spend), confidence, n, days } */
  function spendForecast({ hist, today, horizon = 30, lookback = 120 }) {
    const items = (hist || []).filter(t => t && isYMD(t.date) && t.amount > 0 && t.date <= today);
    if (!items.length) return { daily: 0, typicalWeek: 0, excluded: [], points: [], confidence: 'none', n: 0, days: 0 };
    const first = items.reduce((m, t) => (t.date < m ? t.date : m), items[0].date);
    const wStart = first > addDays(today, -lookback + 1) ? first : addDays(today, -lookback + 1);
    const win = items.filter(t => t.date >= wStart);
    const days = diffDays(wStart, today) + 1;
    const o = outliers(win.map(t => t.amount));
    const kept = win.filter((t, i) => o.keepMask[i]), excluded = win.filter((t, i) => !o.keepMask[i]);
    const daily = {}; for (const t of kept) daily[t.date] = (daily[t.date] || 0) + t.amount;
    const level = sum(kept, t => t.amount) / days;
    // weekday pattern
    const weeks = days / 7, wf = [1, 1, 1, 1, 1, 1, 1];
    if (weeks >= 8 && level > 0) {
      const tot = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < days; i++) { const d = addDays(wStart, i), w = pd(d).getDay(); tot[w] += daily[d] || 0; cnt[w]++; }
      const raw = tot.map((x, w) => (cnt[w] ? x / cnt[w] / level : 1)); const m = mean(raw);
      for (let w = 0; w < 7; w++) wf[w] = 1 + 0.5 * (raw[w] / m - 1);
    }
    // month-of-year pattern (needs a year-on-year overlap)
    const mf = new Array(12).fill(1), spanMonths = diffDays(first, today) / 30.4;
    if (spanMonths >= 13) {
      const perMonth = new Map(); for (const t of items) { const k = t.date.slice(0, 7); perMonth.set(k, (perMonth.get(k) || 0) + t.amount); }
      const full = [...perMonth.entries()].filter(([k]) => k < today.slice(0, 7) && k > first.slice(0, 7));
      const avgM = full.length ? mean(full.map(([, v]) => v)) : 0;
      if (avgM > 0) for (let m = 0; m < 12; m++) {
        const same = full.filter(([k]) => +k.slice(5) === m + 1).map(([, v]) => v);
        if (same.length) mf[m] = 1 + (mean(same) / avgM - 1) * (same.length / (same.length + 2));
      }
    }
    // spread
    const weekly = []; for (let i = 0; i + 7 <= days; i += 7) { let s = 0; for (let j = 0; j < 7; j++) s += daily[addDays(wStart, i + j)] || 0; weekly.push(s); }
    let sigmaDay;
    if (weekly.length >= 8) sigmaDay = robustSigma(weekly) / Math.sqrt(7);
    else { const ds = []; for (let i = 0; i < days; i++) ds.push(daily[addDays(wStart, i)] || 0); sigmaDay = stdev(ds) * 1.5; }
    sigmaDay = Math.max(sigmaDay, 0.3 * level);                  // never claim more certainty than +/-30% of a typical day
    const points = []; let E = 0;
    for (let h = 1; h <= horizon; h++) {
      const d = addDays(today, h), step = level * wf[pd(d).getDay()] * mf[pd(d).getMonth()];
      E += step; const s = sigmaDay * Math.sqrt(h), z = 1.2816;
      points.push({ date: d, expected: r2(E), low: r2(Math.max(0, E - z * s)), high: r2(E + z * s) });
    }
    const confidence = days < 28 || kept.length < 12 ? 'low' : days < 90 ? 'medium' : 'high';
    return { daily: r2(level), typicalWeek: weekly.length ? r2(median(weekly)) : r2(level * 7), excluded, points, confidence, n: kept.length, days, sigmaDay, weekdayFactors: wf, monthFactors: mf };
  }


  /* ---------------- 1.8 report maths (pure; every function takes plain numbers) ---------------- */
  /* income volatility from monthly income totals: coefficient of variation (needs >= 3 months with income) */
  function volatility(monthly) {
    const v = (monthly || []).filter(x => x > 0); if (v.length < 3) return null;
    const m = mean(v), sd = stdev(v), cv = m > 0 ? sd / m : 0;
    return { cv, mean: m, n: v.length, level: cv < 0.1 ? 'stable' : cv < 0.25 ? 'variable' : 'volatile' };
  }
  /* cash buffer: months of essentials, weeks of take-home pay, and a target that rises with income volatility (3 / 4.5 / 6 months) */
  function resilience({ liquid, essentials, takeHome, level }) {
    const target = level === 'volatile' ? 6 : level === 'variable' ? 4.5 : level === 'stable' ? 3 : 6;
    const months = essentials > 0 ? liquid / essentials : null, weeks = takeHome > 0 ? liquid / (takeHome / 4.345) : null;
    const tier = months == null ? null : months < 1 ? 'thin' : months < 3 ? 'building' : months < target ? 'solid' : 'strong';
    return { months, weeks, target, tier, gap: essentials > 0 ? Math.max(0, r2(target * essentials - liquid)) : 0 };
  }
  const savingsTier = rate => rate == null ? null : rate < 0.05 ? 'low' : rate < 0.10 ? 'below' : rate < 0.15 ? 'fair' : rate < 0.20 ? 'good' : 'strong';
  /* month-by-month payoff of several debts. strategy: 'avalanche' (highest APR first), 'snowball' (smallest balance first), 'minimum' (no rollover).
     debts: [{name, balance, apr, minPay}]; extra: money added to the monthly budget on top of the minimums. */
  function payoff(debts, strategy = 'avalanche', extra = 0, maxMonths = 600) {
    const d = (debts || []).filter(x => x.balance > 0).map(x => ({ name: x.name, bal: x.balance, r: (x.apr || 0) / 1200, min: Math.max(0, x.minPay || 0), done: null }));
    const out = { months: 0, totalInterest: 0, order: [], neverPaysOff: false };
    if (!d.length) return out;
    const budget = d.reduce((a, x) => a + x.min, 0) + (strategy === 'minimum' ? 0 : Math.max(0, extra));
    let n = 0;
    while (d.some(x => x.bal > 0.004) && n < maxMonths) {
      n++;
      for (const x of d) if (x.bal > 0) { const i = r2(x.bal * x.r); x.bal = r2(x.bal + i); out.totalInterest = r2(out.totalInterest + i); }
      let pool = strategy === 'minimum' ? 0 : budget;
      if (strategy === 'minimum') { for (const x of d) if (x.bal > 0) { x.bal = r2(x.bal - Math.min(x.bal, x.min)); } }
      else {
        for (const x of d) if (x.bal > 0) { const p = Math.min(x.bal, x.min); x.bal = r2(x.bal - p); pool = r2(pool - p); }
        const order = d.filter(x => x.bal > 0).sort(strategy === 'snowball' ? (a, b) => a.bal - b.bal : (a, b) => b.r - a.r || a.bal - b.bal);
        for (const x of order) { if (pool <= 0) break; const p = Math.min(x.bal, pool); x.bal = r2(x.bal - p); pool = r2(pool - p); }
      }
      for (const x of d) if (x.bal <= 0.004 && x.done == null) { x.done = n; out.order.push({ name: x.name, month: n }); }
    }
    out.months = n; out.neverPaysOff = d.some(x => x.bal > 0.004);
    return out;
  }
  /* financial-independence arithmetic: portfolio needed = annual spending / withdrawal rate; years from compounding + yearly saving (real return) */
  function yearsToIndependence({ annualSpend, investable = 0, annualSave = 0, realReturn = 0.04, swr = 0.039 }) {
    if (!(annualSpend > 0) || !(swr > 0)) return null;
    const target = annualSpend / swr, P = Math.max(0, investable), s = annualSave, r = realReturn;
    if (P >= target) return { target, years: 0, reached: true };
    let years;
    if (Math.abs(r) < 1e-9) years = s > 0 ? (target - P) / s : null;
    else if (s > 0) { const a = (target * r + s) / (P * r + s); years = a > 0 ? Math.log(a) / Math.log(1 + r) : null; }
    else years = (P > 0 && r > 0) ? Math.log(target / P) / Math.log(1 + r) : null;
    if (years == null || !isFinite(years) || years < 0 || years > 80) return { target, years: null, reached: false };
    return { target, years: Math.round(years * 10) / 10, reached: false };
  }

  return { r2, sum, pd, ymd, addDays, addMonths, diffDays, isYMD, quantile, median, mad, robustSigma, mean, stdev, outliers, makeFx, upsertSnapshot, compactSnapshots,
    bucketOf, split503020, savingsRate, emergency, dti, housing, rollingBudget, splitsOf, validateSplits, isFuture, fold, findDuplicates, xirr, paymentFor, amortize, detectRecurring, spendForecast, volatility, resilience, savingsTier, payoff, yearsToIndependence };
});
