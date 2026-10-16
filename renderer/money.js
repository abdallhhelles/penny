'use strict';
/* =========================================================================
   Money screens added in 1.7: Money Health card, exchange-rate settings, debts & investments (loan schedule, XIRR), recurring suggestions.
   All numbers come from core.js / finance.js; this file only draws them.
   ========================================================================= */
function fxWarn(){
  const m=totals().missing;if(!m.length)return'';
  return`<div class="notice warn" role="status">${icon('alert',16)}<span>${trh('fx.missing',{cur:m.join(', ')})}</span><a data-go="settings">${trh('fx.add')}</a></div>`;
}

/* ---------- dashboard: Money health ---------- */
const TONE=(v,good,warn,higherBetter=true)=>higherBetter?(v>=good?'good':v>=warn?'warn':'bad'):(v<=good?'good':v<=warn?'warn':'bad');
function ratioRow(key,label,value,fill,tone,marker,sub){
  return`<div class="rr"><div class="row sm" style="margin-bottom:6px"><span>${esc(label)}${whyBtn(key)}</span><b class="amt ${tone}" dir="auto">${esc(value)}</b></div>
   <div class="barw"><div class="bar ${tone}"><i style="width:${clamp(fill,0,1)*100}%"></i></div>${marker!=null?`<div class="pace" style="left:${clamp(marker,0,1)*100}%"></div>`:''}</div>${sub?`<div class="faint sm" style="margin-top:4px">${esc(sub)}</div>`:''}</div>`;
}
DW.planning=()=>{
  const p=planning(),head=ch('shield','var(--teal)',tr('widget.planning'),p.partial?tr('plan.partial'):tr('plan.basis',{n:p.periods}));
  if(!(p.income>0)&&!(p.expenses>0))return`<div class="card glass">${head}${emptyBox('🎯',tr('plan.none'),`<div>${trh('plan.noneD')}</div>`)}</div>`;
  const rows=[];
  if(p.savingsRate!=null)rows.push(ratioRow('savings',tr('plan.savings'),pct(p.savingsRate),p.savingsRate/.4,TONE(p.savingsRate,.2,.1),.5,tr('plan.target',{v:pct(.2)})));
  if(p.split){const r=p.split,seg=(k,c)=>`<i style="width:${clamp(r.share[k],0,1)*100}%;background:${c}"></i>`;
    rows.push(`<div class="rr"><div class="row sm" style="margin-bottom:6px"><span>${trh('plan.rule')}${whyBtn('rule')}</span><b class="amt" dir="ltr">${Math.round(r.share.needs*100)} / ${Math.round(r.share.wants*100)} / ${Math.round(Math.max(0,r.share.savings)*100)}</b></div>
     <div class="bar stack">${seg('needs','var(--blue)')}${seg('wants','var(--orange)')}${seg('savings','var(--green)')}</div>
     <div class="legend sm" style="margin-top:6px"><div><i style="background:var(--blue)"></i>${trh('plan.needs')} ${pct(r.share.needs)} <span class="faint">/ ${pct(.5)}</span></div><div><i style="background:var(--orange)"></i>${trh('plan.wants')} ${pct(r.share.wants)} <span class="faint">/ ${pct(.3)}</span></div><div><i style="background:var(--green)"></i>${trh('plan.saved')} ${pct(r.share.savings)} <span class="faint">/ ${pct(.2)}</span></div></div></div>`);}
  if(p.emergency)rows.push(ratioRow('emergency',tr('plan.emergency'),tr('why.months',{n:p.emergency.months.toFixed(1)}),p.emergency.ratio,TONE(p.emergency.ratio,1,.5),1,p.emergency.gap>0?tr('plan.gap',{amount:money(p.emergency.gap)}):tr('plan.funded')));
  if(p.dti!=null)rows.push(ratioRow('dti',tr('plan.dti'),pct(p.dti),p.dti/.5,TONE(p.dti,.36,.43,false),.36/.5,tr('plan.target',{v:'≤ '+pct(.36)})));
  else if(!S.accounts.some(a=>isLiab(a)&&a.minPay>0))rows.push(`<div class="rr faint sm">${trh('plan.dtiHint')}</div>`);
  if(p.housingRatio!=null&&p.housing>0)rows.push(ratioRow('housing',tr('plan.housing'),pct(p.housingRatio),p.housingRatio/.5,TONE(p.housingRatio,.28,.35,false),.28/.5,tr('plan.target',{v:'≤ '+pct(.28)})));
  return`<div class="card glass">${head}<div class="rr-list">${rows.join('')}</div></div>`;
};

/* ---------- settings: gross income + exchange rates ---------- */
function fxRowsHtml(s){
  const cur=[...new Set(S.accounts.map(accCur))].filter(c=>c!==s.currency);
  const rows=cur.map(c=>srow('coins','var(--teal)',trh('fx.rate',{cur:c,base:s.currency}),(s.fx&&s.fx[c])?'':`<span class="bad">${trh('fx.missingRow')}</span>`,`<input type="number" step="0.0001" min="0" data-fx="${esc(c)}" value="${(s.fx&&s.fx[c])||''}" placeholder="0.0000" dir="ltr" aria-label="${trh('fx.rate',{cur:c,base:s.currency})}">`)).join('');
  return srow('briefcase','var(--blue)',trh('set.gross'),trh('set.grossD'),`<input type="number" id="st_gross" min="0" step="1" value="${s.grossIncome||''}" placeholder="${trh('common.optional')}">`)
    +(rows||`<div class="setrow plain"><div class="grow"><small>${trh('fx.none')}</small></div></div>`)
    +(rows?`<div class="setrow plain"><div class="grow"><small>${trh('fx.note')}</small></div></div>`:'');
}
function bindFxRows(v,set){
  const g=$('#st_gross',v);if(g)g.onchange=e=>{const n=parseFloat(e.target.value);set('grossIncome',n>0?n:null);};
  $$('[data-fx]',v).forEach(i=>i.onchange=()=>{const n=parseFloat(i.value);S.settings.fx=S.settings.fx||{};if(n>0)S.settings.fx[i.dataset.fx]=n;else delete S.settings.fx[i.dataset.fx];changed();});
}

/* ---------- accounts page: debts & investments ---------- */
function accountsExtra(){
  const debts=S.accounts.filter(a=>isLiab(a)&&balance(a)<0),inv=S.accounts.filter(a=>a.type==='investment');
  if(!debts.length&&!inv.length)return'';
  const drow=a=>{const pl=loanPlan(a);
    const sub=pl?(pl.neverPaysOff?`<span class="bad">${trh('loan.never')}</span>`:trh('loan.payoff',{date:dlong(pl.payoffDate),months:pl.months,interest:accMoney(pl.totalInterest,a)})):trh('loan.setup');
    return`<div class="li" data-loan="${a.id}" role="button" tabindex="0"><div class="sq">${gl(ACC_TYPES[a.type].e)}</div><div class="grow"><b>${esc(a.name)}</b><small>${sub}</small></div><div class="end"><span class="amt bad">${accMoney(-balance(a),a)}</span></div>${icon('chevron',16)}</div>`;};
  const irow=a=>{const r=accReturn(a);
    const sub=r?(r.short?trh('inv.short',{days:r.days}):trh('inv.xirr',{days:r.days})):trh('inv.setup');
    return`<div class="li" data-inv="${a.id}" role="button" tabindex="0"><div class="sq">${gl(ACC_TYPES[a.type].e)}</div><div class="grow"><b>${esc(a.name)}</b><small>${sub}</small></div><div class="end"><span class="amt">${accMoney(balance(a),a)}</span>${r?`<div class="${r.rate>=0?'good':'bad'} sm" dir="ltr">${r.rate>=0?'+':''}${pct(r.rate,1)}${whyBtn('xirr',a.id,tr('inv.xirrName'))}</div>`:''}</div></div>`;};
  return`${debts.length?`<div class="sec-h">${trh('loan.title')}</div><div class="group">${debts.map(drow).join('')}</div>`:''}${inv.length?`<div class="sec-h">${trh('inv.title')}</div><div class="group">${inv.map(irow).join('')}</div>`:''}`;
}
function bindAccountsExtra(v){
  $$('[data-loan]',v).forEach(el=>{const go=()=>openLoan(el.dataset.loan);el.onclick=e=>{if(e.target.closest('[data-why]'))return;go();};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});
  $$('[data-inv]',v).forEach(el=>{const go=()=>openAcc(acc(el.dataset.inv));el.onclick=e=>{if(e.target.closest('[data-why]'))return;go();};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});
}
function openLoan(id){
  const a=acc(id);if(!a)return;let extra=0;
  const body=()=>{const pl=loanPlan(a,extra),base=loanPlan(a,0);
    if(!pl)return`<p class="muted" style="text-align:center">${trh('loan.setup')}</p>`;
    const sv=base&&!base.neverPaysOff&&!pl.neverPaysOff&&extra>0?`<div class="notice good">${trh('loan.saves',{months:base.months-pl.months,interest:accMoney(base.totalInterest-pl.totalInterest,a)})}</div>`:'';
    const years={};pl.schedule.forEach(r=>{const y=(r.date||'').slice(0,4);const o=years[y]||(years[y]={interest:0,principal:0,end:0});o.interest+=r.interest;o.principal+=r.principal;o.end=r.balance;});
    return`<div style="text-align:center;margin-bottom:8px"><div class="muted sm">${trh('loan.payment')}</div><div class="big">${accMoney(pl.payment+extra,a)}</div></div>
     <div class="group flat"><div class="kv" style="padding:9px 16px"><span>${trh('loan.owed')}</span><b>${accMoney(-balance(a),a)}</b></div><div class="kv" style="padding:9px 16px"><span>${trh('why.in.apr')}</span><b>${a.apr||0}%</b></div>
      <div class="kv" style="padding:9px 16px"><span>${trh('loan.payoffDate')}</span><b>${pl.neverPaysOff?'—':esc(dlong(pl.payoffDate))}</b></div><div class="kv" style="padding:9px 16px"><span>${trh('why.in.totalInterest')}</span><b>${accMoney(pl.totalInterest,a)}</b></div></div>
     ${pl.neverPaysOff?`<div class="notice warn">${icon('alert',16)}<span>${trh('loan.never')}</span></div>`:''}${sv}
     <div class="fg" style="margin-top:12px"><div class="fr"><label>${trh('loan.extra')}</label><input id="lx" type="number" min="0" step="10" value="${extra||''}" placeholder="0"></div></div>
     ${pl.neverPaysOff?'':`<div class="sec-h">${trh('loan.byYear')}</div><div class="group flat"><div class="kv" style="padding:8px 16px;font-size:12.5px"><span>${trh('loan.year')}</span><span style="display:flex;gap:18px"><span>${trh('loan.interest')}</span><span>${trh('loan.principal')}</span><span>${trh('loan.left')}</span></span></div>${Object.entries(years).map(([y,o])=>`<div class="kv" style="padding:8px 16px"><span>${esc(y)}</span><span class="amt sm" style="display:flex;gap:18px"><span>${accMoney(o.interest,a)}</span><span>${accMoney(o.principal,a)}</span><b>${accMoney(o.end,a)}</b></span></div>`).join('')}</div>`}
     <p class="faint sm" style="margin:12px 4px 0">${trh('loan.n')} ${whyBtn('loan',a.id)}</p>`;};
  const s=openSheet({title:a.name,ok:null,cancel:tr('common.close'),body:`<div id="lb">${body()}</div>`,mount:s=>{
    const wire=()=>{const i=$('#lx',s);if(i)i.oninput=()=>{extra=Math.max(0,parseFloat(i.value)||0);const pos=i.selectionStart;$('#lb',s).innerHTML=body();const n=$('#lx',s);n.focus();try{n.setSelectionRange(pos,pos);}catch{}wire();};};wire();}});
}

/* ---------- recurring suggestions (Bills page) ---------- */
function recurringSuggestHtml(){
  const sug=detectRecurringAll().slice(0,8);if(!sug.length)return{html:'',sug};
  return{sug,html:`<div class="sec-h">${trh('rec.title')}${whyBtn('recurring')}</div><div class="group">${sug.map((s,i)=>`<div class="sugg"><div class="sq sm">${gl(s.type==='income'?'💰':'🔁',16)}</div><div class="grow"><b>${esc(s.name)}</b><div class="muted sm">${trh('rec.line',{amount:money(s.amount),freq:tr('freq.'+s.freq).toLocaleLowerCase(I18N.lang),count:s.count,next:dshort(s.next)})} · ${trh('rec.conf',{pct:Math.round(s.confidence*100)})}</div></div><button class="btn sm tint" data-sug="${i}">${trh('rec.track')}</button></div>`).join('')}</div>`};
}
