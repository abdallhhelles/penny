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
  for(const c of cats){const a=avg[c.id]||0,n=now[c.id]||0;if(a>0&&n>a*1.25&&n-a>Math.max(20,pl.income*.02))movers.push({name:c.name,now:n,avg:a,diff:n-a});}
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
const rLabel=s=>tr(s==null?'rp.lbl.none':s>=80?'rp.lbl.strong':s>=60?'rp.lbl.solid':s>=40?'rp.lbl.building':'rp.lbl.attention');
const rTone=s=>s==null?'':s>=80?'good':s>=60?'good':s>=40?'warn':'bad';
const srcTag=k=>k?` <span class="rsrc" title="${esc(RSRC[k].t)}">[${srcN(k)}]</span>`:'';
function metric(label,value,tone,bench,srcKey,note){
  return`<div class="rr"><div class="row sm" style="margin-bottom:4px"><span>${esc(label)}</span><b class="amt ${tone||''}" dir="auto">${esc(value)}</b></div>
   <div class="faint sm">${esc(bench)}${Array.isArray(srcKey)?srcKey.map(srcTag).join(''):srcTag(srcKey)}</div>${note?`<div class="sm" style="margin-top:4px">${esc(note)}</div>`:''}</div>`;
}
function actions(R){
  const {pl,res,debts,vol}=R,out=[],m=money;
  if(res.months!=null&&res.months<1)out.push({k:tr('rp.act.starter'),impact:tr('rp.act.starterI',{amount:m(Math.max(0,pl.essentials-R.T.liquid))}),why:tr('rp.act.starterW'),src:['van','jpm','findex']});
  const hi=debts.filter(d=>d.apr>=15).sort((a,b)=>b.apr-a.apr)[0];
  if(hi)out.push({k:tr('rp.act.payDown',{name:hi.name,apr:FMT.number(hi.apr)}),impact:tr('rp.act.payDownI',{amount:m(1000),saved:m(1000*hi.apr/100)}),why:tr('rp.act.payDownW'),src:[]});
  if(pl.savingsRate!=null&&pl.savingsRate<.10&&pl.income>0)out.push({k:tr('rp.act.rate'),impact:tr('rp.act.rateI',{amount:m(Math.max(0,pl.income*.10-(pl.income-pl.expenses)))}),why:tr('rp.act.rateW'),src:['wt','fid']});
  if(res.months!=null&&res.months>=1&&res.months<res.target)out.push({k:tr('rp.act.buffer',{n:String(res.target)}),impact:tr('rp.act.bufferI',{amount:m(res.gap)})+(vol?' '+tr('rp.act.bufferVol',{level:tr('rp.vol.'+vol.level)}):''),why:tr('rp.act.bufferW'),src:['van','oecd']});
  if(pl.dti!=null&&pl.dti>.36)out.push({k:tr('rp.act.dti'),impact:tr('rp.act.dtiI',{pct:pct(pl.dti)}),why:tr('rp.act.dtiW'),src:['cfpb']});
  if(R.movers.length)out.push({k:tr('rp.act.check',{name:R.movers[0].name}),impact:tr('rp.act.checkI',{now:m(R.movers[0].now),avg:m(R.movers[0].avg)}),why:tr('rp.act.checkW'),src:['wt']});
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
const GLOSS=['savings','buffer','essentials','apr','dti','networth','swr','real'];
function reportBody(R){
  const P=pillars(R),{pl,res,vol,fi,A,region}=R,m=money,card=(ic,col,title,score,body)=>`<div class="card glass rp-pillar">${ch(ic,col,esc(title),score==null?'':`<b class="${rTone(score)}">${score} · ${esc(rLabel(score))}</b>`)}<div class="rr-list">${body}</div></div>`;
  const spend=[];
  if(pl.income>0){const r=pl.expenses/pl.income;spend.push(metric(tr('rp.m.spendIncome'),pct(r),r<=.85?'good':r<=1?'warn':'bad',tr('rp.b.spendIncome'),'fhn'));}
  if(pl.split)spend.push(metric(tr('rp.m.needs'),pct(pl.split.share.needs),pl.split.share.needs<=.5?'good':pl.split.share.needs<=.6?'warn':'bad',tr('rp.b.needs'),'wt'));
  if(R.movers.length)spend.push(metric(tr('rp.m.rise'),`${R.movers[0].name} +${m(R.movers[0].diff)}`,'warn',tr('rp.b.rise'),null));
  const save=[];
  if(pl.savingsRate!=null)save.push(metric(tr('rp.m.rate'),pct(pl.savingsRate),RT[{low:'bad',below:'warn',fair:'warn',good:'good',strong:'good'}[Finance.savingsTier(pl.savingsRate)]],tr('rp.b.rate'),['wt','fid']));
  if(res.months!=null)save.push(metric(tr('rp.m.buffer'),tr('rp.u.months',{n:FMT.number(+res.months.toFixed(1))}),{thin:'bad',building:'warn',solid:'good',strong:'good'}[res.tier],vol?tr('rp.b.bufferVol',{n:String(res.target),level:tr('rp.vol.'+vol.level),cv:pct(vol.cv)}):tr('rp.b.buffer',{n:String(res.target)}),['van','findex'],res.gap>0?tr('rp.n.short',{amount:m(res.gap)}):tr('rp.n.met')));
  if(res.weeks!=null)save.push(metric(tr('rp.m.weeks'),tr('rp.u.weeks',{n:FMT.number(+res.weeks.toFixed(1))}),res.weeks>=6?'good':res.weeks>=3?'warn':'bad',tr('rp.b.weeks'),'jpm'));
  if(region.usd)save.push(metric(tr('rp.m.van'),tr(R.T.liquid>=2000?'rp.v.reached':'rp.v.notYet'),R.T.liquid>=2000?'good':'bad',tr('rp.b.van'),'van'));
  const borrow=[];
  if(R.debtTotal>0){borrow.push(metric(tr('rp.m.debt'),m(R.debtTotal),'',R.wApr?tr('rp.b.debtRate',{rate:FMT.number(+R.wApr.toFixed(1))+'%'}):tr('rp.b.debtNoRate'),null));}
  else borrow.push(metric(tr('rp.m.debtNone'),tr('rp.v.none'),'good',tr('rp.b.debtNone'),null));
  if(pl.dti!=null)borrow.push(metric(tr('rp.m.dti'),pct(pl.dti),pl.dti<=.36?'good':pl.dti<=.43?'warn':'bad',tr(region.us?'rp.b.dtiUS':'rp.b.dti'),'cfpb',pl.assumedNet?tr('rp.n.grossEst'):''));
  if(R.missingRate)borrow.push(`<div class="rr faint sm">${trh('rp.n.fx')}</div>`);
  const plan=[];
  if(fi){plan.push(metric(tr('rp.m.fiNeed'),m(fi.target),'',tr('rp.b.fiNeed',{spend:m(pl.expenses*12),swr:pct(A.swr)}),A.swr===.039?'ms':'bg'));
    plan.push(metric(tr('rp.m.fiTime'),fi.reached?tr('rp.v.there'):fi.years==null?tr('rp.v.notOnTrack'):tr('rp.u.years',{n:FMT.number(fi.years)}),fi.reached?'good':fi.years==null?'bad':fi.years<=25?'good':'warn',tr('rp.b.fiTime',{start:m(R.investable),save:m(R.annualSave),real:pct(A.real)}),null));}
  if(R.nwChange)plan.push(metric(tr('rp.m.nw',{n:String(R.nwChange.days)}),(R.nwChange.delta>=0?'+':'')+m(R.nwChange.delta),R.nwChange.delta>=0?'good':'bad',tr('rp.b.nw'),null));
  const acts=actions(R),needs=t=>`<div class="faint sm">${esc(t)}</div>`;
  return`<div class="grid g-main"><div>
   <div class="card glass rp-score" style="margin-bottom:14px"><div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"><div>${ring((P.total||0)/100,132,13,P.total==null?'var(--fill-2)':'var(--accent)',`<b style="font-size:34px;letter-spacing:-1px">${P.total==null?'–':P.total}</b><div class="faint">${esc(rLabel(P.total))}</div>`)}</div>
    <div class="grow" style="min-width:220px"><b>${trh('rp.pillarsTitle')}</b><div class="muted sm" style="margin-top:6px">${trh('rp.pillarsBody')} ${P.n<4?trh('rp.pillarsMissing'):''}</div>
    <div class="rp-meta">${icon('globe',13)} ${esc(tr('rp.region',{cur:R.cur}))}${region.us?'':' · '+esc(tr('rp.regionIntl'))}</div></div></div></div>
   <div class="sec-h" style="margin-top:0">${trh('rp.priorities')}</div><div class="group">${acts.length?acts.map((a,i)=>`<div class="insight"><div class="e">${i+1}</div><div><b>${esc(a.k)}</b><span>${esc(a.impact)}. ${esc(a.why)} ${a.src.map(k=>`<span class="rsrc">[${srcN(k)}]</span>`).join(' ')}</span></div></div>`).join(''):`<div class="insight"><div><b>${trh('rp.noPriorities')}</b><span>${trh('rp.noPrioritiesD')}</span></div></div>`}</div>
   <div class="sec-h">${trh('rp.labTitle')}</div>${R.strat?`<div class="card glass">${strategyTable(R)}<div class="fg rp-noprint" style="margin-top:12px"><div class="fr"><label for="rpx">${trh('rp.lab.extra')}</label><input id="rpx" type="number" min="0" step="10" value="${R.extra||''}" placeholder="0"></div></div></div>`:`<div class="card glass"><p class="muted" style="margin:0">${trh(R.debts.length?'rp.lab.needData':'rp.lab.noDebt')}</p></div>`}
   <div class="sec-h">${trh('rp.glossTitle')}</div><div class="group rp-gloss">${GLOSS.map(k=>`<details><summary>${trh('rp.g.'+k)}</summary><p>${trh('rp.g.'+k+'D')}</p></details>`).join('')}</div>
  </div><div>
   <div class="grid g2" style="grid-template-columns:1fr">${card('coins','var(--blue)',tr('rp.p.spend'),P.spend,spend.join('')||needs(tr('rp.n.needHistory')))}${card('shield','var(--green)',tr('rp.p.save'),P.save,save.join('')||needs(tr('rp.n.needHistory')))}${card('card','var(--orange)',tr('rp.p.borrow'),P.borrow,borrow.join(''))}${card('bolt','var(--purple)',tr('rp.p.plan'),P.plan,plan.join('')||needs(tr('rp.n.needSavings')))}</div>
   <div class="sec-h rp-noprint">${trh('rp.assumptions')}</div><div class="card glass rp-noprint"><div class="fg"><div class="fr"><label for="rp_real">${trh('rp.a.real')}</label><select id="rp_real">${[.03,.04,.05].map(v=>opt(v,pct(v),v===A.real)).join('')}</select></div><div class="fr"><label for="rp_swr">${trh('rp.a.swr')}</label><select id="rp_swr">${[[.035,'rp.a.swr35'],[.039,'rp.a.swr39'],[.04,'rp.a.swr40']].map(([v,l])=>opt(v,tr(l),v===A.swr)).join('')}</select></div></div></div>
  </div></div>
  <div class="sec-h">${trh('rp.evidence')}</div><div class="card glass"><ol class="sm" style="margin:0;padding-inline-start:20px;line-height:1.7" dir="ltr">${Object.values(RSRC).map(s=>`<li>${s.u?`<a class="link" data-ext="${esc(s.u)}" role="link" tabindex="0">${esc(s.t)}</a>`:esc(s.t)}</li>`).join('')}</ol>
   <p class="faint sm" style="margin:12px 0 0">${trh('rp.howToRead')}</p></div>`;
}
PAGES.report={title:'Report',
 render(){
  const R=reportData();
  if(!R.hasData)return`<div class="page wrap">${lt(trh('rp.title'),trh('rp.subEmpty'))}<div class="card glass">${emptyBox('📊',tr('rp.empty'),`<div>${trh('rp.emptyD')}</div>`)}</div></div>`;
  const btns=hasNative&&native.savePdf?`<button class="btn" id="rp_pdf">${icon('download',16)} ${trh('rp.savePdf')}</button>`:`<button class="btn" id="rp_print">${icon('download',16)} ${trh('rp.print')}</button>`;
  return`<div class="page wrap rp-page">${lt(trh('rp.title'),trh('rp.sub'),btns)}
   <div class="rp-printhead"><b>${trh('rp.title')}</b> · ${esc(FMT.dateTime(new Date().toISOString()))}${S.settings.name?' · '+esc(S.settings.name):''}</div>
   ${reportBody(R)}</div>`;
 },
 after(v){
  $$('[data-ext]',v).forEach(b=>{const go=()=>{if(isHttps(b.dataset.ext))window.open(b.dataset.ext,'_blank','noopener');};b.onclick=go;b.onkeydown=e=>{if(e.key==='Enter')go();};});
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
