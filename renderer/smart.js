'use strict';
/* ============ Penny smart engine — everything runs on this PC, no network ============ */
const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

/* unusually large purchases (last 30 days) vs. what you normally spend in that category */
function anomalies(){
  const t=today(),from=addDays(t,-30),out=[];
  const hist={};
  for(const x of S.transactions){if(x.type!=='expense'||x.billId)continue;(hist[x.category]=hist[x.category]||[]).push(x);}
  for(const [c,arr] of Object.entries(hist)){
    const prior=arr.filter(x=>x.date<from).map(x=>x.amount);if(prior.length<5)continue;
    const med=median(prior),lim=Math.max(med*3,50);
    for(const x of arr)if(x.date>=from&&x.amount>lim)out.push({t:x,med});
  }
  return out.sort((a,b)=>b.t.amount-a.t.amount).slice(0,3);
}
/* possible double charges: same merchant + same amount within 2 days */
function duplicates(){
  const t=today(),from=addDays(t,-45),by={},out=[];
  for(const x of S.transactions){if(x.type!=='expense'||x.billId||x.date<from||!x.merchant||x.amount<3)continue;(by[norm(x.merchant)+'|'+x.amount.toFixed(2)]=by[norm(x.merchant)+'|'+x.amount.toFixed(2)]||[]).push(x);}
  for(const arr of Object.values(by)){arr.sort((a,b)=>a.date<b.date?-1:1);for(let i=1;i<arr.length;i++)if(diffDays(arr[i-1].date,arr[i].date)<=2&&arr[i-1].date<=t)out.push([arr[i-1],arr[i]]);}
  return out.slice(0,3);
}
/* a recurring charge that quietly got more expensive */
function priceHikes(){
  const by={},out=[];
  for(const x of S.transactions){if(x.type!=='expense'||!x.merchant)continue;(by[norm(x.merchant)]=by[norm(x.merchant)]||[]).push(x);}
  for(const arr of Object.values(by)){
    if(arr.length<3)continue;arr.sort((a,b)=>a.date<b.date?-1:1);
    const last=arr[arr.length-1],prev=arr[arr.length-2],before=arr[arr.length-3];
    if(diffDays(before.date,last.date)>100||diffDays(before.date,last.date)<40)continue;
    if(Math.abs(prev.amount-before.amount)<=before.amount*.02&&last.amount>prev.amount*1.05&&last.amount-prev.amount>=0.5&&diffDays(last.date,today())<=45)out.push({name:last.merchant,from:prev.amount,to:last.amount});
  }
  return out.slice(0,3);
}
/* how many months could you live on your liquid cash? */
function runway(){
  const t=today(),p3=periodFor(t,-3),pv=periodFor(t,-1),s=stats(p3.start,pv.end);
  const m=Math.max(1,s.exp/3);return{months:totals().liquid/m,monthly:m};
}
/* “round-up” savings: round every expense up to the next whole unit */
function roundUps(days=30){
  const from=addDays(today(),-(days-1));let tot=0,n=0;
  for(const x of S.transactions){if(x.type!=='expense'||x.date<from)continue;const r=Math.ceil(x.amount)-x.amount;if(r>0.005){tot+=r;n++;}}
  return{total:tot,n,yearly:tot*365/days};
}
function streaks(){
  const t=today(),spent=new Set(S.transactions.filter(x=>x.type==='expense'&&!x.billId).map(x=>x.date));
  let ns=0,d=t;if(spent.has(d))d=addDays(d,-1); // today still counts as open
  const first=S.transactions.length?S.transactions.reduce((m,x)=>x.date<m?x.date:m,t):t;
  while(d>=first&&!spent.has(d)&&ns<365){ns++;d=addDays(d,-1);}
  if(!spent.has(t))ns=ns; 
  let best=0,run=0;for(let i=0;i<120;i++){const dd=addDays(t,-i);if(dd<first)break;if(!spent.has(dd)){run++;best=Math.max(best,run);}else run=0;}
  return{noSpend:ns,best};
}
function weeklyDigest(){
  const t=today(),dow=(pd(t).getDay()+6)%7,ws=addDays(t,-dow),pws=addDays(ws,-7),pwe=addDays(ws,-1);
  const sp=(a,b)=>S.transactions.filter(x=>x.type==='expense'&&x.date>=a&&x.date<=b);
  const cur=sp(ws,t),prv=sp(pws,addDays(pws,dow));
  const tot=sum(cur,x=>x.amount),ptot=sum(prv,x=>x.amount);
  const byC={};cur.forEach(x=>byC[x.category]=(byC[x.category]||0)+x.amount);
  const top=Object.entries(byC).sort((a,b)=>b[1]-a[1])[0];
  const big=[...cur].sort((a,b)=>b.amount-a.amount)[0];
  const inc=sum(S.transactions.filter(x=>x.type==='income'&&x.date>=ws&&x.date<=t),x=>x.amount);
  return{tot,ptot,top,big,inc,days:dow+1,delta:ptot>0?(tot-ptot)/ptot:0,count:cur.length};
}
/* budgets: how much per day is left in each budget */
function dailyPace(){
  const t=today(),p=periodFor(t),st=stats(p.start,p.end),left=Math.max(1,diffDays(t,p.end)+1),out=[];
  for(const c of S.categories.filter(c=>c.type==='expense'&&c.budget>0)){const s=st.byCat[c.id]||0;{const B=budgetFor(c).available;out.push({c,left:B-s,perDay:(B-s)/left,used:s/B});}}
  return out.sort((a,b)=>b.used-a.used);
}
/* merchants you pay most */
function topMerchants(n=5,days=90){
  const from=addDays(today(),-days),m={};
  for(const x of S.transactions){if(x.type!=='expense'||!x.merchant||x.date<from)continue;const k=norm(x.merchant);const o=m[k]=m[k]||{name:x.merchant,total:0,n:0,cat:x.category};o.total+=x.amount;o.n++;}
  return Object.values(m).sort((a,b)=>b.total-a.total).slice(0,n);
}
/* month calendar: spending per day + bills due */
function calendarMonth(y,m){
  const first=new Date(y,m,1),last=new Date(y,m+1,0),a=ymd(first),b=ymd(last),days={};
  for(let d=1;d<=last.getDate();d++)days[ymd(new Date(y,m,d))]={exp:0,inc:0,bills:[],rems:[]};
  for(const x of S.transactions){if(x.date<a||x.date>b)continue;const o=days[x.date];if(x.type==='expense')o.exp+=x.amount;else if(x.type==='income')o.inc+=x.amount;}
  const t=today();
  for(const bl of S.bills){for(const d of occurrences(bl,a>t?a:t,b)){if(days[d]&&!(d===t&&bl.auto))days[d].bills.push(bl);}
    if(!bl.auto&&bl.next<t&&bl.next>=a&&days[bl.next])days[bl.next].bills.push(bl);}
  for(const r of (S.reminders||[])){if(r.done)continue;let d=r.next,g=0;while(d<=b&&g++<400){if(d>=a&&days[d])days[d].rems.push(r);const n=stepRem(d,r.repeat,r.anchor);if(!n)break;d=n;}}
  return{first,last,days,startDow:(first.getDay()+6)%7};
}
/* debt payoff simulator (needs apr + minPay on liability accounts) */
function debtList(){
  return S.accounts.filter(a=>isLiab(a)&&balance(a)<-0.005).map(a=>({id:a.id,name:a.name,bal:-balance(a),apr:+a.apr||0,min:Math.max(+a.minPay||0,0)}));
}
function debtPlan(extra,method){
  const ds=debtList().map(d=>({...d,min:d.min||Math.max(25,d.bal*0.02)}));
  if(!ds.length)return null;
  let months=0,interest=0;const done={};
  while(ds.some(d=>d.bal>0.005)&&months<600){
    months++;
    let pool=extra+sum(ds.filter(d=>d.bal>0.005),d=>d.min);
    for(const d of ds)if(d.bal>0.005){const i=d.bal*d.apr/1200;d.bal+=i;interest+=i;}
    const order=ds.filter(d=>d.bal>0.005).sort((a,b)=>method==='snowball'?a.bal-b.bal:b.apr-a.apr||a.bal-b.bal);
    for(const d of ds)if(d.bal>0.005){const p=Math.min(d.bal,d.min);d.bal-=p;pool-=p;}
    for(const d of order){if(pool<=0)break;const p=Math.min(d.bal,pool);d.bal-=p;pool-=p;}
    for(const d of ds)if(d.bal<=0.005&&!(d.id in done))done[d.id]=months;
  }
  const stuck=ds.filter(d=>d.bal>0.005&&d.min<=d.bal*d.apr/1200).map(d=>({name:d.name,need:Math.ceil(d.bal*d.apr/1200+1)}));
  return{months,interest,done,capped:months>=600,stuck,list:ds};
}
/* what-if: spend less / save more → net worth in the future */
function whatIf(cutPct,extra){
  const t=today(),p3=periodFor(t,-3),pv=periodFor(t,-1),s=stats(p3.start,pv.end);
  const inc=s.inc/3,exp=s.exp/3,base=inc-exp,now=totals().net;
  const mo=base+exp*cutPct/100+extra;
  return{inc,exp,base,mo,now,at:y=>now+mo*12*y,atBase:y=>now+base*12*y};
}
function goalEta(g,monthly){
  if(g.saved>=g.target)return 0;if(monthly<=0)return null;
  return Math.ceil((g.target-g.saved)/monthly);
}

/* feed the smart findings into the Insights page */
function lastWeekSummary(){
  const t=today(),dow=(pd(t).getDay()+6)%7,ws=addDays(t,-dow),a=addDays(ws,-7),b=addDays(ws,-1);
  const tx=S.transactions.filter(x=>x.date>=a&&x.date<=b);
  const exp=sum(tx.filter(x=>x.type==='expense'),x=>x.amount),inc=sum(tx.filter(x=>x.type==='income'),x=>x.amount);
  const byC={};tx.filter(x=>x.type==='expense').forEach(x=>byC[x.category]=(byC[x.category]||0)+x.amount);
  const top=Object.entries(byC).sort((x,y)=>y[1]-x[1])[0];
  return{exp,inc,top,n:tx.length};
}
