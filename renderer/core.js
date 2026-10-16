'use strict';
/* ---------- utils ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
/* ids: 96 random bits from the OS (crypto), base36. Falls back to Math.random only where crypto is missing (never in the app). */
const uid=()=>{try{const b=new Uint32Array(3);crypto.getRandomValues(b);return[...b].map(x=>x.toString(36).padStart(7,'0')).join('').slice(2,19);}catch{return Math.random().toString(36).slice(2,9)+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pd=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const today=()=>ymd(new Date());
const addDays=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return ymd(d)};
const addMonths=(s,n,anchor)=>{const d=pd(s);const a=anchor||d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(a,last));return ymd(d)};
const diffDays=(a,b)=>Math.round((pd(b)-pd(a))/864e5);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sum=(a,f=x=>x)=>a.reduce((s,x)=>s+f(x),0);
const debounce=(f,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};

/* ---------- constants ---------- */
const ACC_TYPES={checking:{n:'Checking',e:'🏦'},savings:{n:'Savings',e:'🐖'},cash:{n:'Cash',e:'💵'},credit:{n:'Credit card',e:'💳',liab:true},investment:{n:'Investment',e:'📈'},loan:{n:'Loan / Debt',e:'🏷️',liab:true}};
const LIQUID=['checking','savings','cash'];
const CURRENCIES=['USD','EUR','GBP','EGP','SAR','AED','CAD','AUD','JPY','INR','TRY','CHF','CNY','BRL','MXN','ZAR','KRW','SEK','NOK','PLN'];
const LOCALES=[['en-US','English (US)'],['en-GB','English (UK)'],['de-DE','Deutsch'],['fr-FR','Français'],['es-ES','Español (España)'],['es-MX','Español (México)'],['it-IT','Italiano'],['pt-BR','Português (BR)'],['tr-TR','Türkçe'],['ar-EG','العربية (مصر)'],['ar-SA','العربية (السعودية)'],['ar-AE','العربية (الإمارات)'],['ja-JP','日本語']];
const ACCENTS=['#0A7F66','#5E5CE6','#BF5AF2','#FF375F','#FF9F0A','#FFD60A','#30D158','#63E6E2','#64D2FF','#8E8E93'];
const EMOJIS=['🛒','🍽️','☕','🚗','⛽','🏠','💡','📱','❤️‍🩹','💊','🛍️','👕','🎬','🎮','📺','🎵','✈️','🏖️','🎓','📚','🎁','🐶','👶','💼','💻','📈','💰','🏦','🧾','🔧','🧩','🎯','🛡️','🚲','🏋️','🍔','🍕','🥦','💈','🌱'];
const PALETTE=['#0A84FF','#FF375F','#30D158','#FF9F0A','#64D2FF','#BF5AF2','#5E5CE6','#63E6E2','#FF6482','#FFD60A','#AC8E68','#8E8E93','#FF8A65'];
const OLD_COLORS={'#7c8cff':'#0A84FF','#f472b6':'#FF375F','#34d399':'#30D158','#fbbf24':'#FFD60A','#38bdf8':'#64D2FF','#fb923c':'#FF9F0A','#a78bfa':'#BF5AF2','#2dd4bf':'#64D2FF','#fb7185':'#FF375F','#84cc16':'#AC8E68','#e879f9':'#BF5AF2','#94a3b8':'#8E8E93','#f97316':'#FF9F0A','#60a5fa':'#0A84FF'};
const DEFAULT_CATS=[
 ['Groceries','🛒','#30D158','e'],['Dining','🍽️','#FF9F0A','e'],['Transport','🚗','#0A84FF','e'],['Housing','🏠','#5E5CE6','e'],['Utilities','💡','#FFD60A','e'],
 ['Health','💊','#FF375F','e'],['Shopping','🛍️','#BF5AF2','e'],['Entertainment','🎬','#FF6482','e'],['Subscriptions','📺','#64D2FF','e'],['Travel','✈️','#63E6E2','e'],
 ['Education','🎓','#AC8E68','e'],['Gifts','🎁','#FF8A65','e'],['Other','🧩','#8E8E93','e'],
 ['Salary','💼','#30D158','i'],['Freelance','💻','#0A84FF','i'],['Investments','📈','#BF5AF2','i'],['Other income','💰','#FFD60A','i']
].map(([name,emoji,color,t])=>({id:'c_'+name.toLowerCase().replace(/\W+/g,'_'),name,emoji,color,type:t==='e'?'expense':'income',budget:0}));
const WIDGETS=[['networth','Net worth hero'],['tip','Tip of the day'],['kpis','Key numbers'],['safe','Safe to spend'],['health','Health score'],['planning','Money health'],['reminders','Reminders'],['digest','This week'],['cashflow','Cash-flow forecast'],['categories','Spending breakdown'],['pace','Daily budget pace'],['budgets','Budgets'],['goals','Goals'],['upcoming','Upcoming bills'],['recent','Recent activity'],['insights','Smart insights'],['heatmap','Spending heatmap']];
const BACKGROUNDS=[['aurora','Aurora',0],['penny','Penny copper',0],['sunset','Sunset',1],['ocean','Ocean',1],['forest','Forest',1],['graphite','Graphite',1],['mono','Mono',1]];
const WIDE=['networth','kpis','cashflow'];
const DEFAULT_SETTINGS={style:'clean',name:'',currency:'USD',locale:'en-US',digits:'latn',theme:'dark',accent:'#0A7F66',brand2:true,report:{real:.04,swr:.039},blur:30,opacity:9,material:'acrylic',compact:false,density:'comfortable',anim:true,solid:false,notify:true,startDismissed:false,lastNotified:'',fontSize:15,cycleStart:1,privacy:false,pin:null,salt:null,bg:'aurora',motion:'full',autoLock:0,blurOnLeave:false,lockOnMinimize:false,remindHour:9,remindDays:3,weeklyDigest:true,remSound:'chime',remLead:0,quietOn:false,quietFrom:'22:00',quietTo:'07:00',nick:'',avatar:'🙂',photo:'',why:'',greet:'friendly',tipsSeen:false,tipsOff:false,tipIdx:0,tourDone:false,uiSounds:false,lastDigest:'',roundUp:false,sounds:false,widgets:WIDGETS.map(w=>({id:w[0],on:true}))};

let SYS={launchAtStartup:false,startMinimized:true,closeToTray:false,tray:true,hotkey:true,hotkeyAccel:'CommandOrControl+Alt+P',alwaysOnTop:false,hideFromCapture:false,zoom:1,hotkeyOk:true,packaged:false,lang:'auto',systemLocale:'en-US'};
/* ---------- state ---------- */
let S=null;
const hasNative=typeof window.native!=='undefined';
const SCHEMA=3; // bump when the stored data layout changes, and add a step to MIGRATIONS (key = the version it upgrades FROM)
const MIGRATIONS={
  1:d=>{d.reminders=d.reminders||[];},
  /* 2 -> 3 (Penny 1.7): per-account currency + typed exchange rates, net-worth snapshots, category buckets / rollover, unique ids */
  2:d=>{
    const st=d.settings||(d.settings={});const base=st.currency||'USD';
    if(!st.fx||typeof st.fx!=='object'||Array.isArray(st.fx))st.fx={};
    (d.accounts||[]).forEach(a=>{if(!a.currency)a.currency=base;});
    (d.categories||[]).forEach(c=>{if(c.bucket!=='needs'&&c.bucket!=='wants')c.bucket=c.type==='income'?'wants':Finance.bucketOf(c);if(!c.roll)c.roll='off';});
    if(!Array.isArray(d.snapshots))d.snapshots=[];
    for(const k of ['accounts','categories','transactions','goals','bills','reminders']){      // two records sharing an id would edit each other: re-key the later one
      const seen=new Set();(d[k]||[]).forEach(x=>{if(!x||typeof x!=='object')return;if(!x.id||seen.has(x.id))x.id=uid();seen.add(x.id);});
    }
  }
};
function migrate(d){
  let v=d.schema||d.version||1;if(v<1)v=1;
  while(v<SCHEMA){if(MIGRATIONS[v])MIGRATIONS[v](d);v++;}
  d.schema=SCHEMA;return d;
}
function normalize(d){
  d.settings={...DEFAULT_SETTINGS,...(d.settings||{})};
  const st=d.settings;
  if(st.accent==='#7c8cff')st.accent=DEFAULT_SETTINGS.accent;
  if(!st.brand2){st.brand2=true;if(st.accent==='#0A84FF')st.accent=DEFAULT_SETTINGS.accent} // 1.7.1 rebrand: move users still on the old default blue to Penny green; custom choices are kept
  const known=new Set((st.widgets||[]).map(w=>w.id));
  st.widgets=(st.widgets||[]).filter(w=>WIDGETS.some(x=>x[0]===w.id));
  WIDGETS.forEach(w=>{if(!known.has(w[0]))st.widgets.push({id:w[0],on:true})});
  ['accounts','categories','transactions','goals','bills','reminders'].forEach(k=>{
    const a=Array.isArray(d[k])?d[k]:[],f=a.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)); // null / non-object entries carry no data
    if(f.length!==a.length)logErr(`ignored ${a.length-f.length} invalid entr${a.length-f.length>1?'ies':'y'} in ${k}`);
    d[k]=f;
  });
  d.rules=sanitizeRules(d.rules);
  d.snapshots=(Array.isArray(d.snapshots)?d.snapshots:[]).filter(x=>x&&Finance.isYMD(x.d)&&isFinite(x.net)).map(x=>({d:x.d,net:+x.net,assets:+x.assets||0,liabs:+x.liabs||0}));
  d.reminders.forEach(r=>{const ok=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');if(!ok(r.next)&&ok(r.date))r.next=r.date;}); // repair only, never delete
  const rc=c=>OLD_COLORS[String(c||'').toLowerCase()]||c;
  d.categories.forEach(c=>c.color=rc(c.color));d.goals.forEach(g=>g.color=rc(g.color));
  delete d.__recovered;delete d.__damaged;
  migrate(d);
  return d;
}
async function loadData(){
  let d=null;
  try{ d=hasNative?await native.load():JSON.parse(localStorage.getItem('penny')||localStorage.getItem('lumivault')||'null'); }catch(e){logErr('load failed',e);}
  if(!d) return null;
  if(d.__damaged)return{__damaged:true};
  if((d.schema||0)>SCHEMA)return{__newer:true,schema:d.schema};
  const rec=d.__recovered;
  // never migrate without a copy of the file exactly as it is on disk
  if(hasNative&&!rec&&(d.schema||d.version||1)<SCHEMA){try{const r=await native.snapshot('pre-migration');if(r&&r.ok===false)logErr('pre-migration backup failed',r.error);}catch(e){logErr('pre-migration backup failed',e);}}
  d=normalize(d);if(rec)d.__rec=rec;
  return d;
}
function logErr(msg,e){try{(hasNative?console.warn:console.error)(msg,e);if(hasNative&&native.log)native.log('error',msg+(e?': '+(e.stack||e.message||e):''));}catch{}}
let _ver=0;
let _dirty=false,_saveFails=0;
const saveNow=()=>{ if(!S)return; try{
  try{recordSnapshot();}catch(e){logErr('snapshot failed',e);}
  const {__rec,...clean}=S;_dirty=false;_pendingSave=false;
  if(!hasNative){localStorage.setItem('penny',JSON.stringify(clean));return;}
  native.save(clean).then(r=>{
    if(r&&r.ok===false){_dirty=true;logErr('save rejected',r.error);if(_saveFails++%5===0&&typeof toast==='function')toast('Couldn’t save your latest change. Your previous data is safe — please restart Penny.',{ms:7000});}
    else _saveFails=0;
  }).catch(e=>{_dirty=true;logErr('save failed',e);});
}catch(e){_dirty=true;logErr('save error',e);} };
/* synchronous flush: used when the window closes or an update restarts the app */
window.__flushSync=()=>{ if(!S||!hasNative||!_dirty&&!_pendingSave)return false; try{const {__rec,...clean}=S;const r=native.saveSync(clean);_dirty=!(r&&r.ok);_pendingSave=false;return !!(r&&r.ok);}catch(e){return false;} };
let _pendingSave=false;
window.addEventListener('beforeunload',()=>{window.__flushSync();});
window.addEventListener('error',e=>logErr('window.onerror',e.error||e.message));
window.addEventListener('unhandledrejection',e=>logErr('unhandledrejection',e.reason));
const _saveD=debounce(saveNow,250);
const save=()=>{_ver++;_dirty=true;_pendingSave=true;_saveD();};

/* ---------- formatting ---------- */
/* DISPLAY formatting only (fmt.js). Stored values are never changed by locale, language or digit settings. */
let FMT=Fmt.create();
function setupFmt(){
  const {currency,digits}=S.settings;
  FMT=Fmt.create({locale:formatLocaleBase(),currency,digits:digits||'latn'});
}
const money=n=>FMT.money(n);
/* ---------- currencies: every account has its own; totals are converted to the base currency with rates YOU typed (offline) ---------- */
const baseCur=()=>S.settings.currency;
const accCur=a=>(a&&a.currency)||baseCur();
const fxo=()=>Finance.makeFx(baseCur(),S.settings.fx);
const moneyIn=(n,c)=>FMT.moneyIn(n,c);
const accMoney=(n,a)=>moneyIn(n,accCur(a));            // an amount in the currency of account `a`
const txMoney=t=>accMoney(t.amount,acc(t.accountId));  // a transaction in its account's currency
const moneyC=n=>FMT.moneyCompact(n);
const amt=(n,cls='')=>`<span class="amt ${cls}" data-v="${Math.round(n*100)/100}">${money(n)}</span>`;
const dshort=s=>FMT.dateShort(s);
const dlong=s=>String(s).slice(0,4)===String(new Date().getFullYear())?FMT.dateMid(s):FMT.dateLong(s);   // year only when it isn't this year
const pct=n=>FMT.percent(n);
const num=(n,o)=>FMT.number(n,o);
function relDate(s){const d=diffDays(today(),s);if(d===0)return tr('rel.today');if(d===1)return tr('rel.tomorrow');if(d===-1)return tr('rel.yesterday');if(d>1&&d<8)return tr('rel.inDays',{count:d});if(d<-1&&d>-8)return tr('rel.daysAgo',{count:-d});return dshort(s)}

/* ---------- lookups ---------- */
const acc=id=>S.accounts.find(a=>a.id===id);
const cat=id=>S.categories.find(c=>c.id===id)||{id:'?',name:'Uncategorized',emoji:'❔',color:'#94a3b8',type:'expense',budget:0};
const catByName=n=>S.categories.find(c=>c.name.toLowerCase()===String(n).toLowerCase());
const isLiab=a=>ACC_TYPES[a.type]?.liab;

/* ---------- calculations ---------- */
let _bc=null;
/* A transfer between accounts in different currencies: `toAmount` (what actually arrived) when known, otherwise converted at your typed rates. */
function transferIn(t,amap){
  if(t.toAmount>0)return t.toAmount;
  const A=amap?amap[t.accountId]:acc(t.accountId),B=amap?amap[t.toAccountId]:acc(t.toAccountId);
  if(!A||!B||accCur(A)===accCur(B))return t.amount;
  const fx=fxo(),ra=fx.rate(accCur(A)),rb=fx.rate(accCur(B));
  return ra&&rb?Math.round(t.amount*ra/rb*100)/100:t.amount;
}
function balMap(){
  if(_bc&&_bc.v===_ver&&_bc.n===S.transactions.length)return _bc.m;
  const m={},after={},vd={},amap={};
  for(const a of S.accounts){m[a.id]=a.opening||0;after[a.id]=0;amap[a.id]=a;vd[a.id]=(a.type==='investment'&&a.value!=null&&isFinite(a.value)&&a.valueDate)?a.valueDate:null;}
  const add=(id,d,v)=>{if(id in m){m[id]+=v;if(vd[id]&&d>vd[id])after[id]+=v;}};
  for(const t of S.transactions){
    if(t.type==='income')add(t.accountId,t.date,t.amount);
    else if(t.type==='expense')add(t.accountId,t.date,-t.amount);
    else if(t.type==='transfer'){add(t.accountId,t.date,-t.amount);add(t.toAccountId,t.date,transferIn(t,amap));}
  }
  /* an investment account can carry a market value typed on a date: value + what moved after that date */
  for(const a of S.accounts)if(vd[a.id])m[a.id]=a.value+after[a.id];
  _bc={v:_ver,n:S.transactions.length,m};return m;
}
const balance=a=>balMap()[a.id]??0;
const balances=()=>S.accounts.map(a=>({a,b:balance(a)}));
/* a function that turns any transaction's amount into the base currency (rate typed by you; unknown rate -> 0 and totals() reports it) */
function conv(){const fx=fxo(),rm={};S.accounts.forEach(a=>{rm[a.id]=fx.rate(accCur(a));});return t=>{const r=rm[t.accountId];return r===undefined?t.amount:(r==null?0:t.amount*r);};}
/* net movement on an account from its transactions alone (ignores any typed market value) */
function flowDelta(a){let d=0;const amap={};S.accounts.forEach(x=>amap[x.id]=x);for(const t of S.transactions){if(t.type==='income'&&t.accountId===a.id)d+=t.amount;else if(t.type==='expense'&&t.accountId===a.id)d-=t.amount;else if(t.type==='transfer'){if(t.accountId===a.id)d-=t.amount;if(t.toAccountId===a.id)d+=transferIn(t,amap);}}return d;}
function totals(){
  const fx=fxo(),missing=new Set();let assets=0,liabs=0,liquid=0;
  for(const a of S.accounts){
    const b=balance(a),r=fx.rate(accCur(a));
    if(r==null){missing.add(accCur(a));continue;}
    const v=b*r;if(isLiab(a))liabs+=v;else assets+=v;if(LIQUID.includes(a.type))liquid+=v;
  }
  return{assets,liabs,net:assets+liabs,liquid,missing:[...missing]};
}
function periodFor(date,offset=0){
  const cs=S.settings.cycleStart,d=pd(date);
  let sy=d.getFullYear(),sm=d.getMonth();if(d.getDate()<cs)sm--;
  sm+=offset;
  const start=new Date(sy,sm,cs),end=new Date(sy,sm+1,cs-1);
  const label=cs===1?FMT.monthYear(start):`${FMT.dateShort(start)} – ${FMT.dateShort(end)}`;
  return{start:ymd(start),end:ymd(end),label,days:Math.round((end-start)/864e5)+1};
}
/* income / expenses / per-category spending between two dates, in the base currency; split transactions count each part in its own category */
function stats(a,b){
  let inc=0,exp=0;const byCat={},cv=conv();
  for(const t of S.transactions){
    if(t.date<a||t.date>b)continue;
    if(t.type==='income')inc+=cv(t);
    else if(t.type==='expense'){
      const v=cv(t);exp+=v;const k=t.amount?v/t.amount:0;
      for(const sp of Finance.splitsOf(t))byCat[sp.category]=(byCat[sp.category]||0)+sp.amount*k;
    }
  }
  return{inc,exp,net:inc-exp,rate:inc>0?(inc-exp)/inc:0,byCat};
}
/* net worth over time: yesterday's reconstruction from your transactions, overridden by the REAL snapshot Penny stored on every day it saw
   (snapshots also capture things transactions cannot, like a changed investment value or an edited opening balance). */
function netWorthSeries(days){
  const delta={},cv=conv();
  for(const t of S.transactions){
    if(t.type==='income')delta[t.date]=(delta[t.date]||0)+cv(t);
    else if(t.type==='expense')delta[t.date]=(delta[t.date]||0)-cv(t);
  }
  let nw=totals().net;const out=[];let d=today();
  for(let i=0;i<=days;i++){
    out.push({x:d,y:nw});
    nw-=(delta[d]||0); // value at end of previous day
    d=addDays(d,-1);
  }
  out.reverse();
  const real=new Map((S.snapshots||[]).map(s=>[s.d,s.net]));
  return out.map((p,i)=>i<out.length-1&&real.has(p.x)?{x:p.x,y:real.get(p.x),real:true}:p);
}
const snapshotDays=()=>(S.snapshots||[]).length;
function recordSnapshot(){
  if(!S||!S.accounts||!S.accounts.length)return;
  const T=totals(),snap={d:today(),net:T.net,assets:T.assets,liabs:T.liabs},l=(S.snapshots||[])[(S.snapshots||[]).length-1];
  if(l&&l.d===snap.d&&Math.abs(l.net-snap.net)<.005&&Math.abs(l.assets-snap.assets)<.005&&Math.abs(l.liabs-snap.liabs)<.005)return;
  S.snapshots=Finance.compactSnapshots(Finance.upsertSnapshot(S.snapshots,snap),snap.d);
}
function accountSeries(a,days){
  const delta={},amap={};S.accounts.forEach(x=>amap[x.id]=x);
  for(const t of S.transactions){
    let v=0;
    if(t.type==='income'&&t.accountId===a.id)v=t.amount;
    else if(t.type==='expense'&&t.accountId===a.id)v=-t.amount;
    else if(t.type==='transfer'){if(t.accountId===a.id)v-=t.amount;if(t.toAccountId===a.id)v+=transferIn(t,amap);}
    if(v)delta[t.date]=(delta[t.date]||0)+v;
  }
  let b=balance(a);const out=[];let d=today();
  for(let i=0;i<=days;i++){out.push(b);b-=(delta[d]||0);d=addDays(d,-1);}
  return out.reverse();
}

/* ---------- bills / recurring ---------- */
const FREQ={weekly:'Weekly',biweekly:'Every 2 weeks',monthly:'Monthly',quarterly:'Every 3 months',yearly:'Yearly'};
function stepBill(next,freq,anchor){
  switch(freq){case'weekly':return addDays(next,7);case'biweekly':return addDays(next,14);case'quarterly':return addMonths(next,3,anchor);case'yearly':return addMonths(next,12,anchor);default:return addMonths(next,1,anchor);}
}
const monthlyEq=b=>b.amount*({weekly:52/12,biweekly:26/12,monthly:1,quarterly:1/3,yearly:1/12}[b.freq]||1);
function occurrences(b,from,to){const out=[];let n=b.next,g=0;while(n<=to&&g++<500){if(n>=from)out.push(n);n=stepBill(n,b.freq,b.anchor);}return out;}
function postBill(b,date){
  S.transactions.push({id:uid(),billId:b.id,date,amount:b.amount,type:b.type,accountId:b.accountId,category:b.category,merchant:b.name,note:'Recurring'});
}
function runBills(){
  let n=0;const t=today();
  for(const b of S.bills){
    if(!b.auto)continue;let g=0;
    while(b.next<=t&&g++<400){postBill(b,b.next);b.next=stepBill(b.next,b.freq,b.anchor);n++;}
  }
  if(n)_ver++;
  return n;
}
/* Cash-flow forecast: scheduled bills are exact; everyday spending comes from Finance.spendForecast (one-offs removed, weekday/season
   pattern when there is enough history) and is shown as an expected line with an 80% range. */
function forecast(days=60){
  const t=today(),end=addDays(t,days),fx=fxo(),cv=conv();
  const liq=S.accounts.filter(a=>LIQUID.includes(a.type)&&fx.rate(accCur(a))!=null);
  const liqIds=new Set(liq.map(a=>a.id));
  const bal0=totals().liquid;
  const hist=S.transactions.filter(x=>x.type==='expense'&&!x.billId&&x.date<=t).map(x=>({date:x.date,amount:cv(x)}));
  const sf=Finance.spendForecast({hist,today:t,horizon:days});
  const ev={};
  for(const b of S.bills){
    if(!liqIds.has(b.accountId))continue;const r=fx.rate(accCur(acc(b.accountId)));
    for(const d of occurrences(b,addDays(t,1),end)){ev[d]=(ev[d]||0)+(b.type==='income'?b.amount:-b.amount)*r;}
  }
  const pts=[{x:t,y:bal0}],lo=[{x:t,y:bal0}],hi=[{x:t,y:bal0}];let min=pts[0],minLow=lo[0],sched=0;
  for(let i=1;i<=days;i++){
    const d=addDays(t,i),c=sf.points[i-1]||{expected:0,low:0,high:0};sched+=(ev[d]||0);
    const p={x:d,y:bal0+sched-c.expected},l={x:d,y:bal0+sched-c.high},h={x:d,y:bal0+sched-c.low};
    pts.push(p);lo.push(l);hi.push(h);if(p.y<min.y)min=p;if(l.y<minLow.y)minLow=l;
  }
  return{pts,lo,hi,min,minLow,daily:sf.daily,confidence:sf.confidence,excluded:sf.excluded,typicalWeek:sf.typicalWeek,sf};
}
function safeToSpend(){
  const t=today(),p=periodFor(t),fx=fxo(),cv=conv();
  const left=Math.max(1,diffDays(t,p.end)+1);
  let bal=totals().liquid,bills=0,inc=0;
  for(const b of S.bills){
    const A=acc(b.accountId),liq=A&&LIQUID.includes(A.type);
    if(!liq)continue;const r=fx.rate(accCur(A));if(r==null)continue;
    for(const d of occurrences(b,t,p.end)){if(d===t&&b.auto)continue;if(b.type==='income')inc+=b.amount*r;else bills+=b.amount*r;}
  }
  const pool=bal+inc-bills;
  const spentToday=sum(S.transactions.filter(x=>x.date===t&&x.type==='expense'&&!x.billId),cv);
  return{perDay:Math.max(0,pool/left),pool,bills,inc,left,spentToday,end:p.end};
}
/* Investment return (XIRR, annualised, on real dates). Money you move INTO the account is a contribution, money you move OUT a withdrawal;
   income/expenses on the account (dividends, fees) are part of the return, not cash flows. The opening balance counts as a first contribution
   on `since` (or the first transfer). The last flow is today's value. Everything stays in the account's own currency. */
function accReturn(a){
  if(!a||a.type!=='investment')return null;
  const amap={};S.accounts.forEach(x=>amap[x.id]=x);
  const tr_=S.transactions.filter(t=>t.type==='transfer'&&(t.accountId===a.id||t.toAccountId===a.id)).sort((x,y)=>x.date<y.date?-1:1);
  const flows=[];
  const start=a.since||(tr_[0]&&tr_[0].date)||null;
  if((a.opening||0)>0&&start)flows.push({date:start,amount:-a.opening});
  for(const t of tr_){if(t.toAccountId===a.id)flows.push({date:t.date,amount:-transferIn(t,amap)});else flows.push({date:t.date,amount:t.amount});}
  const value=balance(a);
  if(!flows.length||!(value>0))return null;
  flows.push({date:today(),amount:value});
  const r=Finance.xirr(flows);if(!r)return null;
  return{...r,flows,value};
}
/* payoff plan for a loan / credit account from what you typed (APR, monthly payment, months remaining) */
function loanPlan(a,extra=0){
  if(!a||!isLiab(a))return null;const principal=-balance(a);if(!(principal>0))return null;
  if(!(a.minPay>0)&&!(a.term>0))return null;
  const p=Finance.amortize({principal,apr:a.apr||0,payment:a.minPay>0?a.minPay:undefined,months:a.term>0?a.term:undefined,extra,start:today()});
  return p;
}
/* ---------- rolling budgets ---------- */
let _ps=null;
function statsFor(offset){const k=_ver+'|'+S.transactions.length+'|'+S.settings.cycleStart;if(!_ps||_ps.k!==k)_ps={k,m:{}};return _ps.m[offset]||(_ps.m[offset]=(()=>{const q=periodFor(today(),offset);return stats(q.start,q.end);})());}
/* what a category can spend in the period `offset` (0 = this one): the monthly limit plus, when "carry over" is on, what earlier periods left unspent */
function budgetFor(c,offset=0){
  const base=c.budget||0;
  if(!(base>0)||(c.roll!=='surplus'&&c.roll!=='both'))return{base,carry:0,available:base};
  const spentPrev=[];
  for(let i=12;i>=1;i--){const q=periodFor(today(),offset-i);if(c.rollFrom&&q.end<c.rollFrom)continue;spentPrev.push(statsFor(offset-i).byCat[c.id]||0);}
  const r=Finance.rollingBudget({budget:base,roll:c.roll,spentPrev});return{base,carry:r.carry,available:r.available};
}
/* ---------- planning ratios (50/30/20, savings rate, emergency fund, debt-to-income, housing) ----------
   Measured on your last 3 COMPLETED periods (this period is still filling up); falls back to the current period only when there is no history. */
function planning(){
  const t=today(),cur=periodFor(t);
  let refs=[1,2,3].map(i=>statsFor(-i)).filter(x=>x.inc>0||x.exp>0),partial=false;
  if(!refs.length){refs=[statsFor(0)];partial=true;}
  const n=refs.length,avg=f=>sum(refs,f)/n,inc=avg(x=>x.inc),exp=avg(x=>x.exp);
  let needs=0,wants=0,housing=0;
  for(const x of refs)for(const [cid,v] of Object.entries(x.byCat)){const c=cat(cid);if(Finance.bucketOf(c)==='needs')needs+=v;else wants+=v;if(/^(housing|rent|mortgage)$/i.test(String(c.name).trim())||c.housing)housing+=v;}
  needs/=n;wants/=n;housing/=n;
  const T=totals(),fx=fxo();
  let debtPay=0;for(const a of S.accounts){if(!isLiab(a)||!(a.minPay>0))continue;const r=fx.rate(accCur(a));if(r!=null)debtPay+=a.minPay*r;}
  const gross=S.settings.grossIncome>0?S.settings.grossIncome:inc,assumedNet=!(S.settings.grossIncome>0);
  const ess=needs>0?needs:exp;
  return{partial,periods:n,income:inc,expenses:exp,needs,wants,housing,debtPay,gross,assumedNet,liquid:T.liquid,essentials:ess,essentialsAreNeeds:needs>0,
    split:Finance.split503020({income:inc,needs,wants}),savingsRate:Finance.savingsRate(inc,exp),emergency:Finance.emergency(T.liquid,ess,6),
    dti:Finance.dti(debtPay,gross),housingRatio:Finance.housing(housing,gross)};
}
function healthScore(){
  const t=today(),p=periodFor(t),prev=periodFor(t,-1);
  const st=stats(p.start,p.end),pv=stats(prev.start,prev.end);
  const inc=st.inc||pv.inc,exp=st.inc?st.exp:pv.exp;
  const rate=inc>0?(inc-exp)/inc:0;
  const sSave=clamp(rate/0.2,0,1)*30;
  const budgeted=S.categories.filter(c=>c.type==='expense'&&c.budget>0);
  let sBud=15;
  if(budgeted.length){const ok=budgeted.filter(c=>(st.byCat[c.id]||0)<=budgetFor(c).available).length;sBud=ok/budgeted.length*25;}
  const pl=planning();
  const months=pl.emergency?pl.emergency.months:0;
  const sEmg=clamp(months/6,0,1)*25;
  const T=totals();const ratio=T.assets>0?-T.liabs/T.assets:(T.liabs<0?1:0);
  const sDebt=clamp(1-ratio/0.5,0,1)*20;
  const total=Math.round(sSave+sBud+sEmg+sDebt);
  return{total,parts:[
    {n:'Savings rate',v:sSave,max:30,d:`${pct(rate)} of income saved`},
    {n:'Budget discipline',v:sBud,max:25,d:budgeted.length?`${budgeted.filter(c=>(st.byCat[c.id]||0)<=budgetFor(c).available).length}/${budgeted.length} on track`:'Set budgets to score'},
    {n:'Emergency fund',v:sEmg,max:25,d:`${months.toFixed(1)} months of essentials`},
    {n:'Debt load',v:sDebt,max:20,d:T.liabs<0?`${pct(ratio)} of assets owed`:'Debt-free'}
  ],label:total>=80?'Excellent':total>=60?'Good':total>=40?'Fair':'Needs love',color:total>=80?'var(--good)':total>=60?'#7fe3a9':total>=40?'var(--warn)':'var(--bad)'};
}
/* repeating payees found in your history (any rhythm, income too); suggestions only */
function detectRecurringAll(){
  return Finance.detectRecurring(S.transactions,{today:today(),known:new Set(S.bills.map(b=>Finance.fold(b.name))),norm:s=>RulesEngine.normPayee(s)||Finance.fold(s)});
}
function detectSubs(){return detectRecurringAll().filter(r=>r.type==='expense'&&r.freq==='monthly').map(r=>({name:r.name,amount:r.amount,category:r.category,accountId:r.accountId,next:r.next}));}
function insights(){
  const out=[];const t=today(),p=periodFor(t),prev=periodFor(t,-1);
  const st=stats(p.start,p.end),pv=stats(prev.start,addDays(prev.start,diffDays(p.start,t)));
  const cname=id=>cat(id).name;
  if(!S.transactions.length)return[{e:'👋',title:'Welcome!',text:'Add your first transaction and I\'ll start finding patterns for you.',tone:'info'}];
  if(pv.exp>0&&st.exp>0){
    const ch=(st.exp-pv.exp)/pv.exp;
    out.push(ch>0.1?{e:'📈',title:`Spending is up ${pct(ch)} vs this point last period`,text:`You've spent ${money(st.exp)} so far vs ${money(pv.exp)} at the same stage last period.`,tone:'bad'}
      :ch<-0.1?{e:'🎉',title:`Spending is down ${pct(-ch)} vs last period`,text:`${money(pv.exp-st.exp)} less than at this point last period. Keep it up!`,tone:'good'}
      :{e:'⚖️',title:'Spending is steady',text:'Right in line with last period at the same point.',tone:'info'});
  }
  const top=Object.entries(st.byCat).sort((a,b)=>b[1]-a[1])[0];
  if(top)out.push({e:cat(top[0]).emoji,title:`${cname(top[0])} is your top category`,text:`${money(top[1])} — ${pct(top[1]/st.exp)} of this period's spending.`,tone:'info'});
  for(const c of S.categories.filter(c=>c.type==='expense'&&c.budget>0)){
    const s=st.byCat[c.id]||0,B=budgetFor(c).available;
    if(s>B)out.push({e:'🚨',title:`${c.name} is over budget`,text:`${money(s-B)} over your ${money(B)} limit.`,tone:'bad'});
    else if(s>B*.85)out.push({e:'⚠️',title:`${c.name} budget ${s>=B?'fully used':'almost used'}`,text:`${pct(s/B)} spent — ${money(B-s)} left for ${Math.max(0,diffDays(t,p.end))} more days.`,tone:'warn'});
  }
  const f=forecast(45);
  if(f.min.y<0)out.push({e:'🕳️',title:'Heads up: your cash may run short',text:`Projected balance dips to ${money(f.min.y)} around ${dshort(f.min.x)}. Consider moving money or trimming spending.`,tone:'bad'});
  const subs=S.bills.filter(b=>b.type==='expense'&&(cat(b.category).name==='Subscriptions'||b.sub));
  if(subs.length){const m=sum(subs,monthlyEq);out.push({e:'🔁',title:`${subs.length} subscriptions cost ${money(m)}/mo`,text:`That's ${money(m*12)} a year. Worth a quick review?`,tone:'info'});}
  const ds=detectSubs();
  if(ds.length)out.push({e:'🕵️',title:`Found ${ds.length} possible hidden subscription${ds.length>1?'s':''}`,text:`${ds.map(d=>d.name).join(', ')} look like monthly charges. Add them in Bills to forecast them.`,tone:'warn'});
  const days=Math.min(diffDays(p.start,t)+1,p.days);
  const spendDays=new Set(S.transactions.filter(x=>x.type==='expense'&&x.date>=p.start&&x.date<=t).map(x=>x.date)).size;
  if(days>=7&&days-spendDays>=3)out.push({e:'🧘',title:`${days-spendDays} no-spend days this period`,text:'Zero-spend days are the quietest way to boost savings.',tone:'good'});
  let we=0,wd=0;for(const x of S.transactions){if(x.type!=='expense'||x.billId||x.date<p.start||x.date>t)continue;const g=pd(x.date).getDay();(g===0||g===6?(we+=x.amount):(wd+=x.amount));}
  if(we+wd>50&&we/(we+wd)>0.45)out.push({e:'🛍️',title:'Weekend spender',text:`${pct(we/(we+wd))} of your discretionary spending happens on weekends.`,tone:'info'});
  if(st.inc>0)out.push(st.rate>=0.2?{e:'💪',title:`Saving ${pct(st.rate)} of income`,text:'You\'re above the 20% rule of thumb. Fantastic.',tone:'good'}:st.rate<0?{e:'🔻',title:'Spending more than you earn this period',text:`Deficit of ${money(-st.net)} so far.`,tone:'bad'}:{e:'🌱',title:`Saving ${pct(st.rate)} of income`,text:`Reaching 20% would mean ${money(st.inc*0.2-st.net)} more this period.`,tone:'info'});
  for(const g of S.goals){
    if(g.saved>=g.target){out.push({e:'🏆',title:`Goal reached: ${g.name}`,text:'Time to celebrate (within budget, of course).',tone:'good'});continue;}
    if(g.deadline){const need=goalNeeded(g);const left=diffDays(t,g.deadline);if(left<0)out.push({e:'⏰',title:`${g.name} is past its deadline`,text:`${money(g.target-g.saved)} still to go.`,tone:'warn'});else if(need>st.net&&st.net>0&&need>st.net*1.5)out.push({e:'🎯',title:`${g.name} needs ${money(need)}/mo`,text:`That's more than your current monthly surplus of ${money(st.net)}.`,tone:'warn'});}
  }
  try{out.push(...smartInsights());}catch(e){console.error(e);}
  return out;
}
function goalNeeded(g){
  const left=diffDays(today(),g.deadline);if(left<=0)return g.target-g.saved;
  return Math.max(0,(g.target-g.saved)/Math.max(1,left/30.44));
}
function lastMonthsAvgByCat(n=3){
  const t=today();const p0=periodFor(t,-n),p1=periodFor(t,-1);
  const s=stats(p0.start,p1.end);const out={};
  for(const k in s.byCat)out[k]=s.byCat[k]/n;return out;
}

/* ---------- smart entry parser ---------- */
/* category suggestion: your rules -> what you filed before -> built-in keywords (see rules-engine.js) */
function suggestCtx(){return {rules:S.rules||[],categories:S.categories,learnIndex:RulesEngine.buildLearn(S.transactions,id=>RulesEngine.isFallbackCat(S.categories.find(c=>c.id===id)))};}
function guessCategory(text,type,extra){return RulesEngine.suggest(suggestCtx(),{merchant:text,type,...(extra||{})}).id;}
function parseSmart(str){
  let s=' '+str.trim()+' ';if(!str.trim())return null;
  const r={type:'expense',date:today()};
  const num=s.match(/([+\-]?)\s*[$€£]?\s*(\d[\d,]*(?:\.\d+)?)/);
  if(num){r.amount=parseFloat(num[2].replace(/,/g,''));if(num[1]==='+')r.type='income';s=s.replace(num[0],' ');}
  const dm=s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if(dm){r.date=dm[1];s=s.replace(dm[0],' ');}
  else if(/\byesterday\b/i.test(s)){r.date=addDays(today(),-1);s=s.replace(/\byesterday\b/i,' ');}
  else if(/\btoday\b/i.test(s)){s=s.replace(/\btoday\b/i,' ');}
  else{const ago=s.match(/\b(\d+)\s*days?\s*ago\b/i);if(ago){r.date=addDays(today(),-ago[1]);s=s.replace(ago[0],' ');}
    else{const wk=s.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i);if(wk){const idx=['sun','mon','tue','wed','thu','fri','sat'].indexOf(wk[1].toLowerCase());let d=new Date();let back=(d.getDay()-idx+7)%7||7;r.date=addDays(today(),-back);s=s.replace(wk[0],' ');}}}
  if(/\b(income|salary|paycheck|got paid|refund|deposit|freelance|earned)\b/i.test(s)){r.type='income';s=s.replace(/\b(income|got paid|earned)\b/ig,' ');}
  const at=s.match(/\b(?:at|@|from|to|for)\s+([^]+)$/i);
  let merchant=(at?at[1]:s).replace(/\s+/g,' ').trim();
  if(at)s=s.replace(at[0],' ');
  if(at){const rest=s.replace(/\s+/g,' ').trim();if(rest)r.note=rest;}
  r.merchant=merchant.replace(/^(a|an|the)\s+/i,'').replace(/\b\w/g,c=>c.toUpperCase());
  r.category=guessCategory((r.merchant||'')+' '+(r.note||''),r.type);
  return r;
}

/* ---------- reminders ---------- */
function dueSoon(days=3){
  const t=today(),end=addDays(t,days),out=[];
  for(const b of S.bills){if(b.type!=='expense')continue;
    if(!b.auto&&b.next<=t){out.push({b,d:b.next,overdue:true});continue;}
    for(const d of occurrences(b,t,end))out.push({b,d});}
  return out.sort((a,b)=>a.d<b.d?-1:1);
}

/* ---------- "Ask Penny": offline natural-language questions ---------- */
function rangeFromText(q){
  const t=today();let m;
  if(/\byesterday\b/.test(q)){const d=addDays(t,-1);return{a:d,b:d,label:'yesterday'};}
  if(/\btoday\b/.test(q))return{a:t,b:t,label:'today'};
  if(/last week/.test(q)){const dow=(pd(t).getDay()+6)%7;const e=addDays(t,-dow-1);return{a:addDays(e,-6),b:e,label:'last week'};}
  if(/this week/.test(q)){const dow=(pd(t).getDay()+6)%7;return{a:addDays(t,-dow),b:t,label:'this week'};}
  if(m=q.match(/last (\d+) days?/))return{a:addDays(t,-(+m[1]-1)),b:t,label:`the last ${m[1]} days`};
  if(/last (month|period)/.test(q)){const p=periodFor(t,-1);return{a:p.start,b:p.end,label:'last month'};}
  if(/last year/.test(q)){const y=+t.slice(0,4)-1;return{a:y+'-01-01',b:y+'-12-31',label:'last year'};}
  if(/this year|year to date|ytd/.test(q))return{a:t.slice(0,4)+'-01-01',b:t,label:'this year'};
  if(/all time|ever|total/.test(q))return{a:'0000-00-00',b:'9999-99-99',label:'all time'};
  const p=periodFor(t);return{a:p.start,b:p.end,label:'this month',dflt:true};
}
function askPenny(raw){
  const q=raw.toLowerCase().trim();if(q.length<4)return null;
  const num=x=>parseFloat(String(x).replace(/,/g,''));
  let m;
  if(m=q.match(/afford\s+(?:a |an |the )?[^\d$€£]*[$€£]?\s*(\d[\d,]*(?:\.\d+)?)/)){
    const amount=num(m[1]),f=forecast(60),T=totals(),s=safeToSpend();
    const after=f.min.y-amount;const ok=after>=0;
    return{e:ok?'✅':'⚠️',title:ok?`Yes, you can afford ${money(amount)}`:`Risky: ${money(amount)} could leave you short`,
      text:`Liquid cash today is ${money(T.liquid)}. After this purchase your lowest projected balance over the next 60 days would be ${money(after)} (around ${dshort(f.min.x)}). Your safe-to-spend pace is ${money(s.perDay)}/day.`};
  }
  if(/net ?worth/.test(q)){const T=totals();return{e:'💎',title:`Net worth: ${money(T.net)}`,text:`${money(T.assets)} in assets${T.liabs<0?` minus ${money(-T.liabs)} owed`:''}.`};}
  if(/(balance|how much (money|cash)|do i have)/.test(q)&&!/spen|earn|income/.test(q)){
    const a=S.accounts.find(a=>q.includes(a.name.toLowerCase()));
    if(a)return{e:ACC_TYPES[a.type].e,title:`${a.name}: ${money(balance(a))}`,text:`${ACC_TYPES[a.type].n} account.`};
    const T=totals();return{e:'💵',title:`You have ${money(T.liquid)} in cash accounts`,text:`Net worth is ${money(T.net)}.`};
  }
  const r=rangeFromText(q);
  const matchCat=S.categories.find(c=>{const n=c.name.toLowerCase();return q.includes(n)||q.includes(n.replace(/s$/,''))||(n.endsWith('ing')&&q.includes(n.slice(0,-3)));});
  const merchants=[...new Set(S.transactions.map(t=>t.merchant).filter(Boolean))];
  const matchMer=!matchCat&&merchants.find(x=>q.includes(x.toLowerCase()));
  const inRange=S.transactions.filter(t=>t.date>=r.a&&t.date<=r.b);
  if(/(biggest|largest|most expensive|top)/.test(q)&&/(expens|purchase|spend|transaction|payment)/.test(q)){
    const l=inRange.filter(t=>t.type==='expense'&&(!matchCat||t.category===matchCat.id)).sort((a,b)=>b.amount-a.amount)[0];
    if(!l)return{e:'🤷',title:'No expenses found',text:`Nothing recorded for ${r.label}.`};
    return{e:'🏷️',title:`${money(l.amount)} at ${l.merchant||cat(l.category).name}`,text:`Your largest expense ${r.label} — ${dlong(l.date)}.`,tx:l};
  }
  if(/(spen|spent|expens|cost|paid|pay)/.test(q)){
    const cv=conv(),hasCat=t=>!matchCat||Finance.splitsOf(t).some(x=>x.category===matchCat.id);
    const part=t=>(matchCat?sum(Finance.splitsOf(t).filter(x=>x.category===matchCat.id),x=>x.amount):t.amount)*(t.amount?cv(t)/t.amount:0);
    const l=inRange.filter(t=>t.type==='expense'&&hasCat(t)&&(!matchMer||t.merchant===matchMer));
    const total=sum(l,part);const what=matchCat?matchCat.name.toLowerCase():matchMer?matchMer:'';
    const days=Math.max(1,diffDays(r.a<'1900'?(l[0]?.date||r.b):r.a,r.b>today()?today():r.b)+1);
    return{e:matchCat?matchCat.emoji:'🧾',title:`${money(total)} spent${what?` on ${what}`:''} ${r.label}`,text:`${l.length} transaction${l.length===1?'':'s'}${l.length?` · about ${money(total/days)} per day`:''}.`,list:l.sort((a,b)=>b.amount-a.amount).slice(0,4)};
  }
  if(/(earn|income|made|salary|paid me|received)/.test(q)){
    const l=inRange.filter(t=>t.type==='income'&&(!matchCat||t.category===matchCat.id));
    return{e:'💰',title:`${money(sum(l,t=>t.amount))} earned ${r.label}`,text:`${l.length} deposit${l.length===1?'':'s'}.`,list:l.sort((a,b)=>b.amount-a.amount).slice(0,4)};
  }
  if(/(sav(e|ed|ing))/.test(q)){
    const st=stats(r.a,r.b);return{e:'🐖',title:`${money(st.net)} saved ${r.label}`,text:`That's ${pct(st.rate)} of ${money(st.inc)} income.`};
  }
  return null;
}
