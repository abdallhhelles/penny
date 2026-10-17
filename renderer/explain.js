'use strict';
/* =========================================================================
   "Why this number?" — every figure that could drive a decision can explain itself:
   what it is, the formula with YOUR numbers filled in, the inputs behind it, a benchmark and where that benchmark comes from.
   Benchmarks are general rules of thumb, not advice; each one names its source so you can judge it.
   Usage: whyBtn('savings') puts a small (?) next to a number; clicking it opens the explanation sheet.
   ========================================================================= */
const WHY={
  networth(){const T=totals(),fx=fxo(),cur=[...new Set(S.accounts.map(accCur))].filter(c=>c!==baseCur());
    return{value:money(T.net),f:trh('why.networth.f',{assets:money(T.assets),debts:money(-T.liabs),net:money(T.net)}),
      inputs:[[tr('why.in.assets'),money(T.assets)],[tr('why.in.debts'),money(-T.liabs)],...cur.map(c=>[tr('why.in.rate',{cur:c,base:baseCur()}),fx.rate(c)==null?tr('why.in.missing'):String(fx.rate(c))]),[tr('why.in.snapshots'),String(snapshotDays())]],
      bench:null,notes:[tr('why.networth.n')]};},
  savings(){const p=planning(),r=p.savingsRate;
    return{value:r==null?'—':pct(r),f:trh('why.savings.f',{income:money(p.income),expenses:money(p.expenses),result:r==null?'—':pct(r)}),
      inputs:[[tr('why.in.income'),money(p.income)],[tr('why.in.expenses'),money(p.expenses)],[tr('why.in.basis'),basisText(p)]],bench:{t:tr('why.savings.b'),s:tr('why.savings.s')}};},
  rule(){const p=planning(),r=p.split;
    return{value:r?`${pct(r.share.needs)} · ${pct(r.share.wants)} · ${pct(r.share.savings)}`:'—',
      f:r?trh('why.rule.f',{income:money(p.income),needs:money(p.needs),wants:money(p.wants),savings:money(r.amounts.savings)}):tr('why.rule.none'),
      inputs:[[tr('why.in.needs'),money(p.needs)],[tr('why.in.wants'),money(p.wants)],[tr('why.in.saved'),r?money(r.amounts.savings):'—'],[tr('why.in.basis'),basisText(p)]],
      bench:{t:tr('why.rule.b'),s:tr('why.rule.s')},notes:[tr('why.rule.n')]};},
  emergency(){const p=planning(),e=p.emergency;
    return{value:e?tr('why.months',{n:e.months.toFixed(1)}):'—',f:e?trh('why.emergency.f',{liquid:money(p.liquid),ess:money(p.essentials),months:e.months.toFixed(1)}):tr('why.none'),
      inputs:[[tr('why.in.liquid'),money(p.liquid)],[tr(p.essentialsAreNeeds?'why.in.needsMonthly':'why.in.spendMonthly'),money(p.essentials)],e?[tr('why.in.gap'),money(e.gap)]:null].filter(Boolean),
      bench:{t:tr('why.emergency.b'),s:tr('why.emergency.s')}};},
  dti(){const p=planning(),r=p.dti;
    return{value:r==null?'—':pct(r),f:r==null?tr('why.none'):trh('why.dti.f',{debt:money(p.debtPay),gross:money(p.gross),result:pct(r)}),
      inputs:[[tr('why.in.debtPay'),money(p.debtPay)],[tr('why.in.gross'),money(p.gross)]],bench:{t:tr('why.dti.b'),s:tr('why.dti.s')},notes:[tr('why.dti.n'),p.assumedNet?tr('why.assumedNet'):''].filter(Boolean)};},
  housing(){const p=planning(),r=p.housingRatio;
    return{value:r==null?'—':pct(r),f:r==null?tr('why.none'):trh('why.housing.f',{housing:money(p.housing),gross:money(p.gross),result:pct(r)}),
      inputs:[[tr('why.in.housing'),money(p.housing)],[tr('why.in.gross'),money(p.gross)]],bench:{t:tr('why.housing.b'),s:tr('why.housing.s')},notes:[p.assumedNet?tr('why.assumedNet'):''].filter(Boolean)};},
  safe(){const x=safeToSpend(),T=totals();
    return{value:money(x.perDay),f:trh('why.safe.f',{cash:money(T.liquid),inc:money(x.inc),bills:money(x.bills),days:x.left,result:money(x.perDay)}),
      inputs:[[tr('why.in.liquid'),money(T.liquid)],[tr('why.in.incDue'),money(x.inc)],[tr('why.in.billsDue'),money(x.bills)],[tr('why.in.daysLeft'),String(x.left)]],bench:null};},
  forecast(){const f=forecast(60),sf=f.sf,last=sf.points[sf.points.length-1];
    return{value:last?`${money(last.low)} – ${money(last.high)}`:'—',f:trh('why.forecast.f',{daily:money(f.daily),week:money(f.typicalWeek)}),
      inputs:[[tr('why.in.daily'),money(f.daily)],[tr('why.in.typicalWeek'),money(f.typicalWeek)],[tr('why.in.history'),tr('why.in.days',{n:sf.days||0})],[tr('why.in.conf'),tr('why.conf.'+f.confidence)],
        [tr('why.in.excluded'),f.excluded.length?f.excluded.map(x=>`${esc(x.date)} ${money(x.amount)}`).join(', '):tr('why.in.noneExcluded')]],
      bench:null,notes:[tr('why.forecast.n1'),tr('why.forecast.n2'),tr('why.forecast.n3')]};},
  health(){const h=healthScore();
    return{value:`${h.total}/100`,f:tr('why.health.f'),inputs:h.parts.map(p=>[p.n,`${Math.round(p.v)}/${p.max} · ${p.d}`]),bench:null,notes:[tr('why.health.n')]};},
  xirr(id){const a=acc(id),r=a?accReturn(a):null;
    return{value:r?pct(r.rate,1):'—',f:tr('why.xirr.f'),inputs:r?[[tr('why.in.flows'),String(r.flows.length)],[tr('why.in.span'),tr('why.in.days',{n:r.days})],[tr('why.in.value'),accMoney(r.value,a)]]:[],
      bench:null,notes:[tr('why.xirr.n'),r&&r.short?tr('why.xirr.short'):''].filter(Boolean)};},
  loan(id){const a=acc(id),l=a?loanPlan(a):null;
    return{value:l&&l.payoffDate?dlong(l.payoffDate):'—',f:trh('why.loan.f',{}),inputs:l?[[tr('why.in.balance'),accMoney(-balance(a),a)],[tr('why.in.apr'),`${a.apr||0}%`],[tr('why.in.payment'),accMoney(l.payment,a)],[tr('why.in.totalInterest'),accMoney(l.totalInterest,a)]]:[],bench:null,notes:[tr('why.loan.n')]};},
  budget(id){const c=S.categories.find(x=>x.id===id);if(!c)return null;const b=budgetFor(c,typeof budOff==='number'?budOff:0);
    return{value:money(b.available),f:trh('why.budget.f',{base:money(b.base),carry:money(b.carry),avail:money(b.available)}),inputs:[[tr('why.in.limit'),money(b.base)],[tr('why.in.carry'),money(b.carry)],[tr('why.in.mode'),tr('cat.roll.'+(c.roll||'off'))]],bench:null};},
  recurring(){return{value:String(detectRecurringAll().length),f:tr('why.recurring.f'),inputs:[],bench:null,notes:[tr('why.recurring.n')]};}
};
function basisText(p){return p.partial?tr('why.basis.partial'):tr('why.basis.avg',{n:p.periods});}
const whyBtn=(key,arg='',label='')=>`<button type="button" class="whybtn" data-why="${key}" ${arg?`data-arg="${esc(arg)}"`:''} aria-label="${esc(tr('why.aria',{what:label||tr('why.'+key+'.t')}))}" title="${trh('why.how')}">${icon('help',14,2)}</button>`;
function openWhy(key,arg){
  const w=WHY[key]&&WHY[key](arg);if(!w)return;
  const kv=w.inputs.length?`<div class="sec-h" style="margin-top:14px">${trh('why.inputs')}</div><div class="group flat">${w.inputs.map(([k,v])=>`<div class="kv" style="padding:9px 16px"><span>${esc(k)}</span><b dir="auto">${esc(v)}</b></div>`).join('')}</div>`:'';
  const bench=w.bench?`<div class="sec-h">${trh('why.benchmark')}</div><div class="card glass" style="padding:14px 16px"><div>${esc(w.bench.t)}</div><div class="muted sm" style="margin-top:6px">${trh('why.source')}: ${esc(w.bench.s)}</div></div>`:'';
  const notes=(w.notes||[]).filter(Boolean).map(n=>`<p class="muted sm" style="margin:10px 4px 0">${esc(n)}</p>`).join('');
  openSheet({title:tr('why.'+key+'.t'),ok:null,cancel:tr('common.close'),body:`<div style="text-align:center;margin:2px 0 12px"><div class="big" dir="auto">${esc(w.value)}</div></div>
    <div class="sec-h" style="margin-top:0">${trh('why.formula')}</div><div class="card glass why-f" dir="auto">${w.f}</div>${kv}${bench}${notes}
    <p class="faint sm" style="margin:14px 4px 0">${trh('why.disclaimer')}</p>`});
}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-why]');if(!b)return;e.preventDefault();e.stopPropagation();openWhy(b.dataset.why,b.dataset.arg);},true);
