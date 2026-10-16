'use strict';
/* =========================================================================
   Financial Health Report (1.8). Reads only your own data, all maths in finance.js.
   Structure follows the four pillars used by the Financial Health Network (Spend, Save, Borrow, Plan).
   Every benchmark names its source; benchmarks are rules of thumb from published research, mostly US-based, and not advice.
   Report text is English; amounts, dates and percentages follow your language settings.
   ========================================================================= */
const RSRC={
  fhn:{t:'Financial Health Network, FinHealth Score framework and Pulse 2025',u:'https://finhealthnetwork.org/wp-content/uploads/2025/09/Financial-Health-Pulse-2025-U.S.-Trends-Report.pdf'},
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
  return{T,pl,cur,vol,res,debts,debtTotal,wApr,missingRate,A,investable,annualSave,fi,movers,nwChange,strat,extra,months,
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
const rLabel=s=>s==null?'Not enough data':s>=80?'Strong':s>=60?'Solid':s>=40?'Building':'Needs attention';
const rTone=s=>s==null?'':s>=80?'good':s>=60?'good':s>=40?'warn':'bad';
function metric(label,value,tone,bench,srcKey,note){
  return`<div class="rr"><div class="row sm" style="margin-bottom:4px"><span>${esc(label)}</span><b class="amt ${tone||''}" dir="auto">${esc(value)}</b></div>
   <div class="faint sm">${esc(bench)}${srcKey?` <span class="rsrc" title="${esc(RSRC[srcKey].t)}">[${Object.keys(RSRC).indexOf(srcKey)+1}]</span>`:''}</div>${note?`<div class="sm" style="margin-top:4px">${esc(note)}</div>`:''}</div>`;
}
function actions(R){
  const {pl,res,debts,vol}=R,out=[],m=money;
  if(res.months!=null&&res.months<1)out.push({k:'Build a starter buffer',impact:m(Math.max(0,pl.essentials-R.T.liquid))+' to reach one month of essentials',why:'Emergency savings were the strongest predictor of financial well-being in Vanguard’s survey, and a household typically needs about 6 weeks of take-home pay to ride out an income dip.',src:['van','jpm']});
  const hi=debts.filter(d=>d.apr>=15).sort((a,b)=>b.apr-a.apr)[0];
  if(hi)out.push({k:`Pay down ${hi.name} first (${hi.apr}% APR)`,impact:`Every ${m(1000)} paid off saves about ${m(1000*hi.apr/100)} a year in interest`,why:'Highest-APR-first minimises interest. Cash sitting in savings earns far less than a card charges.',src:[]});
  if(pl.savingsRate!=null&&pl.savingsRate<.10&&pl.income>0)out.push({k:'Lift your savings rate to 10%',impact:'+'+m(Math.max(0,pl.income*.10-(pl.income-pl.expenses)))+' a month',why:'Fidelity’s guideline is at least 15% of pre-tax income including any employer contribution; 10% is a realistic first step.',src:['fid']});
  if(res.months!=null&&res.months>=1&&res.months<res.target)out.push({k:`Grow your buffer to ${res.target} months`,impact:m(res.gap)+' to go'+(vol?` (target is higher because your income is ${vol.level})`:''),why:'Three to six months of essential spending is the common range; irregular income argues for the upper end.',src:['van','jpm']});
  if(pl.dti!=null&&pl.dti>.36)out.push({k:'Bring debt payments under 36% of gross income',impact:`Currently ${pct(pl.dti)}`,why:'Lenders treat 36% as a comfortable ceiling for total debt payments.',src:['cfpb']});
  if(R.movers.length)out.push({k:`Check ${R.movers[0].name}`,impact:`${m(R.movers[0].now)} this period vs ${m(R.movers[0].avg)} usual`,why:'Spending that jumps above your own recent average is the cheapest place to find money.',src:['wt']});
  if(pl.savingsRate!=null&&pl.savingsRate>=.15&&(res.months==null||res.months>=res.target)&&!hi)out.push({k:'You are on a strong footing: put surplus to work',impact:'Keep saving; compare investing against your debts’ APRs',why:'Savings of 15% or more of income, a funded buffer and no expensive debt is the position Fidelity’s plan assumes.',src:['fid']});
  return out.slice(0,6);
}
function strategyTable(R){
  const st=R.strat,a=st.ava,s=st.snow,mn=st.min,m=money;
  if(a.neverPaysOff||mn.neverPaysOff)return`<div class="notice warn">${icon('alert',16)}<span>At the minimum payments you entered, at least one debt never pays off. Raise the payment or add extra below.</span></div>`;
  const row=(n,r,hl)=>`<div class="kv" style="padding:9px 16px${hl?';font-weight:600':''}"><span>${n}</span><span class="amt sm" style="display:flex;gap:18px"><span>${r.months} mo</span><span>${m(r.totalInterest)}</span><span class="good">${r===mn?'—':m(mn.totalInterest-r.totalInterest)}</span></span></div>`;
  return`<div class="group flat"><div class="kv" style="padding:8px 16px;font-size:12.5px"><span>Strategy</span><span style="display:flex;gap:18px"><span>Time</span><span>Interest</span><span>Saved</span></span></div>
   ${row('Minimums only',mn)}${row('Snowball (smallest first)',s)}${row('Avalanche (highest APR first)',a,true)}</div>
   <p class="faint sm" style="margin:10px 4px 0">Avalanche costs least in interest${s.totalInterest-a.totalInterest>0.5?` (${m(s.totalInterest-a.totalInterest)} less than snowball here)`:' (about the same as snowball for your debts)'}. Research (Gal and McShane, 2012) finds that clearing one debt at a time keeps people motivated, so if the gap is small, the method you will stick with is a sound choice. Order: ${a.order.map(o=>esc(o.name)).join(' → ')}. ${R.extra>0?'Includes your extra '+m(R.extra)+' a month.':''}</p>`;
}
PAGES.report={title:'Report',
 render(){
  const R=reportData();
  if(!R.hasData)return`<div class="page wrap">${lt('Financial Health Report','An evidence-based reading of your money')}<div class="card glass">${emptyBox('📊','Not enough data yet',`<div>Add a few weeks of income and spending, or load the demo data, and your report appears here.</div>`)}</div></div>`;
  const P=pillars(R),{pl,res,vol,fi,A}=R,m=money,card=(ic,col,title,score,body)=>`<div class="card glass">${ch(ic,col,title,score==null?'':`<b class="${rTone(score)}">${score} · ${rLabel(score)}</b>`)}<div class="rr-list">${body}</div></div>`;
  const spend=[];
  if(pl.income>0){const r=pl.expenses/pl.income;spend.push(metric('Spending vs income',pct(r),r<=.85?'good':r<=1?'warn':'bad','Spending below income is the base of every other goal.','fhn'));}
  if(pl.split)spend.push(metric('Needs share of income',pct(pl.split.share.needs),pl.split.share.needs<=.5?'good':pl.split.share.needs<=.6?'warn':'bad','50/30/20 guideline: needs about 50%, wants 30%, saving 20%.','wt'));
  if(R.movers.length)spend.push(metric('Biggest rise vs your average',`${R.movers[0].name} +${m(R.movers[0].diff)}`,'warn','Compared with the average of your previous three periods.',null));
  const save=[];
  if(pl.savingsRate!=null)save.push(metric('Savings rate',pct(pl.savingsRate),RT[{low:'bad',below:'warn',fair:'warn',good:'good',strong:'good'}[Finance.savingsTier(pl.savingsRate)]],'Fidelity: at least 15% of pre-tax income (yours is measured on money received, so the bar is slightly higher).','fid'));
  if(res.months!=null)save.push(metric('Cash buffer',`${res.months.toFixed(1)} months`,{thin:'bad',building:'warn',solid:'good',strong:'good'}[res.tier],`Target ${res.target} months of essentials${vol?`; your income is ${vol.level} (variation ${pct(vol.cv)})`:' (3 to 6 months is the usual range)'}.`,'van',res.gap>0?`${m(res.gap)} short of target.`:'Target met.'));
  if(res.weeks!=null)save.push(metric('Buffer in weeks of take-home',`${res.weeks.toFixed(1)} weeks`,res.weeks>=6?'good':res.weeks>=3?'warn':'bad','JPMorgan Chase Institute: about 6 weeks covered a typical income dip plus expense spike.','jpm'));
  if(R.cur==='USD')save.push(metric('Vanguard $2,000 threshold',R.T.liquid>=2000?'Reached':'Not yet',R.T.liquid>=2000?'good':'bad','Having at least $2,000 saved was linked to a 21% higher financial well-being score.','van'));
  const borrow=[];
  if(R.debtTotal>0){borrow.push(metric('Total debt',m(R.debtTotal),'','Weighted average rate '+(R.wApr?R.wApr.toFixed(1)+'%':'not entered')+'.',null));}
  else borrow.push(metric('Debt','None recorded','good','Nothing to pay down.',null));
  if(pl.dti!=null)borrow.push(metric('Debt payments / gross income',pct(pl.dti),pl.dti<=.36?'good':pl.dti<=.43?'warn':'bad','Lender convention: keep total debt payments at or below 36%.','cfpb',pl.assumedNet?'Gross income is estimated from take-home. Enter it in Settings for accuracy.':''));
  if(R.missingRate)borrow.push(`<div class="rr faint sm">Some accounts use a currency without an exchange rate and are left out.</div>`);
  const plan=[];
  if(fi){plan.push(metric('Portfolio needed for independence',m(fi.target),'',`Yearly spending ${m(pl.expenses*12)} ÷ ${pct(A.swr,1)} withdrawal rate.`,A.swr===.039?'ms':'bg'));
    plan.push(metric('Estimated time to get there',fi.reached?'Already there':fi.years==null?'Not on current savings':`${fi.years} years`,fi.reached?'good':fi.years==null?'bad':fi.years<=25?'good':'warn',`Starting from ${m(R.investable)} invested, saving ${m(R.annualSave)} a year, with ${pct(A.real,1)} real return. A projection, not a promise.`,null));}
  if(R.nwChange)plan.push(metric('Net worth, last '+R.nwChange.days+' days',(R.nwChange.delta>=0?'+':'')+m(R.nwChange.delta),R.nwChange.delta>=0?'good':'bad','Measured from Penny’s daily snapshots.',null));
  const acts=actions(R);
  return`<div class="page wrap">${lt('Financial Health Report','Built from your numbers and published research, nothing leaves this PC')}
  <div class="grid g-main"><div>
   <div class="card glass" style="margin-bottom:14px"><div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"><div>${ring((P.total||0)/100,132,13,P.total==null?'var(--fill-2)':'var(--accent)',`<b style="font-size:34px;letter-spacing:-1px">${P.total==null?'–':P.total}</b><div class="faint">${rLabel(P.total)}</div>`)}</div>
    <div class="grow" style="min-width:220px"><b>Four pillars: Spend, Save, Borrow, Plan</b><div class="muted sm" style="margin-top:6px">Penny’s own reading, scored 0 to 100 from the benchmarks below. It is not a credit score and not the Financial Health Network’s official score. ${P.n<4?'Some pillars are blank because the data they need is missing.':''}</div></div></div></div>
   <div class="sec-h" style="margin-top:0">Priorities</div><div class="group">${acts.length?acts.map((a,i)=>`<div class="insight"><div class="e">${i+1}</div><div><b>${esc(a.k)}</b><span>${esc(a.impact)}. ${esc(a.why)} ${a.src.map(k=>`<span class="rsrc">[${Object.keys(RSRC).indexOf(k)+1}]</span>`).join(' ')}</span></div></div>`).join(''):`<div class="insight"><div><b>No urgent priorities</b><span>Your numbers sit within the benchmarks Penny checks.</span></div></div>`}</div>
   <div class="sec-h">Debt payoff lab</div>${R.strat?`<div class="card glass">${strategyTable(R)}<div class="fg" style="margin-top:12px"><div class="fr"><label>Extra per month</label><input id="rpx" type="number" min="0" step="10" value="${R.extra||''}" placeholder="0"></div></div></div>`:`<div class="card glass"><p class="muted" style="margin:0">${R.debts.length?'Enter the monthly payment and interest rate on each debt (Accounts, tap the debt) to compare payoff strategies.':'No debts recorded.'}</p></div>`}
  </div><div>
   <div class="grid g2" style="grid-template-columns:1fr">${card('coins','var(--blue)','Spend',P.spend,spend.join('')||'<div class="faint sm">Needs income and spending history.</div>')}${card('shield','var(--green)','Save',P.save,save.join('')||'<div class="faint sm">Needs income and spending history.</div>')}${card('card','var(--orange)','Borrow',P.borrow,borrow.join(''))}${card('bolt','var(--purple)','Plan',P.plan,plan.join('')||'<div class="faint sm">Needs income, spending and some savings.</div>')}</div>
   <div class="sec-h">Assumptions you can change</div><div class="card glass"><div class="fg"><div class="fr"><label>Real return (after inflation)</label><select id="rp_real">${[.03,.04,.05].map(v=>opt(v,pct(v,0),v===A.real)).join('')}</select></div><div class="fr"><label>Withdrawal rate</label><select id="rp_swr">${[[.035,'3.5% cautious'],[.039,'3.9% Morningstar 2026'],[.04,'4.0% classic rule']].map(([v,l])=>opt(v,l,v===A.swr)).join('')}</select></div></div></div>
  </div></div>
  <div class="sec-h">Evidence and method</div><div class="card glass"><ol class="sm" style="margin:0;padding-left:20px;line-height:1.7">${Object.values(RSRC).map(s=>`<li>${s.u?`<a class="link" data-ext="${esc(s.u)}" role="link" tabindex="0">${esc(s.t)}</a>`:esc(s.t)}</li>`).join('')}</ol>
   <p class="faint sm" style="margin:12px 0 0">How to read this: benchmarks are rules of thumb from published studies, mostly about US households, and individual circumstances differ. Projections assume steady returns and do not include taxes, Social Security or pensions. Penny is not a financial adviser; use this as a starting point for your own decisions or a conversation with a qualified professional. Everything is computed on this PC from your own data.</p></div></div>`;
 },
 after(v){
  $$('[data-ext]',v).forEach(b=>{const go=()=>{if(isHttps(b.dataset.ext))window.open(b.dataset.ext,'_blank','noopener');};b.onclick=go;b.onkeydown=e=>{if(e.key==='Enter')go();};});
  const x=$('#rpx',v);if(x)x.onchange=()=>{window._rpExtra=Math.max(0,parseFloat(x.value)||0);setTimeout(refresh,0);};
  const set=(k,id)=>{const e=$(id,v);if(e)e.onchange=()=>{S.settings.report=Object.assign({real:.04,swr:.039},S.settings.report||{},{[k]:parseFloat(e.value)});setTimeout(changed,0);};};
  set('real','#rp_real');set('swr','#rp_swr');
 }};
