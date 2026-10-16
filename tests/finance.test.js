'use strict';
const test = require('node:test'), assert = require('node:assert');
const F = require('../renderer/finance.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

test('robust stats: median / quantile / MAD', () => {
  assert.equal(F.median([5, 1, 3]), 3); assert.equal(F.median([1, 2, 3, 4]), 2.5);
  assert.equal(F.quantile([1, 2, 3, 4, 5], .25), 2); assert.equal(F.mad([1, 1, 2, 2, 4, 6, 9]), 1);
  near(F.robustSigma([1, 1, 2, 2, 4, 6, 9]), 1.4826, 1e-9);
});

test('outliers: a one-off purchase is removed from a run of everyday amounts; small data is left alone', () => {
  const v = [4.5, 5, 6, 4, 5.5, 7, 6.5, 5, 4.8, 6.2, 3000];
  const o = F.outliers(v); assert.deepEqual(o.dropped, [10]); assert.equal(o.keepMask[10], false);
  assert.deepEqual(F.outliers([5, 6, 7, 3000]).dropped, []);                 // < 8 values: never guess
  assert.deepEqual(F.outliers(Array(12).fill(5).concat([5000])).dropped, [12]); // identical amounts (MAD=0) use the IQR fallback
});

test('currency: base is 1, typed rates convert, a missing rate is null (never guessed)', () => {
  const fx = F.makeFx('USD', { EUR: 1.1, BAD: 0, NEG: -2 });
  assert.equal(fx.convert(100, 'USD'), 100); near(fx.convert(100, 'EUR'), 110, 1e-9);
  assert.equal(fx.convert(100, 'GBP'), null); assert.equal(fx.convert(1, 'BAD'), null); assert.equal(fx.convert(1, 'NEG'), null);
  assert.equal(fx.has('EUR'), true); assert.equal(fx.has('JPY'), false);
});

test('net-worth snapshots: one per day, overwrite today, compaction keeps month-ends', () => {
  let l = F.upsertSnapshot([], { d: '2026-10-01', net: 100, assets: 150, liabs: -50 });
  l = F.upsertSnapshot(l, { d: '2026-10-02', net: 110, assets: 160, liabs: -50 });
  l = F.upsertSnapshot(l, { d: '2026-10-02', net: 120.456, assets: 170, liabs: -50 });
  assert.equal(l.length, 2); assert.equal(l[1].net, 120.46);
  const many = []; for (let i = 0; i < 700; i++) many.push({ d: F.addDays('2024-01-01', i), net: i, assets: i, liabs: 0 });
  const c = F.compactSnapshots(many, '2025-12-01');
  assert.ok(c.length < many.length - 250 && c.length > 400);
  assert.ok(c.some(s => s.d === '2024-01-31') && !c.some(s => s.d === '2024-01-30'));
});

test('50/30/20, savings rate, emergency fund, DTI, housing ratio', () => {
  const r = F.split503020({ income: 4000, needs: 1800, wants: 1400 });
  near(r.share.needs, .45, 1e-9); near(r.share.wants, .35, 1e-9); near(r.share.savings, .2, 1e-9);
  assert.deepEqual(r.status, { needs: 'ok', wants: 'over', savings: 'ok' });
  assert.equal(F.split503020({ income: 0, needs: 1, wants: 1 }), null);
  assert.equal(F.split503020({ income: 1000, needs: 900, wants: 400 }).status.savings, 'under');   // deficit
  near(F.savingsRate(5000, 4000), .2, 1e-12); assert.equal(F.savingsRate(0, 10), null);
  const e = F.emergency(9000, 3000); assert.equal(e.months, 3); assert.equal(e.gap, 9000); assert.equal(F.emergency(-50, 3000).months, 0);
  near(F.dti(1500, 5000), .3, 1e-12); near(F.housing(1400, 5000), .28, 1e-12); assert.equal(F.dti(1, 0), null);
  assert.equal(F.bucketOf({ name: 'Groceries' }), 'needs'); assert.equal(F.bucketOf({ name: 'Dining' }), 'wants');
  assert.equal(F.bucketOf({ name: 'Dining', bucket: 'needs' }), 'needs');
});

test('rolling budgets: surplus carries, overspend only carries in "both" mode', () => {
  assert.deepEqual(F.rollingBudget({ budget: 100, roll: 'off', spentPrev: [10, 20] }), { carry: 0, available: 100 });
});
test('rolling budgets: exact carry arithmetic', () => {
  // period1 spent 60 -> carry 40 ; period2 available 140, spent 130 -> carry 10
  assert.deepEqual(F.rollingBudget({ budget: 100, roll: 'surplus', spentPrev: [60, 130] }), { carry: 10, available: 110 });
  // overspend 150 in p1 -> surplus mode forgets it, both mode takes it
  assert.equal(F.rollingBudget({ budget: 100, roll: 'surplus', spentPrev: [150] }).carry, 0);
  assert.equal(F.rollingBudget({ budget: 100, roll: 'both', spentPrev: [150] }).carry, -50);
});

test('splits: sum must match the total to the cent and every part needs a category', () => {
  assert.deepEqual(F.splitsOf({ category: 'a', amount: 10 }), [{ category: 'a', amount: 10 }]);
  const parts = [{ category: 'g', amount: 40.1 }, { category: 'h', amount: 19.9 }];
  assert.equal(F.validateSplits(60, parts).ok, true); assert.equal(F.validateSplits(60.02, parts).ok, false);
  assert.equal(F.validateSplits(60, [{ category: 'g', amount: 60 }]).ok, false);
  assert.equal(F.validateSplits(60, [{ category: 'g', amount: 60 }, { category: '', amount: 0 }]).ok, false);
  assert.equal(F.validateSplits(0.3, [{ category: 'a', amount: 0.1 }, { category: 'b', amount: 0.2 }]).ok, true);   // float drift is not an error
});

test('guards: future dates; duplicates by amount/date/payee and by bank id', () => {
  assert.equal(F.isFuture('2026-10-16', '2026-10-15'), true); assert.equal(F.isFuture('2026-10-15', '2026-10-15'), false);
  const ex = [{ id: '1', type: 'expense', accountId: 'a', amount: 4.5, date: '2026-10-10', merchant: 'Starbucks' }];
  const c = { type: 'expense', accountId: 'a', amount: 4.5, date: '2026-10-11', merchant: 'STARBUCKS #12' };
  assert.equal(F.findDuplicates(c, ex).length, 1);
  assert.equal(F.findDuplicates({ ...c, date: '2026-10-20' }, ex).length, 0);
  assert.equal(F.findDuplicates({ ...c, amount: 4.6 }, ex).length, 0);
  assert.equal(F.findDuplicates({ ...c, merchant: 'Shell' }, ex).length, 0);
  assert.equal(F.findDuplicates({ ...c, accountId: 'b' }, ex).length, 0);
  const b = [{ id: '2', type: 'expense', accountId: 'a', amount: 9, date: '2026-01-01', merchant: 'x', fitid: 'F1' }];
  assert.equal(F.findDuplicates({ type: 'expense', accountId: 'a', amount: 1, date: '2026-05-05', merchant: 'y', fitid: 'F1' }, b)[0].certain, true);
});

test('XIRR: textbook values', () => {
  near(F.xirr([{ date: '2021-01-01', amount: -1000 }, { date: '2022-01-01', amount: 1100 }]).rate, 0.10, 1e-6);
  // Excel's documented XIRR example
  const ex = [['2008-01-01', -10000], ['2008-03-01', 2750], ['2008-10-30', 4250], ['2009-02-15', 3250], ['2009-04-01', 2750]].map(([date, amount]) => ({ date, amount }));
  near(F.xirr(ex).rate, 0.373362535, 1e-6);
  assert.equal(F.xirr([{ date: '2021-01-01', amount: -5 }]), null); assert.equal(F.xirr([{ date: '2021-01-01', amount: 5 }, { date: '2021-02-01', amount: 6 }]), null);
  const loss = F.xirr([{ date: '2021-01-01', amount: -1000 }, { date: '2022-01-01', amount: 800 }]); near(loss.rate, -0.2, 1e-6);
  assert.equal(F.xirr([{ date: '2021-01-01', amount: -1000 }, { date: '2021-01-20', amount: 1010 }]).short, true);
});

test('loan amortisation: known payment, interest and payoff; extra payments; never-pays-off', () => {
  near(F.paymentFor(200000, 6, 360), 1199.10, 0.01);
  const a = F.amortize({ principal: 200000, apr: 6, months: 360, start: '2026-01-31' });
  assert.equal(a.payment, 1199.1); assert.equal(a.months, 360); near(a.totalInterest, 231676, 60);
  assert.equal(a.schedule[a.schedule.length - 1].balance, 0); assert.equal(a.payoffDate, '2056-01-31');
  assert.equal(a.schedule[0].interest, 1000);                                   // 200000 * 0.5%
  const fast = F.amortize({ principal: 200000, apr: 6, months: 360, extra: 300 });
  assert.ok(fast.months < 260 && fast.totalInterest < a.totalInterest - 50000);
  assert.equal(F.amortize({ principal: 10000, apr: 24, payment: 100 }).neverPaysOff, true);   // 200/month interest > payment
  const zero = F.amortize({ principal: 1200, apr: 0, months: 12 }); assert.equal(zero.payment, 100); assert.equal(zero.totalInterest, 0);
  assert.equal(F.amortize({ principal: 0, apr: 5, months: 12 }).months, 0);
});

const mk = (merchant, dates, amount, extra = {}) => dates.map((date, i) => ({ id: merchant + i, merchant, date, amount: typeof amount === 'function' ? amount(i) : amount, type: 'expense', accountId: 'a', category: 'c', ...extra }));
test('recurring detection: monthly / weekly / yearly found; noise, lapsed and known are not', () => {
  const tx = [
    ...mk('Netflix', ['2026-05-14', '2026-06-14', '2026-07-14', '2026-08-14', '2026-09-14'], 15.49),
    ...mk('Gym', ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'], 12),
    ...mk('Insurance', ['2024-10-05', '2025-10-05'], 480),
    ...mk('Cafe', ['2026-09-01', '2026-09-03', '2026-09-20', '2026-10-01', '2026-10-09'], i => [4, 9, 5, 12, 4.5][i]),
    ...mk('Old Mag', ['2025-01-05', '2025-02-05', '2025-03-05', '2025-04-05'], 9),
    ...mk('Salary', ['2026-07-31', '2026-08-31', '2026-09-30'], 3000, { type: 'income' }),
    ...mk('Power', ['2026-06-20', '2026-07-21', '2026-08-19', '2026-09-20'], i => [80, 95, 70, 88][i])
  ];
  const r = F.detectRecurring(tx, { today: '2026-10-15' }), by = n => r.find(x => x.name === n);
  assert.equal(by('Netflix').freq, 'monthly'); assert.equal(by('Netflix').next, '2026-10-14' < '2026-10-15' ? '2026-11-14' : '2026-10-14');
  assert.equal(by('Gym').freq, 'weekly'); assert.equal(by('Insurance').freq, 'yearly'); assert.equal(by('Insurance').next, '2026-10-05' < '2026-10-15' ? '2027-10-05' : '2026-10-05');
  assert.equal(by('Salary').type, 'income'); assert.equal(by('Salary').freq, 'monthly');
  assert.ok(by('Power'), 'variable utility bill is still found'); assert.ok(by('Power').amountVariation > by('Netflix').amountVariation);
  assert.equal(by('Cafe'), undefined); assert.equal(by('Old Mag'), undefined);
  assert.equal(F.detectRecurring(tx, { today: '2026-10-15', known: new Set(['netflix']) }).some(x => x.name === 'Netflix'), false);
  assert.ok(by('Netflix').confidence > by('Power').confidence);
});

test('forecast: excludes the one-off, reports it, widens with the horizon, never goes below zero', () => {
  const hist = []; const start = '2026-06-01';
  for (let i = 0; i < 136; i++) { const d = F.addDays(start, i); if (i % 2 === 0) hist.push({ date: d, amount: 10 + (i % 7) }); }
  hist.push({ date: '2026-09-01', amount: 2500 });                                // laptop
  const f = F.spendForecast({ hist, today: '2026-10-15', horizon: 30 });
  assert.equal(f.excluded.length, 1); assert.equal(f.excluded[0].amount, 2500);
  assert.ok(f.daily > 4 && f.daily < 9, 'daily ' + f.daily);                        // ~ (avg 13 on every second day)
  assert.equal(f.confidence, 'high'); assert.equal(f.points.length, 30);
  const p1 = f.points[0], p30 = f.points[29];
  assert.ok(p30.expected > p1.expected && p30.high - p30.low > p1.high - p1.low);
  assert.ok(f.points.every(p => p.low >= 0 && p.low <= p.expected && p.expected <= p.high));
  const naive = hist.reduce((s, t) => s + t.amount, 0) / 136;
  assert.ok(f.daily < naive / 2, 'plain average would have been inflated by the laptop');
});
test('forecast: little data = low confidence; no data = none; weekday pattern needs 8 weeks', () => {
  const few = F.spendForecast({ hist: [{ date: '2026-10-10', amount: 20 }, { date: '2026-10-12', amount: 30 }], today: '2026-10-15', horizon: 7 });
  assert.equal(few.confidence, 'low'); assert.deepEqual(few.weekdayFactors, [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(F.spendForecast({ hist: [], today: '2026-10-15' }).confidence, 'none');
  const hist = []; for (let i = 0; i < 140; i++) { const d = F.addDays('2026-05-28', i); hist.push({ date: d, amount: F.pd(d).getDay() === 6 ? 60 : 10 }); }
  const f = F.spendForecast({ hist, today: '2026-10-14', horizon: 14 });
  assert.ok(f.weekdayFactors[6] > f.weekdayFactors[2] * 1.5, 'Saturdays are heavier'); near(F.mean(f.weekdayFactors), 1, 1e-9);
});
test('forecast: month-of-year factor appears only with year-on-year history', () => {
  const hist = []; for (let i = 0; i < 800; i += 3) { const d = F.addDays('2024-08-01', i); hist.push({ date: d, amount: d.slice(5, 7) === '12' ? 40 : 10 }); }
  const f = F.spendForecast({ hist, today: '2026-10-15', horizon: 5, lookback: 800 });
  assert.ok(f.monthFactors[11] > 1.1 && f.monthFactors[3] < 1);
  const short = F.spendForecast({ hist: hist.filter(h => h.date > '2026-01-01'), today: '2026-10-15', horizon: 5 });
  assert.ok(short.monthFactors.every(x => x === 1));
});

test('1.8 report maths: payoff strategies, volatility, resilience, independence', () => {
  const F = require('../renderer/finance.js');
  const d = [{ name: 'Card', balance: 5000, apr: 24, minPay: 150 }, { name: 'Car', balance: 8000, apr: 7, minPay: 250 }, { name: 'Small', balance: 600, apr: 12, minPay: 25 }];
  const mn = F.payoff(d, 'minimum'), sn = F.payoff(d, 'snowball', 200), av = F.payoff(d, 'avalanche', 200);
  assert.ok(av.totalInterest <= sn.totalInterest && sn.totalInterest < mn.totalInterest, 'avalanche <= snowball < minimum interest');
  assert.ok(av.months <= mn.months && av.order.length === 3 && !av.neverPaysOff);
  assert.equal(sn.order[0].name, 'Small');  // snowball clears the smallest balance first
  assert.equal(av.order[0].name, 'Card');   // avalanche clears the highest APR first
  assert.equal(F.payoff([{ name: 'x', balance: 1000, apr: 30, minPay: 10 }], 'minimum').neverPaysOff, true);
  assert.equal(F.payoff([], 'avalanche').months, 0);
  assert.equal(F.volatility([3000, 3100]), null);
  assert.equal(F.volatility([3000, 3050, 2950, 3000]).level, 'stable');
  assert.equal(F.volatility([1000, 4000, 2000, 6000]).level, 'volatile');
  const r = F.resilience({ liquid: 9000, essentials: 3000, takeHome: 4000, level: 'variable' });
  assert.equal(r.months, 3); assert.equal(r.target, 4.5); assert.equal(r.tier, 'building' === r.tier ? 'building' : r.tier); assert.equal(r.gap, 4500);
  assert.ok(Math.abs(r.weeks - 9.78) < .01);
  assert.equal(F.savingsTier(0.03), 'low'); assert.equal(F.savingsTier(0.2), 'strong'); assert.equal(F.savingsTier(null), null);
  const fi = F.yearsToIndependence({ annualSpend: 40000, investable: 50000, annualSave: 20000, realReturn: .04, swr: .039 });
  assert.ok(Math.abs(fi.target - 1025641) < 5 && fi.years > 25 && fi.years < 27);
  assert.equal(F.yearsToIndependence({ annualSpend: 40000, investable: 2e6, annualSave: 0 }).reached, true);
  assert.equal(F.yearsToIndependence({ annualSpend: 40000, investable: 0, annualSave: 0 }).years, null);
  assert.equal(F.yearsToIndependence({ annualSpend: 0 }), null);
});
