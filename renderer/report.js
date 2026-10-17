'use strict';
/* =========================================================================
   Financial Health Report (1.8, made global in 1.9). Reads only your own data, all maths in finance.js.
   Structure follows the four pillars used by the Financial Health Network (Spend, Save, Borrow, Plan).
   Every benchmark names its source. Benchmarks are rules of thumb from published research; where a rule is specific to
   one country (US lender conventions, a dollar threshold) the report says so, or skips it for other currencies.
   All text is translated (keys rp.*); amounts, dates and percentages follow your language settings.
   ========================================================================= */
const RSRC={
  fhn:{t:'Financial Health Network, FinHealth Score framework and Pulse 2025',u:'https://finhealthnetwork.org/wp-content/uploads/2025/09/Financial-Health-Pulse-2025-U.S.-Trends-Report.pdf'},
  findex:{t:'World Bank, Global Findex Database 2025: financial health and resilience in 141 economies',u:'https://www.worldbank.org/en/publication/globalfindex/report'},
  oecd:{t:'OECD/INFE 2023 International Survey of Adult Financial Literacy (39 countries): resilience and well-being',u:'https://www.oecd.org/en/publications/2023/12/oecd-infe-2023-international-survey-of-adult-financial-literacy_8ce94e2c.html'},
  fid:{t:'Fidelity, how much to save for retirement: at least 15% of pre-tax income',u:'https://www.fidelity.com/viewpoints/retirement/how-much-money-should-i-save'},
  van:{t:'Vanguard, emergency savings and financial well-being (12,400 investors)',u:'https://corporate.vanguard.com/content/corporatesite/us/en/corp/articles/emergency-savings-may-hold-key-financial-well-being'},
  jpm:{t:'JPMorgan Chase Institute, about 6 weeks of take-home pay as a buffer (via HerMoney, 2019)',u:'https://hermoney.com/save/emergency-fund/new-research-a-6-week-emergency-cushion-looks-like-enough/'},
  ms:{t:'Morningstar, safe starting withdrawal rate for 2026: 3.9% (30 years, 90% success)',u:'https://www.morningstar.com/retirement/whats-safe-retirement-withdrawal-rate-2026'},
  bg:{t:'The 4% rule (Bengen 1994, Trinity study 1998)',u:'https://en.wikipedia.org/wiki/4%25_rule'},
  gm:{t:'Gal and McShane (2012), Journal of Marketing Research: concentrating on one debt at a time and progress',u:'https://www.kellogg.northwestern.edu/academics-research/research/detail/2012/can-fighting-small-battles-help-win-the-war-evidence'},
  cfpb:{t:'CFPB, Measuring financial well-being (scale and user guide)',u:'https://files.consumerfinance.gov/f/201512_cfpb_financial-well-being-user-guide-scale.pdf'},
  wt:{t:'Warren and Tyagi, All Your Worth (2005): the 50/30/20 split',u:''}
};
const RT={good:'good',ok:'warn',warn:'warn',bad:'bad'};
const srcN=k=>Object.keys(RSRC).indexOf(k)+1;
/* where the user is, for country-specific rules. Region from the formats locale (en-GB -> GB), else the currency. */
function reportRegion(){
  const loc=String(S.settings.locale||'').split('-')[1]||'',cur=baseCur();
  const us=loc?loc.toUpperCase()==='US':cur==='USD';
  return{us,usd:cur==='USD',code:(loc||'').toUpperCase(),cur};
}
function reportData(){
  const T=totals(),pl=planning(),fx=fxo(),cur=baseCur();
  const months=[];for(let i=-6;i<=-1;i++){const s=statsFor(i);if(s.inc>0||s.exp>0)months.push(s);}
  const vol=Finance.volatility(months.map(m=>m.inc));
  const res=Finance.resilience({liquid:T.liquid,essentials:pl.essentials,takeHome:pl.income,level:vol&&vol.level});
  const debts=[];let missingRate=false;
  for(const a of S.accounts){if(!isLiab(a)||!(balance(a)<0))continue;const r=fx.rate(accCur(a));if(r==null){missingRate=true;continue;}
    debts.push({name:a.name,balance:-balance(a)*r,apr:a.apr||0,minPay:(a.minPay||0)*r,hasApr:a.apr>0,hasMin:a.minPay>0});}
  const debtTotal=debts.reduce((x,d)=>x+d.balance,0),wApr=debtTotal>0?debts.reduce((x,d)=>x+d.apr*d.balance,0)/debtTotal:0;
  const A=Object.assign({real:.04,swr:.039},S.settings.report||{});
  const investable=S.accounts.filter(a=>a.type==='investment').reduce((x,a)=>x+balance(a)*(fx.rate(accCur(a))||0),0)+Math.max(0,T.liquid-res.target*pl.essentials);
  const annualSave=Math.max(0,(pl.income-pl.expenses)*12); // what you keep today after all spending, debt payments included in spending or transfers
  const fi=Finance.yearsToIndependence({annualSpend:pl.expenses*12,investable,annualSave,realReturn:A.real,swr:A.swr});
  // spending movers: this period vs the average of the three before it (only items worth noticing)
  const cats=S.categories.filter(c=>c.type==='expense'),avg=lastMonthsAvgByCat(3),now=statsFor(0).byCat||{},movers=[];
  for(const c of cats){const a=avg[c.id]||0,n=now[c.id]||0;if(a>0&&n>a*1.25&&n-a>Math.max(20,pl.income*.02))movers.push({id:c.id,name:c.name,now:n,avg:a,diff:n-a});}
  movers.sort((a,b)=>b.diff-a.diff);
  // net worth trend from snapshots
  const sn=(S.snapshots||[]).slice().sort((a,b)=>a.d<b.d?-1:1),last=sn[sn.length-1],ref=last&&sn.find(x=>Finance.diffDays(x.d,last.d)<=95&&Finance.diffDays(x.d,last.d)>=28);
  const nwChange=last&&ref&&last.d!==ref.d?{from:ref,to:last,delta:last.net-ref.net,days:Finance.diffDays(ref.d,last.d)}:null;
  // debt strategies
  const extra=Math.max(0,+(window._rpExtra||0)),usable=debts.filter(d=>d.hasMin||d.hasApr);
  const strat=usable.length&&usable.every(d=>d.hasMin)?{min:Finance.payoff(usable,'minimum'),snow:Finance.payoff(usable,'snowball',extra),ava:Finance.payoff(usable,'avalanche',extra)}:null;
  return{T,pl,cur,vol,res,debts,debtTotal,wApr,missingRate,A,investable,annualSave,fi,movers,nwChange,strat,extra,months,region:reportRegion(),
    hasData:pl.income>0||pl.expenses>0};
}
/* pillar scores (0-100): transparent, linear between the benchmark's "weak" and "good" ends, explained in the card */
const lin=(v,lo,hi)=>Math.round(clamp((v-lo)/(hi-lo),0,1)*100);
function pillars(R){
  const {pl,res,debtTotal,T}=R,out={};
  // SPEND: living within income + essentials share
  const sp=[];if(pl.income>0){sp.push(lin(1-pl.expenses/pl.income,0,.15));if(pl.split)sp.push(lin(.65-pl.split.share.needs,0,.15));}
  out.spend=sp.length?Math.round(sp.reduce((a,b)=>a+b,0)/sp.length):null;
  // SAVE: savings rate (15%) + buffer vs target
  const sv=[];if(pl.savingsRate!=null)sv.push(lin(pl.savingsRate,0,.15));if(res.months!=null)sv.push(lin(res.months,0,res.target));
  out.save=sv.length?Math.round(sv.reduce((a,b)=>a+b,0)/sv.length):null;
  // BORROW: DTI vs 36%, and debt vs assets
  const bo=[];if(pl.dti!=null)bo.push(lin(.43-pl.dti,0,.07));if(debtTotal>0&&T.assets>0)bo.push(lin(.6-debtTotal/T.assets,0,.4));else if(!(debtTotal>0))bo.push(100);
  if(debtTotal>0&&R.wApr>0)bo.push(lin(.2-R.wApr/100,0,.12));
  out.borrow=bo.length?Math.round(bo.reduce((a,b)=>a+b,0)/bo.length):null;
  if(out.borrow!=null&&R.debts.some(d=>d.apr>=15))out.borrow=Math.min(out.borrow,70); // expensive debt caps the pillar
  // PLAN: independence trajectory
  const pn=[];if(R.fi){pn.push(R.fi.reached?100:R.fi.years==null?10:lin(40-R.fi.years,0,25));}
  out.plan=pn.length?pn[0]:null;
  const v=Object.values(out).filter(x=>x!=null);out.total=v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null;out.n=v.length;
  return out;
}
const pct1=v=>FMT.number(+(v*100).toFixed(1))+'%';
const rLabel=s=>tr(s==null?'rp.lbl.none':s>=80?'rp.lbl.strong':s>=60?'rp.lbl.solid':s>=40?'rp.lbl.building':'rp.lbl.attention');
const rTone=s=>s==null?'':s>=80?'good':s>=60?'good':s>=40?'warn':'bad';
const srcTag=k=>k?` <span class="rsrc" title="${esc(RSRC[k].t)}">[${srcN(k)}]</span>`:'';
function metric(label,value,tone,bench,srcKey,note){
  return`<div class="rr"><div class="row sm" style="margin-bottom:4px"><span>${esc(label)}</span><b class="amt ${tone||''}" dir="auto">${esc(value)}</b></div>
   <div class="faint sm">${esc(bench)}${Array.isArray(srcKey)?srcKey.map(srcTag).join(''):srcTag(srcKey)}</div>${note?`<div class="sm" style="margin-top:4px">${esc(note)}</div>`:''}</div>`;
}
function actions(R){
  const {pl,res,debts,vol}=R,out=[],m=money;
  if(res.months!=null&&res.months<1)out.push({k:tr('rp.act.starter'),impact:tr('rp.act.starterI',{amount:m(Math.max(0,pl.essentials-R.T.liquid))}),why:tr('rp.act.starterW'),src:['van','jpm','findex'],go:'accounts'});
  const hi=debts.filter(d=>d.apr>=15).sort((a,b)=>b.apr-a.apr)[0];
  if(hi)out.push({k:tr('rp.act.payDown',{name:hi.name,apr:FMT.number(hi.apr)}),impact:tr('rp.act.payDownI',{amount:m(1000),saved:m(1000*hi.apr/100)}),why:tr('rp.act.payDownW'),src:[],go:'plan'});
  if(pl.savingsRate!=null&&pl.savingsRate<.10&&pl.income>0)out.push({k:tr('rp.act.rate'),impact:tr('rp.act.rateI',{amount:m(Math.max(0,pl.income*.10-(pl.income-pl.expenses)))}),why:tr('rp.act.rateW'),src:['wt','fid'],go:'budgets'});
  if(res.months!=null&&res.months>=1&&res.months<res.target)out.push({k:tr('rp.act.buffer',{n:String(res.target)}),impact:tr('rp.act.bufferI',{amount:m(res.gap)})+(vol?' '+tr('rp.act.bufferVol',{level:tr('rp.vol.'+vol.level)}):''),why:tr('rp.act.bufferW'),src:['van','oecd'],go:'goals'});
  if(pl.dti!=null&&pl.dti>.36)out.push({k:tr('rp.act.dti'),impact:tr('rp.act.dtiI',{pct:pct(pl.dti)}),why:tr('rp.act.dtiW'),src:['cfpb'],go:'plan'});
  if(R.movers.length)out.push({k:tr('rp.act.check',{name:R.movers[0].name}),impact:tr('rp.act.checkI',{now:m(R.movers[0].now),avg:m(R.movers[0].avg)}),why:tr('rp.act.checkW'),src:['wt'],go:'transactions',cat:R.movers[0].id});
  if(pl.savingsRate!=null&&pl.savingsRate>=.15&&(res.months==null||res.months>=res.target)&&!hi)out.push({k:tr('rp.act.strong'),impact:tr('rp.act.strongI'),why:tr('rp.act.strongW'),src:['fid']});
  return out.slice(0,6);
}
function strategyTable(R){
  const st=R.strat,a=st.ava,s=st.snow,mn=st.min,m=money;
  if(a.neverPaysOff||mn.neverPaysOff)return`<div class="notice warn">${icon('alert',16)}<span>${trh('rp.lab.never')}</span></div>`;
  const row=(n,r,hl)=>`<div class="kv" style="padding:9px 16px${hl?';font-weight:600':''}"><span>${esc(n)}</span><span class="amt sm" style="display:flex;gap:18px"><span>${esc(tr('rp.lab.mo',{n:FMT.number(r.months)}))}</span><span>${m(r.totalInterest)}</span><span class="good">${r===mn?'—':m(mn.totalInterest-r.totalInterest)}</span></span></div>`;
  const gap=s.totalInterest-a.totalInterest;
  return`<div class="group flat"><div class="kv" style="padding:8px 16px;font-size:12.5px"><span>${trh('rp.lab.strategy')}</span><span style="display:flex;gap:18px"><span>${trh('rp.lab.time')}</span><span>${trh('rp.lab.interest')}</span><span>${trh('rp.lab.saved')}</span></span></div>
   ${row(tr('rp.lab.min'),mn)}${row(tr('rp.lab.snow'),s)}${row(tr('rp.lab.ava'),a,true)}</div>
   <p class="faint sm" style="margin:10px 4px 0">${esc(gap>0.5?tr('rp.lab.avaLess',{amount:m(gap)}):tr('rp.lab.avaSame'))} ${trh('rp.lab.research')}${srcTag('gm')} ${esc(tr('rp.lab.order',{order:a.order.map(o=>o.name).join(' → ')}))} ${R.extra>0?esc(tr('rp.lab.extraIncl',{amount:m(R.extra)})):''}</p>`;
}
/* ---------- layout (1.10.2): summary → action plan → scorecard → cash flow → spending → balance sheet → outlook → method ---------- */
const ST_KEY={good:'good',warn:'warn',bad:'bad'};
function scoreRows(R){
  const {pl,res,vol,fi,A,region}=R,m=money,rows=[];
  const add=(area,label,value,tone,bench,src,note)=>rows.push({area,label,value,tone,bench,src,note});
  if(pl.income>0){const r=pl.expenses/pl.income;add('spend',tr('rp.m.spendIncome'),pct(r),r<=.85?'good':r<=1?'warn':'bad',tr('rp.b.spendIncome'),'fhn');}
  if(pl.split)add('spend',tr('rp.m.needs'),pct(pl.split.share.needs),pl.split.share.needs<=.5?'good':pl.split.share.needs<=.6?'warn':'bad',tr('rp.b.needs'),'wt');
  if(pl.savingsRate!=null)add('save',tr('rp.m.rate'),pct(pl.savingsRate),RT[{low:'bad',below:'warn',fair:'warn',good:'good',strong:'good'}[Finance.savingsTier(pl.savingsRate)]],tr('rp.b.rate'),['wt','fid']);
  if(res.months!=null)add('save',tr('rp.m.buffer'),tr('rp.u.months',{n:FMT.number(+res.months.toFixed(1))}),{thin:'bad',building:'warn',solid:'good',strong:'good'}[res.tier],vol?tr('rp.b.bufferVol',{n:String(res.target),level:tr('rp.vol.'+vol.level),cv:pct(vol.cv)}):tr('rp.b.buffer',{n:String(res.target)}),['van','findex'],res.gap>0?tr('rp.n.short',{amount:m(res.gap)}):'');
  if(R.debtTotal>0)add('borrow',tr('rp.m.debt'),m(R.debtTotal),R.debts.some(d=>d.apr>=15)?'warn':'',R.wApr?tr('rp.b.debtRate',{rate:FMT.number(+R.wApr.toFixed(1))+'%'}):tr('rp.b.debtNoRate'),null);
  else add('borrow',tr('rp.m.debtNone'),tr('rp.v.none'),'good',tr('rp.b.debtNone'),null);
  if(pl.dti!=null)add('borrow',tr('rp.m.dti'),pct(pl.dti),pl.dti<=.36?'good':pl.dti<=.43?'warn':'bad',tr(region.us?'rp.b.dtiUS':'rp.b.dti'),'cfpb',pl.assumedNet?tr('rp.n.grossEst'):'');
  if(fi){add('plan',tr('rp.m.fiNeed'),m(fi.target),'',tr('rp.b.fiNeed',{spend:m(pl.expenses*12),swr:pct1(A.swr)}),A.swr===.039?'ms':'bg');
    add('plan',tr('rp.m.fiTime'),fi.reached?tr('rp.v.there'):fi.years==null?tr('rp.v.notOnTrack'):tr('rp.u.years',{n:FMT.number(fi.years)}),fi.reached?'good':fi.years==null?'bad':fi.years<=25?'good':'warn',tr('rp.b.fiTime',{start:m(R.investable),save:m(R.annualSave),real:pct(A.real)}),null);}
  return rows;
}
function rpSection(id,title,body,extra=''){return`<section class="rp-sec" id="rp-${id}"><div class="sec-h">${esc(title)}${extra}</div>${body}</section>`;}
function rpSummary(R,P){
  const {pl,T}=R,m=money,areas=['spend','save','borrow','plan'].filter(k=>P[k]!=null).map(k=>({k,s:P[k]}));
  const strong=areas.slice().sort((a,b)=>b.s-a.s)[0],weak=areas.slice().sort((a,b)=>a.s-b.s)[0];
  const verdict=!areas.length?'':weak.s>=70?tr('rp.sumAll'):tr('rp.sumStrong',{strong:tr('rp.p.'+strong.k),s1:String(strong.s),weak:tr('rp.p.'+weak.k),s2:String(weak.s)});
  const nw=R.nwChange,kpi=(l,v,sub,tone)=>`<div class="rp-kpi"><small>${esc(l)}</small><b class="amt ${tone||''}">${v}</b>${sub?`<span class="faint">${sub}</span>`:''}</div>`;
  return`<div class="card glass rp-sum"><div class="rp-sum-top">${ring((P.total||0)/100,118,12,P.total==null?'var(--fill-2)':'var(--accent)',`<b style="font-size:32px;letter-spacing:-1px">${P.total==null?'–':P.total}</b><div class="faint sm">${esc(rLabel(P.total))}</div>`)}
    <div class="grow"><div class="rp-eyebrow">${trh('rp.scoreName')}</div><h2 class="rp-verdict">${esc(verdict)}</h2>
     <div class="rp-areas">${['spend','save','borrow','plan'].map(k=>`<span class="rp-area ${rTone(P[k])}"><i></i>${esc(tr('rp.p.'+k))} <b>${P[k]==null?'–':P[k]}</b></span>`).join('')}</div></div></div>
   <div class="rp-kpis">${kpi(tr('rp.kpi.net'),m(T.net),nw?esc(tr('rp.kpi.netChange',{amount:(nw.delta>=0?'+':'−')+m(Math.abs(nw.delta)),n:String(nw.days)})):'',nw?(nw.delta>=0?'good':'bad'):'')}
    ${kpi(tr('rp.kpi.inc'),m(pl.income),esc(tr('rp.kpi.avg')))}${kpi(tr('rp.kpi.exp'),m(pl.expenses),esc(tr('rp.kpi.avg')))}
    ${kpi(tr('rp.kpi.rate'),pl.savingsRate==null?'–':pct(pl.savingsRate),esc(tr('rp.kpi.kept',{amount:m(Math.max(0,pl.income-pl.expenses))})),pl.savingsRate==null?'':pl.savingsRate>=.15?'good':pl.savingsRate>=.05?'warn':'bad')}</div></div>`;
}
function rpActions(R){
  const acts=actions(R);
  if(!acts.length)return`<div class="group"><div class="insight"><div><b>${trh('rp.noPriorities')}</b></div></div></div>`;
  return`<ol class="group rp-acts">${acts.map((a,i)=>`<li class="rp-act"><span class="rp-n">${i+1}</span><div class="grow"><b>${esc(a.k)}</b><p>${esc(a.impact)}. <span class="muted">${esc(a.why)}</span>${a.src.map(srcTag).join('')}</p></div>${a.go?`<button class="btn sm rp-noprint" data-rpgo="${a.go}"${a.cat?` data-rpcat="${esc(a.cat)}"`:''}>${trh('rp.go.'+a.go)}</button>`:''}</li>`).join('')}</ol>`;
}
function rpScorecard(R,P){
  const rows=scoreRows(R);let last='';
  const body=rows.map(r=>{const first=r.area!==last;last=r.area;const st=ST_KEY[r.tone];
    return`<tr class="${first?'rp-first':''}"><td class="rp-c-area">${first?`<b>${esc(tr('rp.p.'+r.area))}</b><span class="${rTone(P[r.area])}">${P[r.area]==null?'':P[r.area]}</span>`:''}</td>
     <td>${esc(r.label)}${r.note?`<div class="faint sm">${esc(r.note)}</div>`:''}</td><td class="amt ${r.tone||''}" dir="auto">${esc(r.value)}</td>
     <td class="sm muted">${esc(r.bench)}${Array.isArray(r.src)?r.src.map(srcTag).join(''):srcTag(r.src)}</td>
     <td>${st?`<span class="rp-st ${st}"><i></i>${trh('rp.st.'+st)}</span>`:'<span class="faint">–</span>'}</td></tr>`;}).join('');
  return`<div class="card glass rp-tablecard"><table class="rp-table"><thead><tr><th>${trh('rp.col.area')}</th><th>${trh('rp.col.measure')}</th><th>${trh('rp.col.you')}</th><th>${trh('rp.col.target')}</th><th>${trh('rp.col.status')}</th></tr></thead><tbody>${body}</tbody></table>${R.missingRate?`<p class="faint sm" style="margin:10px 4px 0">${trh('rp.n.fx')}</p>`:''}</div>`;
}
function rpCashflow(R){
  const months=[];for(let i=-6;i<=-1;i++){const s=statsFor(i);if(s.inc>0||s.exp>0){const q=periodFor(today(),i);months.push({label:FMT.dateFmt({month:'short'}).format(pd(q.start)),full:q.label,...s});}}
  if(months.length<2)return'';
  const inc=sum(months,x=>x.inc),exp=sum(months,x=>x.exp);
  return rpSection('cash',tr('rp.cfTitle'),`<div class="card glass"><div class="rp-legend"><span><i style="background:var(--green)"></i>${trh('rp.cf.income')}</span><span><i style="background:var(--accent)"></i>${trh('rp.cf.spend')}</span></div><div id="rp_cf" class="rp-chart" data-m='${esc(JSON.stringify(months.map(x=>({label:x.label,inc:Math.round(x.inc),exp:Math.round(x.exp)}))))}'></div>
   <p class="sm" style="margin:10px 4px 0">${esc(tr('rp.cf.total',{n:String(months.length),inc:money(inc),exp:money(exp),net:money(inc-exp),rate:inc>0?pct((inc-exp)/inc):'–'}))}</p></div>`);
}
function rpSpending(R){
  const avg=lastMonthsAvgByCat(3),list=Object.entries(avg).filter(([,v])=>v>0.5).sort((a,b)=>b[1]-a[1]),total=list.reduce((x,[,v])=>x+v,0);
  if(!list.length)return'';
  const top=list.slice(0,8),rest=list.slice(8).reduce((x,[,v])=>x+v,0),m=money;
  const rows=top.map(([id,v])=>{const c=cat(id),B=c.budget>0?c.budget:0,d=B?v-B:0;
    return`<tr><td>${gl(c.emoji,16)} ${esc(c.name)}</td><td class="amt">${m(v)}</td><td><div class="rp-bar"><i style="width:${Math.round(v/list[0][1]*100)}%"></i></div><span class="faint sm">${pct(v/total)}</span></td><td class="amt muted">${B?m(B):'–'}</td><td class="amt ${B?(d>0?'bad':'good'):''}">${B?(d>0?'+':'−')+m(Math.abs(d)):'–'}</td></tr>`;}).join('')
    +(rest>0?`<tr class="muted"><td>${trh('rp.cat.other',{count:list.length-8})}</td><td class="amt">${m(rest)}</td><td><span class="faint sm">${pct(rest/total)}</span></td><td></td><td></td></tr>`:'');
  const mv=R.movers[0];
  return rpSection('spend',tr('rp.catTitle'),`<div class="card glass rp-tablecard"><table class="rp-table"><thead><tr><th>${trh('rp.cat.col')}</th><th>${trh('rp.cat.avg')}</th><th>${trh('rp.cat.share')}</th><th>${trh('rp.cat.budget')}</th><th>${trh('rp.cat.vs')}</th></tr></thead><tbody>${rows}</tbody></table>
   <p class="faint sm" style="margin:10px 4px 0">${trh('rp.cat.basis')}${mv?' '+esc(tr('rp.cat.rising',{name:mv.name,now:m(mv.now),avg:m(mv.avg)})):''}</p></div>`);
}
function rpBalance(R){
  const fx=fxo(),m=money,T=R.T,acc=S.accounts.map(a=>({a,v:balance(a)*(fx.rate(accCur(a))||0)})).filter(x=>Math.abs(x.v)>=0.005);
  const assets=acc.filter(x=>!isLiab(x.a)).sort((a,b)=>b.v-a.v),liabs=acc.filter(x=>isLiab(x.a)).sort((a,b)=>a.v-b.v);
  const li=x=>`<div class="kv"><span>${esc(x.a.name)}</span><b class="amt">${m(x.v)}</b></div>`;
  let debt='';
  if(R.debts.length){
    const st=R.strat,ord=st&&!st.ava.neverPaysOff?Object.fromEntries((R.extra>0?st.ava:st.min).order.map(o=>[o.name,o.month])):{};
    debt=`<div class="rp-sub">${trh('rp.debtTitle')}</div><table class="rp-table"><thead><tr><th>${trh('rp.debt.name')}</th><th>${trh('rp.debt.bal')}</th><th>${trh('rp.debt.apr')}</th><th>${trh('rp.debt.min')}</th><th>${trh('rp.debt.off')}</th></tr></thead><tbody>${R.debts.slice().sort((a,b)=>b.apr-a.apr).map(d=>`<tr><td>${esc(d.name)}</td><td class="amt">${m(d.balance)}</td><td class="amt ${d.apr>=15?'bad':''}">${d.hasApr?FMT.number(d.apr)+'%':'–'}</td><td class="amt">${d.hasMin?m(d.minPay):'–'}</td><td>${ord[d.name]?esc(tr('rp.lab.mo',{n:FMT.number(ord[d.name])})):'–'}</td></tr>`).join('')}</tbody></table>`;
    if(st){
      if(st.min.neverPaysOff)debt+=`<div class="notice warn" style="margin-top:10px">${icon('alert',16)}<span>${trh('rp.lab.never')}</span></div>`;
      else{
        const best=st.ava,saved=st.min.totalInterest-best.totalInterest;
        debt+=`<p class="sm" style="margin:10px 4px 0">${esc(tr('rp.debt.minOnly',{months:FMT.number(st.min.months),interest:m(st.min.totalInterest)}))}${R.extra>0?' '+esc(tr('rp.debt.extraRes',{extra:m(R.extra),months:FMT.number(best.months),saved:m(Math.max(0,saved))})):''}${R.debts.length>1?' '+esc(tr('rp.debt.order',{order:best.order.map(o=>o.name).join(' → ')}))+srcTag('gm'):''}</p>
         <div class="fg rp-noprint" style="margin-top:10px"><div class="fr"><label for="rpx">${trh('rp.lab.extra')}</label><input id="rpx" type="number" min="0" step="10" value="${R.extra||''}" placeholder="0"></div></div>`;
      }
    }else debt+=`<p class="faint sm" style="margin:10px 4px 0">${trh('rp.lab.needData')}</p>`;
  }
  return rpSection('balance',tr('rp.bsTitle'),`<div class="card glass"><div class="rp-bs"><div><div class="rp-sub">${trh('rp.bs.assets')} <b class="amt">${m(T.assets)}</b></div>${assets.map(li).join('')||'<div class="faint sm">–</div>'}</div>
    <div><div class="rp-sub">${trh('rp.bs.liabs')} <b class="amt">${m(T.liabs)}</b></div>${liabs.map(li).join('')||`<div class="faint sm">${trh('rp.v.none')}</div>`}</div></div>
   <div class="rp-bs-foot"><span>${trh('rp.bs.net')} <b class="amt">${m(T.net)}</b></span><span>${trh('rp.bs.liquid')} <b class="amt">${m(T.liquid)}</b></span>${T.assets>0&&R.debtTotal>0?`<span>${esc(tr('rp.bs.ratio',{pct:pct(R.debtTotal/T.assets)}))}</span>`:''}</div>
   ${debt}</div>`);
}
function rpOutlook(R){
  const {fi,A,pl}=R;if(!fi)return'';const m=money;
  const line=fi.reached?tr('rp.out.reached',{target:m(fi.target)}):fi.years==null?tr('rp.out.notOnTrack',{target:m(fi.target)}):tr('rp.out.years',{target:m(fi.target),years:FMT.number(fi.years),year:String(new Date().getFullYear()+Math.ceil(fi.years))});
  return rpSection('outlook',tr('rp.outTitle'),`<div class="card glass"><p style="margin:0 0 6px"><b>${esc(line)}</b></p><p class="sm muted" style="margin:0">${esc(tr('rp.b.fiTime',{start:m(R.investable),save:m(R.annualSave),real:pct(A.real)}))} ${esc(tr('rp.b.fiNeed',{spend:m(pl.expenses*12),swr:pct1(A.swr)}))}${srcTag(A.swr===.039?'ms':'bg')}</p>
   <div class="fg rp-noprint" style="margin-top:12px"><div class="fr"><label for="rp_real">${trh('rp.a.real')}</label><select id="rp_real">${[.03,.04,.05].map(v=>opt(v,pct(v),v===A.real)).join('')}</select></div><div class="fr"><label for="rp_swr">${trh('rp.a.swr')}</label><select id="rp_swr">${[[.035,'rp.a.swr35'],[.039,'rp.a.swr39'],[.04,'rp.a.swr40']].map(([v,k])=>opt(v,tr(k),v===A.swr)).join('')}</select></div></div></div>`);
}
function rpMethod(R,P){
  return`<details class="card glass rp-method"><summary>${trh('rp.methodTitle')}</summary>
   <p class="sm">${trh('rp.pillarsBody')} ${P.n<4?trh('rp.pillarsMissing'):''} ${esc(tr('rp.region',{cur:R.cur}))}${R.region.us?'':' · '+esc(tr('rp.regionIntl'))}</p>
   <p class="sm">${trh('rp.howToRead')}</p>
   <ol class="sm rp-src" dir="ltr">${Object.values(RSRC).map(s=>`<li>${s.u?`<a class="link" data-ext="${esc(s.u)}" role="link" tabindex="0">${esc(s.t)}</a>`:esc(s.t)}</li>`).join('')}</ol></details>`;
}
function reportBody(R){
  const P=pillars(R);
  return`${rpSummary(R,P)}
   ${rpSection('actions',tr('rp.planTitle'),rpActions(R))}
   ${rpSection('score',tr('rp.scoreTitle'),rpScorecard(R,P))}
   ${rpCashflow(R)}${rpSpending(R)}${rpBalance(R)}${rpOutlook(R)}
   ${rpMethod(R,P)}
   <p class="faint sm rp-disclaimer">${trh('rp.disclaimer')}</p>`;
}
PAGES.report={title:'Report',
 render(){
  const R=reportData();
  if(!R.hasData)return`<div class="page wrap">${lt(trh('rp.title'),trh('rp.subEmpty'))}<div class="card glass">${emptyBox('📊',tr('rp.empty'),`<div>${trh('rp.emptyD')}</div>`)}</div></div>`;
  const btns=hasNative&&native.savePdf?`<button class="btn" id="rp_pdf">${icon('download',16)} ${trh('rp.savePdf')}</button>`:`<button class="btn" id="rp_print">${icon('download',16)} ${trh('rp.print')}</button>`;
  const basis=tr(R.pl.partial?'rp.basisNow':'rp.basis',{count:R.pl.periods})+' · '+tr('rp.prepared',{date:FMT.dateFull(new Date())});
  return`<div class="page wrap rp-page">${lt(trh('rp.title'),esc(basis),btns)}
   <div class="rp-printhead"><b>${trh('rp.title')}</b> · ${esc(FMT.dateTime(new Date().toISOString()))}${S.settings.name?' · '+esc(S.settings.name):''}</div>
   ${reportBody(R)}</div>`;
 },
 after(v){
  $$('[data-ext]',v).forEach(b=>{const go=()=>{if(isHttps(b.dataset.ext))window.open(b.dataset.ext,'_blank','noopener');};b.onclick=go;b.onkeydown=e=>{if(e.key==='Enter')go();};});
  $$('[data-rpgo]',v).forEach(b=>b.onclick=()=>{const g=b.dataset.rpgo;if(g==='transactions'&&b.dataset.rpcat){Object.assign(F,F_DEFAULT,{cat:b.dataset.rpcat,range:'period'});}go(g);});
  const cf=$('#rp_cf',v);if(cf){try{const cs=getComputedStyle(document.documentElement),cv=(n,f)=>cs.getPropertyValue(n).trim()||f;drawBars(cf,JSON.parse(cf.dataset.m),[{key:'inc',color:cv('--green','#2BB89A'),label:tr('rp.cf.income')},{key:'exp',color:cv('--accent','#C9632F'),label:tr('rp.cf.spend')}],{h:200});}catch(e){logErr('report chart',e);}}
  const x=$('#rpx',v);if(x)x.onchange=()=>{window._rpExtra=Math.max(0,parseFloat(x.value)||0);setTimeout(refresh,0);};
  const set=(k,id)=>{const e=$(id,v);if(e)e.onchange=()=>{S.settings.report=Object.assign({real:.04,swr:.039},S.settings.report||{},{[k]:parseFloat(e.value)});setTimeout(changed,0);};};
  set('real','#rp_real');set('swr','#rp_swr');
  const pdf=$('#rp_pdf',v);if(pdf)pdf.onclick=async()=>{
    if(S.settings.privacy){toast(tr('rp.pdfPrivacy'),{ms:5000});return;}
    pdf.disabled=true;document.body.classList.add('printing');$$('details',v).forEach(d=>d.open=true);
    try{const r=await native.savePdf(tr('rp.fileName',{date:today()})+'.pdf');if(r)toast(tr('rp.pdfSaved'));}catch(e){logErr('pdf failed',e);toast(tr('rp.pdfFailed'));}
    finally{document.body.classList.remove('printing');pdf.disabled=false;}
  };
  const pr=$('#rp_print',v);if(pr)pr.onclick=()=>window.print();
 }};
