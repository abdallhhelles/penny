'use strict';
/* ================= CALENDAR ================= */
let calOff=0,calSel=null;
PAGES.calendar={title:'Calendar',
 render(){
  const now=new Date(),base=new Date(now.getFullYear(),now.getMonth()+calOff,1),y=base.getFullYear(),m=base.getMonth();
  const c=calendarMonth(y,m),t=today(),label=FMT.monthYear(base);
  const names=[];for(let i=0;i<7;i++)names.push(FMT.weekdayShort(new Date(2024,0,1+i)));
  const tot=Object.values(c.days).reduce((a,d)=>({exp:a.exp+d.exp,inc:a.inc+d.inc,bills:a.bills+d.bills.filter(b=>b.type==='expense').reduce((s,b)=>s+b.amount,0)}),{exp:0,inc:0,bills:0});
  const mx=Math.max(1,...Object.values(c.days).map(d=>d.exp));
  let cells='';for(let i=0;i<c.startDow;i++)cells+='<div class="cd empty"></div>';
  for(const [d,o] of Object.entries(c.days)){
    const heat=o.exp>0?Math.min(.55,.1+o.exp/mx*.45):0;
    cells+=`<div class="cd ${d===t?'today':''} ${d>t?'future':''}" data-cd="${d}" style="--h:${heat.toFixed(2)}"><span class="n">${+d.slice(8)}</span>${o.exp>0?`<span class="e amt">${moneyC(o.exp)}</span>`:''}${o.inc>0?`<span class="i amt">+${moneyC(o.inc)}</span>`:''}<span class="dots">${o.bills.slice(0,2).map(b=>`<i style="background:${b.type==='income'?'var(--green)':cat(b.category).color}"></i>`).join('')}${o.rems.slice(0,2).map(r=>`<i class="rd" style="background:${remKind(r).c}"></i>`).join('')}</span></div>`;
  }
  return`<div class="page wrap">${lt('Calendar','Spending, income and bills at a glance',`<div class="seg"><button data-co="-1" aria-label="Previous month">‹</button><button data-co="0">Today</button><button data-co="1" aria-label="Next month">›</button></div>`)}
  <div class="grid g3" style="margin-bottom:16px"><div class="card glass"><div class="kpi-l">Spent</div><div class="kpi-v amt">${money(tot.exp)}</div></div><div class="card glass"><div class="kpi-l">Income</div><div class="kpi-v amt good">${money(tot.inc)}</div></div><div class="card glass"><div class="kpi-l">Bills still to come</div><div class="kpi-v amt">${money(tot.bills)}</div></div></div>
  <div class="card glass"><div class="cal-h"><b style="font-size:20px;letter-spacing:-.4px">${label}</b></div><div class="cal">${names.map(n=>`<div class="dn">${n}</div>`).join('')}${cells}</div></div></div>`;
 },
 after(v){
  $$('[data-co]',v).forEach(b=>b.onclick=()=>{calOff=+b.dataset.co?calOff+ +b.dataset.co:0;refresh();});
  $$('[data-cd]',v).forEach(c=>c.onclick=()=>openDay(c.dataset.cd));
 }};
function openDay(d){
  const tx=S.transactions.filter(x=>x.date===d).sort((a,b)=>b.amount-a.amount);
  const bills=S.bills.filter(b=>occurrences(b,d,d).length||(!b.auto&&b.next===d));
  const rems=calendarMonth(+d.slice(0,4),+d.slice(5,7)-1).days[d].rems;
  const spent=sum(tx.filter(x=>x.type==='expense'),x=>x.amount);
  openSheet({title:dlong(d),ok:'Add here',cancel:'Close',body:`
   <div class="sec-f" style="text-align:center;margin:0 0 12px">${tx.length?`${tx.length} transaction${tx.length>1?'s':''} · spent ${money(spent)}`:'Nothing recorded this day'}</div>
   ${rems.length?`<div class="sec-h" style="margin-top:0">Reminders</div><div class="group">${rems.map(remRow).join('')}</div>`:''}
   ${bills.length?`<div class="sec-h" style="margin-top:0">Due</div><div class="group">${bills.map(b=>`<div class="li noicon"><div class="sq sm" style="--c-bg:${cat(b.category).color}30">${gl(cat(b.category).emoji)}</div><div class="grow"><b>${esc(b.name)}</b><small>${FREQ[b.freq]}</small></div><span class="amt ${b.type==='income'?'good':''}">${money(b.amount)}</span></div>`).join('')}</div>`:''}
   ${tx.length?`<div class="sec-h">Transactions</div><div class="group">${tx.map(txRow).join('')}</div>`:''}`,
   mount(s){$$('[data-tx]',s).forEach(r=>r.onclick=()=>{closeModal();setTimeout(()=>openTx(S.transactions.find(t=>t.id===r.dataset.tx)),250);});},
   onOk(){closeModal();setTimeout(()=>openTx(null,{date:d,type:'expense'}),250);}});
}

/* ================= PLANNER (Pro) ================= */
let planM='avalanche',planX=100,planCut=10,planSave=100;
const fmtMonths=n=>{const y=Math.floor(n/12),m=n%12;return(y?y+' yr ':'')+(m||!y?m+' mo':'');};
PAGES.plan={title:'Projections',
 render(){
  if(!can('plan'))return`<div class="page wrap">${lt('Projections','Plan your way out of debt and into your goals')}<div class="group">${emptyBox('✨','Projections is a Pro feature','<div>Compare debt-payoff strategies, see your future net worth and when you will hit each goal.</div>',`<button class="btn pri" data-act="upgrade">See Penny Pro</button>`)}</div></div>`;
  const debts=debtList(),ru=roundUps(30),rw=runway(),st=streaks();
  const noRate=debts.filter(d=>!d.apr).length;
  const base=debtPlan(0,planM),pl=debtPlan(planX,planM),w=whatIf(planCut,planSave);
  const debtHtml=!debts.length?`<div class="group">${emptyBox('🎉','No debts to plan','<div>Add a credit card or loan account (with its interest rate) and Penny will build a payoff plan.</div>',btn('plus','Add a debt account','data-act="addacc"','pri'))}</div>`:`
   <div class="card glass"><div class="row" style="margin-bottom:14px"><div class="seg" id="pm"><button data-m="avalanche" class="${planM==='avalanche'?'on':''}">Avalanche</button><button data-m="snowball" class="${planM==='snowball'?'on':''}">Snowball</button></div><span class="muted sm" style="margin-left:12px">${planM==='avalanche'?'Highest interest first — pays the least interest':'Smallest balance first — fastest early wins'}</span></div>
    <label class="f">Extra payment each month · <b id="pxv" style="color:var(--text)">${money(planX)}</b></label><input type="range" id="px" min="0" max="2000" step="25" value="${planX}">
    <div class="grid g3" style="margin-top:22px;text-align:center"><div><div class="kpi-l">Debt-free in</div><div class="kpi-v" id="pr1">${pl.capped?'50+ yrs':fmtMonths(pl.months)}</div><div class="faint sm">${pl.capped?'at this pace':dshort(addMonths(today(),pl.months,1))}</div></div><div><div class="kpi-l">Total interest</div><div class="kpi-v amt" id="pr2">${money(pl.interest)}</div></div><div><div class="kpi-l">You save</div><div class="kpi-v amt good" id="pr3">${pl.capped||base.capped?'—':money(Math.max(0,base.interest-pl.interest))}</div><div class="faint sm" id="pr4">${pl.capped||base.capped?'':Math.max(0,base.months-pl.months)+' months sooner'}</div></div></div></div>
   <div class="sec-h">Payoff order</div><div class="group" id="porder">${[...pl.list].sort((a,b)=>(pl.done[a.id]||0)-(pl.done[b.id]||0)).map(d=>`<div class="li noicon"><div class="grow"><b>${esc(d.name)}</b><small>${d.apr?d.apr+'% APR':'No rate set'} · min ${money(d.min)}/mo</small></div><span class="pill good">Paid off in ${fmtMonths(pl.done[d.id]||0)}</span></div>`).join('')}</div>
   ${pl.stuck.length?`<div class="sec-f" style="color:var(--orange)">${icon('alert',14,2.2)} ${pl.stuck.map(x=>`${esc(x.name)}'s minimum doesn't cover its monthly interest — pay at least ${money(x.need)}`).join('; ')}. Extra payments below will count toward this.</div>`:''}
   ${noRate?`<div class="sec-f">${noRate} debt${noRate>1?'s have':' has'} no interest rate yet — edit the account to add one for accurate results.</div>`:''}`;
  const proj=[];for(let i=0;i<=60;i++)proj.push({x:addMonths(today(),i,1),y:w.now+w.mo*i});
  return`<div class="page wrap">${lt('Projections','Plan your way out of debt and into your goals')}
  <div class="sec-h" style="margin-top:0">Debt payoff</div>${debtHtml}
  <div class="sec-h">Future net worth</div>
  <div class="card glass"><div class="grid g2" style="gap:24px"><div><label class="f">Spend less by <b id="wcv" style="color:var(--text)">${planCut}%</b></label><input type="range" id="wc" min="0" max="40" value="${planCut}"></div><div><label class="f">Save extra · <b id="wsv" style="color:var(--text)">${money(planSave)}</b> / month</label><input type="range" id="ws" min="0" max="2000" step="25" value="${planSave}"></div></div>
   <div class="chart" id="wchart" style="margin-top:18px"></div>
   <div class="grid g4" style="margin-top:14px;text-align:center" id="wgrid">${[1,3,5,10].map(y=>`<div><div class="kpi-l">In ${y} year${y>1?'s':''}</div><div class="kpi-v amt" data-y="${y}">${money(w.at(y))}</div><div class="faint sm" data-yd="${y}">${w.at(y)-w.atBase(y)>=0?'+':'−'}${money(Math.abs(w.at(y)-w.atBase(y)))} vs today's pace</div></div>`).join('')}</div>
   <div class="hint">Based on your last 3 periods: you earn ${money(w.inc)} and spend ${money(w.exp)} per month. Estimates only — no investment growth assumed.</div></div>
  ${S.goals.filter(g=>g.saved<g.target).length?`<div class="sec-h">When will I reach my goals?</div><div class="group" id="geta">${S.goals.filter(g=>g.saved<g.target).map(g=>{const n=goalEta(g,Math.max(0,w.mo)/Math.max(1,S.goals.filter(x=>x.saved<x.target).length));return`<div class="li noicon"><span class="lic big">${gl(g.emoji,22)}</span><div class="grow"><b>${esc(g.name)}</b><small>${money(g.target-g.saved)} to go</small></div><span class="pill ${n==null?'bad':n<=12?'good':''}">${n==null?'Not at this pace':n<=1?'This month':'in '+fmtMonths(n)}</span></div>`;}).join('')}</div><div class="sec-f">Assumes your monthly surplus is shared equally between open goals.</div>`:''}
  <div class="sec-h">Small habits, big effect</div>
  <div class="grid g3"><div class="card glass"><div class="kpi-l">${gl('🪙',14)} Round-ups · 30 days</div><div class="kpi-v amt">${money(ru.total)}</div><div class="faint sm">≈ ${money(ru.yearly)} a year</div></div><div class="card glass"><div class="kpi-l">${gl('🛟',14)} Runway</div><div class="kpi-v">${rw.months.toFixed(1)} months</div><div class="faint sm">of normal spending in cash</div></div><div class="card glass"><div class="kpi-l">🔥 No-spend streak</div><div class="kpi-v">${st.noSpend} day${st.noSpend===1?'':'s'}</div><div class="faint sm">best: ${st.best} days</div></div></div></div>`;
 },
 after(v){
  if(!can('plan'))return;
  const w0=()=>whatIf(planCut,planSave);
  const drawW=()=>{const w=w0();const proj=[];for(let i=0;i<=60;i++)proj.push({x:addMonths(today(),i,1),y:w.now+w.mo*i});drawArea($('#wchart',v),proj,{h:200,color:'var(--green)'});};
  if($('#wchart',v))drawW();
  const upW=()=>{const w=w0();$('#wcv',v).textContent=planCut+'%';$('#wsv',v).textContent=money(planSave);$$('[data-y]',v).forEach(e=>e.textContent=money(w.at(+e.dataset.y)));$$('[data-yd]',v).forEach(e=>{const y=+e.dataset.yd,d=w.at(y)-w.atBase(y);e.textContent=`${d>=0?'+':'−'}${money(Math.abs(d))} vs today's pace`;});drawW();};
  const wc=$('#wc',v);if(wc){wc.oninput=e=>{planCut=+e.target.value;upW();};$('#ws',v).oninput=e=>{planSave=+e.target.value;upW();};}
  const pm=$('#pm',v);if(pm)pm.onclick=e=>{const b=e.target.closest('[data-m]');if(b){planM=b.dataset.m;refresh();}};
  const px=$('#px',v);if(px)px.oninput=e=>{planX=+e.target.value;const b=debtPlan(0,planM),p=debtPlan(planX,planM);$('#pxv',v).textContent=money(planX);$('#pr1',v).textContent=p.capped?'50+ yrs':fmtMonths(p.months);$('#pr2',v).textContent=money(p.interest);$('#pr3',v).textContent=p.capped||b.capped?'—':money(Math.max(0,b.interest-p.interest));$('#pr4',v).textContent=p.capped||b.capped?'':Math.max(0,b.months-p.months)+' months sooner';};
 }};

/* ================= EXTRA DASHBOARD WIDGETS ================= */
DW.digest=()=>{const d=weeklyDigest();
  if(!S.transactions.length)return'';
  const dl=d.ptot>0?`<span class="pill ${d.delta>0.1?'bad':d.delta<-0.1?'good':''}">${icon(d.delta>=0?'arrowup':'arrowdown',12,2.6)}${Math.abs(Math.round(d.delta*100))}% vs last week</span>`:'';
  return`<div class="card glass">${ch('calendar','var(--indigo)','This week',dl)}<div class="kpi-v amt" style="font-size:30px">${money(d.tot)}</div><div class="faint sm" style="margin-bottom:12px">spent in ${d.days} day${d.days>1?'s':''} · ${d.count} purchase${d.count===1?'':'s'}</div>
   ${d.top?`<div class="row sm" style="margin-bottom:6px"><span><span class="lic">${gl(cat(d.top[0]).emoji,16)}</span>Top: ${esc(cat(d.top[0]).name)}</span><b class="amt">${money(d.top[1])}</b></div>`:''}${d.big?`<div class="row sm" style="margin-bottom:6px"><span>🛍️&nbsp; Biggest: ${esc(txTitle(d.big))}</span><b class="amt">${money(d.big.amount)}</b></div>`:''}${d.inc>0?`<div class="row sm"><span>💰&nbsp; Income</span><b class="amt good">+${money(d.inc)}</b></div>`:''}</div>`;};
DW.pace=()=>{const l=dailyPace().slice(0,4);
  return`<div class="card glass">${ch('target','var(--orange)','Daily budget pace','per day left')}${l.length?l.map(x=>`<div class="row" style="margin-bottom:11px"><span><span class="lic">${gl(x.c.emoji,16)}</span>${esc(x.c.name)}</span><span class="amt ${x.left<0?'bad':''}">${x.left<0?'Over by '+money(-x.left):money(Math.max(0,x.perDay))+'/day'}</span></div>`).join(''):emptyBox('🎯','No budgets yet','<div>Set a budget to see how much you can spend per day.</div>')}</div>`;};
