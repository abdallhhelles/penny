'use strict';
const PAGES={};
const greet=()=>{const h=new Date().getHours();return h<5?'Good night':h<12?'Good morning':h<18?'Good afternoon':'Good evening'};
const txIcon=t=>t.type==='transfer'?{e:'🔁',c:'#0A84FF'}:(t.splits&&t.splits.length>1?{e:'🧩',c:'#8E8E93'}:{e:cat(t.category).emoji,c:cat(t.category).color});
const txTitle=t=>t.merchant||(t.type==='transfer'?tr('tx.transfer'):cat(t.category).name);
const ch=(ic,color,label,right='')=>`<div class="ch"><i class="ci" style="--c:${color}">${icon(ic,14,2.3)}</i><span>${label}</span><span class="r">${right}</span></div>`;
const lt=(title,sub,btns='')=>`<div class="lt"><div><h1>${title}</h1><p>${sub}</p></div><div class="acts">${btns}</div></div>`;
const btn=(ic,label,attr,cls='')=>`<button class="btn ${cls}" ${attr}>${icon(ic)}${label}</button>`;
const more=(go,label='See all')=>`<a data-go="${go}">${label}</a>`;
function txAmount(t){const c=t.type==='income'?'good':t.type==='expense'?'':'muted';return`<span class="amt ${c}">${t.type==='income'?'+':t.type==='expense'?'−':''}${txMoney(t)}</span>`;}
function txRow(t){const i=txIcon(t);const a=acc(t.accountId);
  const sub=t.type==='transfer'?`${esc(a?.name||'?')} → ${esc(acc(t.toAccountId)?.name||'?')}`:`${t.splits&&t.splits.length>1?trh('tx.split.n',{count:t.splits.length}):esc(cat(t.category).name)} · ${esc(a?.name||'')}`;
  return`<div class="li" data-tx="${t.id}"><div class="sq" style="--c-bg:${i.c}2e">${gl(i.e)}</div><div class="grow"><b>${esc(txTitle(t))}</b><small>${sub}${t.note&&t.note!=='Recurring'&&t.note!=='Imported'?' · '+esc(t.note):''}${t.billId?` · ${icon('repeat',12,2)}`:''}</small></div><div class="end">${txAmount(t)}</div></div>`;}
const emptyBox=(e,t,sub,b)=>`<div class="empty"><div class="e">${gl(e,34)}</div><b>${t}</b>${sub||''}${b?`<div style="margin-top:14px">${b}</div>`:''}</div>`;
const delta=(cur,prev,invert)=>{if(!prev)return'';const d=(cur-prev)/Math.abs(prev);const up=d>=0;const good=invert?!up:up;return`<span class="pill ${good?'good':'bad'}">${icon(up?'arrowup':'arrowdown',12,2.6)}${Math.abs(Math.round(d*100))}%</span>`;};
const GRAD={checking:'linear-gradient(145deg,#2f9bff,#5E5CE6)',savings:'linear-gradient(145deg,#34d27b,#0fb5a8)',cash:'linear-gradient(145deg,#ffb340,#ff7a1a)',credit:'linear-gradient(145deg,#4a4a62,#171722)',investment:'linear-gradient(145deg,#c46bff,#ff4d78)',loan:'linear-gradient(145deg,#ff5a4f,#9b1c14)'};

/* ---- money rings ---- */
function moneyRings(){
  const t=today(),p=periodFor(t),st=stats(p.start,p.end);
  const bud=S.categories.filter(c=>c.type==='expense'&&c.budget>0);const tb=sum(bud,c=>budgetFor(c).available),ts=sum(bud,c=>st.byCat[c.id]||0);
  const gp=S.goals.length?sum(S.goals,g=>clamp(g.saved/g.target,0,1))/S.goals.length:0;
  return[
   {p:st.inc>0?clamp(st.rate/0.2,0,1):0,color:'#30D158',name:'Saved',val:st.inc>0?`${pct(st.rate)} of income`:'No income yet',sub:'Goal: 20%'},
   {p:tb>0?clamp(1-ts/tb,0,1):0,color:'#0A7F66',name:'Budget left',val:tb>0?`${money(Math.max(0,tb-ts))} left`:'No budgets set',sub:tb>0?`of ${money(tb)}`:'Set one in Budgets'},
   {p:gp,color:'#FF375F',name:'Goals',val:S.goals.length?`${pct(gp)} on average`:'No goals yet',sub:S.goals.length?`${S.goals.length} active`:'Create your first'}
  ];
}
function startSteps(){
  return[
   {t:'Add your accounts',d:'Bank, cash, cards — anything you own or owe',done:S.accounts.some(a=>a.type!=='cash')||S.accounts.length>1,act:'addacc'},
   {t:'Record a transaction',d:'Try Smart entry: “lunch 12 at subway”',done:S.transactions.length>=3,act:'add'},
   {t:'Set a budget',d:'Penny can suggest limits from your history',go:'budgets',done:S.categories.some(c=>c.budget>0)},
   {t:'Create a savings goal',d:'Give your money a purpose',done:S.goals.length>0,act:'addgoal'},
   {t:'Add recurring bills & income',d:'Unlocks the cash-flow forecast',done:S.bills.length>0,act:'addbill'}
  ];
}

/* ================= DASHBOARD ================= */
const DW={
 networth(){const T=totals(),ser=netWorthSeries(30),ch30=T.net-ser[0].y,R=moneyRings();
  return`<div class="card glass hero span2"><div class="nw-split"><div>
    <div class="muted" style="font-size:16px">${greetText()}</div>${S.settings.why?`<div class="why">${icon('star',13,2.4)} ${esc(S.settings.why)}</div>`:''}
    <div class="faint sm" style="margin-top:16px;font-weight:500">NET WORTH</div>
    <div class="big" style="font-size:54px;margin-top:2px">${amt(T.net)}</div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><span class="pill ${ch30>=0?'good':'bad'}">${icon(ch30>=0?'arrowup':'arrowdown',12,2.6)}${money(Math.abs(ch30))} in 30 days</span><span class="pill">Assets ${amt(T.assets)}</span>${T.liabs<0?`<span class="pill">Owed ${amt(-T.liabs)}</span>`:''}</div>
    <div class="chart" id="nwc" style="margin-top:12px"></div></div>
    <div class="stat-ring"><div>${activityRings(R,172)}</div><div class="legend">${R.map(r=>`<div><i style="background:${r.color};margin-top:5px"></i><span><small>${r.name}</small><b class="amt">${r.val}</b><small>${r.sub}</small></span></div>`).join('')}</div></div>
  </div></div>`;},
 kpis(){const t=today(),p=periodFor(t),q=periodFor(t,-1),a=stats(p.start,p.end),b=stats(q.start,q.end);
  const k=(l,v,d,c)=>`<div class="card glass kpi"><small>${l}</small><div class="mid ${c||''}">${amt(v)}</div><div style="margin-top:10px;min-height:26px">${d}</div></div>`;
  return`<div class="span2 grid g4">${k('Income',a.inc,delta(a.inc,b.inc),'good')}${k('Spending',a.exp,delta(a.exp,b.exp,true))}${k('Saved',a.net,delta(a.net,b.net),a.net<0?'bad':'')}<div class="card glass kpi"><small>Savings rate${whyBtn('savings')}</small><div class="mid">${pct(a.rate)}</div><div class="bar ${a.rate>=.2?'good':''}" style="margin-top:18px"><i style="width:${clamp(a.rate/0.3,0,1)*100}%"></i></div></div></div>`;},
 safe(){const s=safeToSpend();
  return`<div class="card glass">${ch('bolt','var(--orange)','Safe to spend today',`${s.left} days left`+whyBtn('safe'))}<div class="row"><div class="auto">${ring(s.perDay+s.spentToday>0?s.spentToday/(s.perDay+s.spentToday):0,112,12,s.spentToday>s.perDay?'var(--red)':'var(--orange)',`<div class="faint" style="font-size:12px">spent</div><b class="amt">${money(s.spentToday)}</b>`)}</div><div><div class="big">${amt(s.perDay)}</div><div class="muted sm" style="margin-top:8px">left for today after upcoming bills${s.bills?` (${amt(s.bills)})`:''}, spread across the rest of the period.</div></div></div></div>`;},
 health(){const h=healthScore();
  return`<div class="card glass">${ch('shield','var(--green)','Financial health',h.label+whyBtn('health'))}<div class="row"><div class="auto">${ring(h.total/100,112,12,h.color,`<b style="font-size:30px;letter-spacing:-1px">${h.total}</b>`)}</div><div>${h.parts.map(p=>`<div class="mini-part" style="margin-bottom:9px"><div class="t" style="margin-bottom:4px"><span>${p.n}</span><span>${Math.round(p.v)}/${p.max}</span></div><div class="bar" style="height:5px"><i style="width:${p.v/p.max*100}%"></i></div></div>`).join('')}</div></div></div>`;},
 cashflow(){const f=forecast(60);
  return`<div class="card glass span2">${ch('sparkles','var(--indigo)','Cash-flow forecast · 60 days',(f.min.y<0?`<span class="bad">Dips to ${money(f.min.y)} on ${dshort(f.min.x)}</span>`:`Lowest ${money(f.min.y)} on ${dshort(f.min.x)}`)+whyBtn('forecast'))}<div class="chart" id="fc"></div><div class="hint">${trh('fc.hint',{daily:money(f.daily),low:money(f.minLow.y),conf:tr('why.conf.'+f.confidence)})}${f.excluded.length?' '+trh('fc.excl',{count:f.excluded.length}):''}</div></div>`;},
 categories(){const p=periodFor(today()),st=stats(p.start,p.end);const arr=Object.entries(st.byCat).sort((a,b)=>b[1]-a[1]);
  if(!arr.length)return`<div class="card glass">${ch('coins','var(--teal)','Where it went',p.label)}${emptyBox('🍩','No spending yet','<div>Your breakdown appears here.</div>')}</div>`;
  const top=arr.slice(0,6),rest=sum(arr.slice(6),x=>x[1]);const sl=top.map(([id,v])=>({label:cat(id).name,value:v,color:cat(id).color}));if(rest>0)sl.push({label:'Other',value:rest,color:'#8E8E93'});
  return`<div class="card glass">${ch('coins','var(--teal)','Where it went',p.label)}<div class="row"><div class="auto chart" id="dn"></div><div class="legend">${sl.map(s=>`<div><i style="background:${s.color}"></i>${esc(s.label)}<b class="amt">${money(s.value)}</b></div>`).join('')}</div></div></div>`;},
 budgets(){const p=periodFor(today()),st=stats(p.start,p.end);const list=S.categories.filter(c=>c.type==='expense'&&c.budget>0).map(c=>({c,s:st.byCat[c.id]||0,B:budgetFor(c).available})).sort((a,b)=>b.s/b.B-a.s/a.B).slice(0,5);
  return`<div class="card glass">${ch('target','var(--orange)','Budgets',more('budgets'))}${list.length?list.map(({c,s,B})=>{const r=s/B;return`<div style="margin-bottom:15px"><div class="row" style="margin-bottom:7px"><span><span class="lic">${gl(c.emoji,16)}</span>${esc(c.name)}</span><span class="muted amt sm" style="text-align:right">${money(s)} / ${money(B)}</span></div><div class="bar ${r>1?'bad':r>.85?'warn':'good'}"><i style="width:${clamp(r,0,1)*100}%"></i></div></div>`}).join(''):emptyBox('🎯','No budgets yet','<div>Give every category a monthly limit.</div>',`<button class="btn tint sm" data-go="budgets">Set up budgets</button>`)}</div>`;},
 goals(){return`<div class="card glass">${ch('star','var(--pink)','Goals',more('goals'))}${S.goals.length?S.goals.slice(0,4).map(g=>{const r=g.saved/g.target;return`<div style="margin-bottom:15px"><div class="row" style="margin-bottom:7px"><span><span class="lic">${gl(g.emoji,16)}</span>${esc(g.name)}</span><span class="muted amt sm" style="text-align:right">${money(g.saved)} / ${money(g.target)}</span></div><div class="bar"><i style="width:${clamp(r,0,1)*100}%;background:${g.color||'var(--accent)'}"></i></div></div>`}).join(''):emptyBox('🌟','Dream big','<div>Add something to save for.</div>',`<button class="btn tint sm" data-act="addgoal">Create goal</button>`)}</div>`;},
 upcoming(){const t=today(),end=addDays(t,30);const ev=[];for(const b of S.bills)for(const d of occurrences(b,t,end))ev.push({b,d});ev.sort((a,b)=>a.d<b.d?-1:1);
  return`<div class="card glass">${ch('calendar','var(--red)','Coming up','next 30 days')}${ev.length?`<div class="list-tight">${ev.slice(0,6).map(({b,d})=>`<div class="li" data-bill="${b.id}"><div class="sq" style="--c-bg:${cat(b.category).color}2e">${gl(cat(b.category).emoji)}</div><div class="grow"><b>${esc(b.name)}</b><small>${relDate(d)}</small></div><div class="end"><span class="amt ${b.type==='income'?'good':''}">${b.type==='income'?'+':'−'}${money(b.amount)}</span></div></div>`).join('')}</div>`:emptyBox('📅','Nothing scheduled','<div>Add rent, salary or subscriptions.</div>',`<button class="btn tint sm" data-act="addbill">Add recurring</button>`)}</div>`;},
 recent(){const l=[...S.transactions].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0).slice(0,6);
  return`<div class="card glass">${ch('list','var(--green)','Recent activity',more('transactions','View all'))}${l.length?`<div class="list-tight">${l.map(txRow).join('')}</div>`:emptyBox('🧾','No transactions yet','<div>Record your first one in seconds.</div>',`<button class="btn pri sm" data-act="add">Add transaction</button>`)}</div>`;},
 insights(){const l=insights().slice(0,4);return`<div class="card glass">${ch('sparkles','var(--purple)','Smart insights',more('insights','More'))}${l.map(i=>`<div class="insight ${i.tone||''}" style="padding-left:0;padding-right:0"><div class="e">${gl(i.e,20)}</div><div><b>${esc(i.title)}</b><span>${esc(i.text)}</span></div></div>`).join('')||emptyBox('✨','Nothing to report yet')}</div>`;},
 heatmap(){const p=periodFor(today());return`<div class="card glass">${ch('calendar','var(--blue)','Spending heatmap',p.label)}${heatmap()}</div>`;}
};
function startCard(){
  if(S.settings.startDismissed)return'';const st=startSteps(),done=st.filter(s=>s.done).length;if(done===st.length)return'';
  return`<div class="card glass span2">${ch('flag','var(--blue)','Get started',`${done} of ${st.length} · <a id="dismiss-start">Dismiss</a>`)}<div class="bar" style="margin:-4px 0 8px"><i style="width:${done/st.length*100}%"></i></div>${st.map(s=>`<div class="step ${s.done?'done':''}" ${s.go?`data-go="${s.go}"`:`data-act="${s.act}"`} style="margin:0 -16px"><div class="dot">${icon('check',14,3.2)}</div><div class="grow" style="flex:1"><b style="display:block;font-weight:550">${s.t}</b><small class="muted">${s.d}</small></div>${icon('chevron',16)}</div>`).join('')}</div>`;
}
PAGES.dashboard={title:'Overview',
 render(){const d=FMT.dateFull(new Date());
  return`<div class="page wrap">${lt('Overview',d)}<div class="grid g2">${startCard()}${S.settings.widgets.filter(w=>w.on).map(w=>DW[w.id]()).join('')||emptyBox('🧩','All widgets are hidden','Turn them back on in Settings → Dashboard.')}</div></div>`;},
 after(v){
  const nw=$('#nwc',v);if(nw)drawArea(nw,netWorthSeries(30),{h:120});
  const fc=$('#fc',v);if(fc){const f=forecast(60);drawArea(fc,f.pts,{h:210,color:'var(--teal)',markMin:true,min:f.min,zero:true,band:{lo:f.lo,hi:f.hi}});}
  const dn=$('#dn',v);if(dn){const p=periodFor(today()),st=stats(p.start,p.end);const arr=Object.entries(st.byCat).sort((a,b)=>b[1]-a[1]);const sl=arr.slice(0,6).map(([id,v])=>({label:cat(id).name,value:v,color:cat(id).color}));const rest=sum(arr.slice(6),x=>x[1]);if(rest>0)sl.push({label:'Other',value:rest,color:'#8E8E93'});drawDonut(dn,sl,{size:172,label:'Spent'});}
  const ds=$('#dismiss-start',v);if(ds)ds.onclick=e=>{e.stopPropagation();S.settings.startDismissed=true;changed();};
 }};

/* ================= TRANSACTIONS ================= */
/* Filters: search text (words and >N / <N), type, account, category, period or custom dates, amount range, payee, sort.
   Select mode: pick rows (or everything the filters currently match) and change category / account / date / payee / note
   or delete them in one go. Bulk changes save a safety backup first and can be undone. */
const F_DEFAULT={q:'',type:'all',acc:'all',cat:'all',range:'period',from:'',to:'',min:'',max:'',payee:'',sort:'date-desc',limit:150};
const F={...F_DEFAULT};
const SEL={on:false,ids:new Set()};
const numOrNull=s=>{const n=parseFloat(String(Fmt.toAscii(s)).replace(',','.'));return Number.isFinite(n)?n:null;};
function txRange(){
  const t=today();let a='0000-00-00',b='9999-99-99';
  if(F.range==='period'){const p=periodFor(t);a=p.start;b=p.end;}
  else if(F.range==='last'){const p=periodFor(t,-1);a=p.start;b=p.end;}
  else if(F.range==='3m'){a=periodFor(t,-2).start;b=periodFor(t).end;}
  else if(F.range==='year'){a=t.slice(0,4)+'-01-01';b=t.slice(0,4)+'-12-31';}
  else if(F.range==='custom'){a=F.from||a;b=F.to||b;}
  return [a,b];
}
function filteredTx(){
  const [a,b]=txRange();
  const toks=F.q.toLowerCase().split(/\s+/).filter(Boolean);const ops=[],words=[];
  toks.forEach(k=>{const m=k.match(/^([<>])(\d+(?:\.\d+)?)$/);m?ops.push([m[1],+m[2]]):words.push(k);});
  const lo=numOrNull(F.min),hi=numOrNull(F.max),pw=F.payee.trim().toLowerCase();
  const list=S.transactions.filter(x=>x.date>=a&&x.date<=b&&(F.type==='all'||x.type===F.type)&&(F.acc==='all'||x.accountId===F.acc||x.toAccountId===F.acc)&&(F.cat==='all'||x.category===F.cat||(x.splits&&x.splits.some(sp=>sp.category===F.cat)))
    &&ops.every(([o,n])=>o==='>'?x.amount>n:x.amount<n)
    &&(lo===null||x.amount>=lo)&&(hi===null||x.amount<=hi)
    &&(!pw||String(x.merchant||'').toLowerCase().includes(pw))
    &&(!words.length||words.every(w=>`${x.merchant} ${x.note} ${cat(x.category).name} ${x.amount} ${acc(x.accountId)?.name}`.toLowerCase().includes(w))));
  const byDate=(p,q)=>p.date<q.date?1:p.date>q.date?-1:0;
  const cmp={'date-desc':byDate,'date-asc':(p,q)=>-byDate(p,q),'amount-desc':(p,q)=>q.amount-p.amount||byDate(p,q),'amount-asc':(p,q)=>p.amount-q.amount||byDate(p,q),
    'payee':(p,q)=>String(txTitle(p)).localeCompare(String(txTitle(q)),I18N.lang)||byDate(p,q)}[F.sort]||byDate;
  return list.sort(cmp);
}
const advCount=()=>['min','max','payee'].filter(k=>String(F[k]).trim()!=='').length+(F.range==='custom'?1:0)+(F.sort!=='date-desc'?1:0);
function txRowSel(t){
  const r=txRow(t);if(!SEL.on)return r;
  const on=SEL.ids.has(t.id);
  return r.replace(/^<div class="li" data-tx="([^"]+)">/,(m,id)=>`<div class="li selrow${on?' picked':''}" data-selid="${id}" role="checkbox" aria-checked="${on}" tabindex="0"><span class="chk">${on?icon('check',13,3):''}</span>`);
}
function drawTxList(v){
  const cv=conv(),l=filteredTx(),inc=sum(l.filter(x=>x.type==='income'),cv),exp=sum(l.filter(x=>x.type==='expense'),cv);
  $('#txsum',v).innerHTML=`<span class="pill">${trh('tf.count',{count:l.length})}</span><span class="pill good">+${amt(inc)}</span><span class="pill bad">−${amt(exp)}</span><span class="pill">${trh('tf.net',{amount:'@@'}).replace('<bdi>@@</bdi>',amt(inc-exp))}</span>`;
  const shown=l.slice(0,F.limit);
  if(F.sort.startsWith('date')){
    const days=[];let c=null;
    for(const t of shown){if(!c||c.d!==t.date){c={d:t.date,list:[]};days.push(c);}c.list.push(t);}
    $('#txbody',v).innerHTML=days.map(g=>{const net=sum(g.list.filter(x=>x.type==='income'),cv)-sum(g.list.filter(x=>x.type==='expense'),cv);
      const lab=[tr('rel.today'),tr('rel.yesterday')].includes(relDate(g.d))?`${relDate(g.d)} · ${dshort(g.d)}`:dlong(g.d);
      return`<div class="dayh">${esc(lab)}<span class="amt">${net>=0?'+':'−'}${money(Math.abs(net))}</span></div><div class="group">${g.list.map(txRowSel).join('')}</div>`;}).join('');
  }else $('#txbody',v).innerHTML=shown.length?`<div class="group">${shown.map(txRowSel).join('')}</div>`:'';
  if(!shown.length)$('#txbody',v).innerHTML=`<div class="group">${emptyBox('🔍',trh('tf.none'),`<div>${trh('tf.noneHint')}</div>`)}</div>`;
  const mo=$('#more',v);mo.style.display=l.length>F.limit?'':'none';mo.textContent=tr('tf.showMore',{count:Math.min(200,l.length-F.limit)});
  drawSelBar(v,l);
}
function drawSelBar(v,l){
  const bar=$('#selbar',v);bar.hidden=!SEL.on;$('#fsel',v).classList.toggle('on',SEL.on);
  if(!SEL.on)return;
  l=l||filteredTx();const ids=new Set(l.map(x=>x.id));
  for(const id of [...SEL.ids])if(!S.transactions.some(x=>x.id===id))SEL.ids.delete(id);
  const n=SEL.ids.size,inView=l.filter(x=>SEL.ids.has(x.id)).length;
  $('#selcount',v).textContent=tr('tf.selected',{count:n});
  const all=$('#sel_all',v);all.textContent=tr(inView===l.length&&l.length?'tf.allSelected':'tf.selectAll',{count:l.length});all.disabled=!l.length||inView===l.length;
  $$('[data-bulk]',v).forEach(b=>b.disabled=!n);$('#sel_none',v).disabled=!n;
}
/* ---- bulk operations ---- */
async function bulkSafe(){
  if(!hasNative)return true;
  const r=await native.snapshot('before-change');
  if(r&&r.ok===false&&r.error!=='no-data'){toast(tr('tf.noBackup'),{ms:6000});return false;}
  return true;
}
function bulkTargets(){const ids=SEL.ids;return S.transactions.filter(x=>ids.has(x.id));}
/* pure: returns {changed, skipped} after applying op to the given transactions (mutates them) */
function bulkApply(txs,op,val){
  let changed=0,skipped=0;
  for(const x of txs){
    if(op==='category'){const c=S.categories.find(c=>c.id===val);if(!c||x.type==='transfer'||(x.splits&&x.splits.length)||(c.type==='income')!==(x.type==='income')){skipped++;continue;}if(x.category===val){skipped++;continue;}x.category=val;changed++;}
    else if(op==='account'){if(x.toAccountId===val||x.accountId===val){skipped++;continue;}x.accountId=val;changed++;}
    else if(op==='date'){if(!/^\d{4}-\d\d-\d\d$/.test(val)||x.date===val){skipped++;continue;}x.date=val;changed++;}
    else if(op==='swapdm'){const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(x.date||'');if(!m||m[2]===m[3]||+m[3]>12||!validYMD(+m[1],+m[3],+m[2])){skipped++;continue;}x.date=`${m[1]}-${m[3]}-${m[2]}`;changed++;}
    else if(op==='payee'){if((x.merchant||'')===val){skipped++;continue;}x.merchant=val;changed++;}
    else if(op==='note'){if((x.note||'')===val){skipped++;continue;}x.note=val;changed++;}
  }
  return {changed,skipped};
}
async function bulkEdit(op,v){
  const sel=bulkTargets();if(!sel.length)return;
  if(op==='delete'){
    if(!await confirmBox(tr('tf.deleteConfirm',{count:sel.length}),tr('common.delete'),tr('tf.deleteTitle',{count:sel.length})))return;
    if(!await bulkSafe())return;
    const ids=new Set(sel.map(x=>x.id));
    undoable(tr('tf.deleted',{count:sel.length}),()=>{S.transactions=S.transactions.filter(x=>!ids.has(x.id));});
    SEL.ids.clear();SEL.on=false;return;
  }
  const hasInc=sel.some(x=>x.type==='income'),hasExp=sel.some(x=>x.type==='expense'),hasTrf=sel.some(x=>x.type==='transfer');
  let body='',title=tr('tf.edit.'+op);
  if(op==='category'){
    const cs=S.categories.filter(c=>(c.type==='income'?hasInc:hasExp));
    body=`<div class="fg"><div class="fr"><label>${trh('tx.category')}</label><select id="bv">${cs.map(c=>opt(c.id,c.name,false)).join('')}</select></div></div>`+(hasTrf?`<div class="muted sm" style="padding:6px 4px">${trh('tf.trfSkipped')}</div>`:'');
  }else if(op==='account')body=`<div class="fg"><div class="fr"><label>${trh('tx.account')}</label><select id="bv">${accOpts('')}</select></div></div>`;
  else if(op==='date')body=`<div class="fg"><div class="fr"><label>${trh('common.date')}</label><input id="bv" type="date" value="${today()}"></div></div>`;
  else if(op==='payee')body=`<div class="fg"><div class="fr"><label>${trh('tx.payee')}</label><input id="bv" type="text" list="ml2" placeholder="${trh('tx.payeeExample')}"><datalist id="ml2">${[...new Set(S.transactions.map(x=>x.merchant).filter(Boolean))].slice(0,300).map(m=>`<option value="${esc(m)}">`).join('')}</datalist></div></div>`;
  else if(op==='swapdm')body=`<div class="muted" style="padding:4px 6px">${trh('tf.swapdmHelp')}</div>`;
  else if(op==='note')body=`<div class="fg"><div class="fr"><label>${trh('tx.note')}</label><input id="bv" type="text" placeholder="${trh('tf.noteBlank')}"></div></div>`;
  openSheet({title,ok:tr('tf.apply',{count:sel.length}),body:`<div class="muted sm" style="padding:0 4px 10px">${trh('tf.willChange',{count:sel.length})}</div>`+body,
    async onOk(s){
      const val=op==='swapdm'?'':op==='payee'||op==='note'?$('#bv',s).value.trim():$('#bv',s).value;
      if(op==='payee'&&!val){toast(tr('tf.err.payee'));return;}
      if(op==='date'&&!val){toast(tr('tf.err.date'));return;}
      closeModal();
      if(!await bulkSafe())return;
      let res;
      undoable(tr('tf.done',{count:sel.length}),()=>{res=bulkApply(bulkTargets(),op,val);});
      if(res&&res.skipped)toast(tr('tf.skipped',{count:res.skipped}),{ms:5000});
      else if(op==='category'||op==='payee'){const names=[...new Set(sel.map(x=>RulesEngine.normPayee(op==='payee'?val:x.merchant)))];const tp=sel.every(x=>x.type===sel[0].type)?sel[0].type:'';
        const m=op==='payee'?val:sel[0].merchant,c=op==='category'?val:(sel.every(x=>x.category===sel[0].category)?sel[0].category:'');
        if(names.length===1&&names[0]&&c&&tp){const off=offerRule(m,c,tp);if(off)setTimeout(()=>toast(tr('rules.offer',{payee:m,category:(cat(c)||{}).name||''}),off),400);}}
      SEL.ids.clear();SEL.on=false;refresh();
    }});
}
PAGES.transactions={title:'Transactions',
 render(){
  const adv=advCount();
  return`<div class="page wrap">${lt(trh('nav.transactions'),trh('tf.sub'),btn('check',trh('tf.select'),'id="fsel"')+btn('down',trh('tf.export'),'id="ex"')+btn('up',trh('tf.import'),'id="im"')+btn('plus',trh('shell.new'),'data-act="add"','pri'))}
  <div class="toolbar txbar"><div class="searchfield">${icon('search')}<input id="fq" placeholder="${trh('tf.search')}" value="${esc(F.q)}"></div>
  <div class="seg" id="ft">${['all','expense','income','transfer'].map(k=>`<button data-t="${k}" class="${F.type===k?'on':''}">${trh('tf.type.'+k)}</button>`).join('')}</div>
  <select id="fr" class="pillsel" aria-label="${trh('tf.period')}">${['period','last','3m','year','all','custom'].map(k=>opt(k,tr('tf.range.'+k),F.range===k)).join('')}</select>
  <select id="fa" class="pillsel" aria-label="${trh('tx.account')}">${opt('all',tr('tf.allAccounts'),F.acc==='all')}${accOpts(F.acc)}</select>
  <select id="fc" class="pillsel" aria-label="${trh('tx.category')}">${opt('all',tr('tf.allCategories'),F.cat==='all')}${S.categories.map(c=>opt(c.id,c.name,F.cat===c.id)).join('')}</select>
  <button class="btn pillbtn ${adv?'on':''}" id="fmore" aria-expanded="${adv?'true':'false'}">${icon('sliders',15)}${trh('tf.moreFilters')}${adv?`<span class="cnt">${adv}</span>`:''}</button></div>
  <div class="advbox group" id="fadv" ${adv||F.range==='custom'?'':'hidden'}>
   <div class="advgrid">
    <label class="adv"><span>${trh('tf.min')}</span><input id="f_min" type="number" inputmode="decimal" min="0" step="any" value="${esc(F.min)}" placeholder="0"></label>
    <label class="adv"><span>${trh('tf.max')}</span><input id="f_max" type="number" inputmode="decimal" min="0" step="any" value="${esc(F.max)}" placeholder="∞"></label>
    <label class="adv wide"><span>${trh('tf.payee')}</span><input id="f_payee" type="text" list="f_pl" autocomplete="off" value="${esc(F.payee)}" placeholder="${trh('tf.payeePh')}"><datalist id="f_pl">${[...new Set(S.transactions.map(x=>x.merchant).filter(Boolean))].sort((a,b)=>a.localeCompare(b,I18N.lang)).slice(0,400).map(m=>`<option value="${esc(m)}">`).join('')}</datalist></label>
    <label class="adv" id="f_fromw" ${F.range==='custom'?'':'hidden'}><span>${trh('tf.from')}</span><input id="f_from" type="date" value="${esc(F.from)}"></label>
    <label class="adv" id="f_tow" ${F.range==='custom'?'':'hidden'}><span>${trh('tf.to')}</span><input id="f_to" type="date" value="${esc(F.to)}"></label>
    <label class="adv"><span>${trh('tf.sort')}</span><select id="f_sort">${['date-desc','date-asc','amount-desc','amount-asc','payee'].map(k=>opt(k,tr('tf.sort.'+k),F.sort===k)).join('')}</select></label>
   </div>
   <div class="advact"><button class="btn sm" id="f_reset">${trh('tf.reset')}</button></div>
  </div>
  <div class="cleanbar" id="cleanbar" hidden><span id="cleantxt"></span><button class="btn sm pri" id="cleango">${trh('rules.review')}</button></div>
  <div id="txsum" class="txsum"></div><div id="txbody"></div><div style="text-align:center;padding:18px"><button class="btn" id="more"></button></div>
  <div class="selbar glass" id="selbar" hidden><div class="selinfo"><b id="selcount"></b><button class="btn sm" id="sel_all"></button><button class="btn sm" id="sel_none">${trh('tf.clear')}</button></div>
   <div class="selacts">${['category','account','date','swapdm','payee','note'].map(k=>`<button class="btn sm" data-bulk="${k}">${trh('tf.bulk.'+k)}</button>`).join('')}<button class="btn sm danger" data-bulk="delete">${trh('common.delete')}</button><button class="btn sm pri" id="sel_done">${trh('tf.done.btn')}</button></div></div></div>`;},
 after(v){
  const redraw=()=>{F.limit=150;drawTxList(v);syncMore();};
  const syncMore=()=>{const n=advCount(),b=$('#fmore',v);b.classList.toggle('on',n>0);const c=b.querySelector('.cnt');if(n){if(c)c.textContent=n;else b.insertAdjacentHTML('beforeend',`<span class="cnt">${n}</span>`);}else if(c)c.remove();};
  drawTxList(v);
  try{const nc=RulesEngine.groupUncategorized(S.transactions,S.categories,suggestCtx()).length;if(nc){$('#cleantxt',v).textContent=tr('tf.cleanBanner',{count:nc});$('#cleanbar',v).hidden=false;$('#cleango',v).onclick=openCleanup;}}catch(e){logErr('clean-up banner',e);}
  $('#fq',v).oninput=e=>{F.q=e.target.value;redraw();};
  $('#fr',v).onchange=e=>{F.range=e.target.value;const c=F.range==='custom';$('#f_fromw',v).hidden=!c;$('#f_tow',v).hidden=!c;if(c)$('#fadv',v).hidden=false;redraw();};
  $('#fa',v).onchange=e=>{F.acc=e.target.value;redraw();};
  $('#fc',v).onchange=e=>{F.cat=e.target.value;redraw();};
  $('#ft',v).onclick=e=>{if(!e.target.dataset.t)return;F.type=e.target.dataset.t;$$('#ft button',v).forEach(b=>b.classList.toggle('on',b===e.target));redraw();};
  $('#fmore',v).onclick=()=>{const b=$('#fadv',v);b.hidden=!b.hidden;$('#fmore',v).setAttribute('aria-expanded',String(!b.hidden));};
  [['f_min','min'],['f_max','max'],['f_payee','payee'],['f_from','from'],['f_to','to']].forEach(([id,k])=>{$('#'+id,v).oninput=e=>{F[k]=e.target.value;redraw();};});
  $('#f_sort',v).onchange=e=>{F.sort=e.target.value;redraw();};
  $('#f_reset',v).onclick=()=>{Object.assign(F,{...F_DEFAULT});render();};
  $('#more',v).onclick=()=>{F.limit+=200;drawTxList(v);};
  $('#ex',v).onclick=()=>exportCSV(filteredTx());$('#im',v).onclick=importCSV;
  /* select mode */
  const toggleSel=id=>{SEL.ids.has(id)?SEL.ids.delete(id):SEL.ids.add(id);};
  $('#fsel',v).onclick=()=>{SEL.on=!SEL.on;if(!SEL.on)SEL.ids.clear();drawTxList(v);};
  $('#sel_done',v).onclick=()=>{SEL.on=false;SEL.ids.clear();drawTxList(v);};
  $('#sel_none',v).onclick=()=>{SEL.ids.clear();drawTxList(v);};
  $('#sel_all',v).onclick=()=>{filteredTx().forEach(x=>SEL.ids.add(x.id));drawTxList(v);};
  $('#txbody',v).addEventListener('click',e=>{const r=e.target.closest('[data-selid]');if(!r)return;e.stopPropagation();toggleSel(r.dataset.selid);drawTxList(v);},true);
  $('#txbody',v).addEventListener('keydown',e=>{if(e.key!==' '&&e.key!=='Enter')return;const r=e.target.closest('[data-selid]');if(!r)return;e.preventDefault();toggleSel(r.dataset.selid);drawTxList(v);const again=$(`[data-selid="${r.dataset.selid}"]`,v);again&&again.focus();});
  $$('[data-bulk]',v).forEach(b=>b.onclick=()=>bulkEdit(b.dataset.bulk,v));
 }};

/* ================= ACCOUNTS ================= */
PAGES.accounts={title:'Accounts',
 render(){const T=totals(),bs=balances();
  return`<div class="page wrap">${lt('Accounts','Everything you own and owe, in one place',btn('plus','Add Account','data-act="addacc"','pri'))}${fxWarn()}
  <div class="acct-hero" style="margin-bottom:18px"><div class="card glass hero">${ch('coins','var(--blue)','Net worth','6 months'+whyBtn('networth'))}<div class="big" style="font-size:42px;margin-bottom:8px">${amt(T.net)}</div><div class="chart" id="nwl"></div></div>
  <div class="card glass">${ch('db','var(--indigo)','Balance sheet')}<div class="kv"><span>Assets</span><b>${amt(T.assets)}</b></div><div class="kv"><span>Liabilities</span><b class="${T.liabs<0?'bad':''}">${amt(T.liabs)}</b></div><div class="kv" style="border-top:.5px solid var(--line-2);margin-top:6px;padding-top:14px"><span>Net worth</span><b style="font-size:20px">${amt(T.net)}</b></div><div class="kv"><span>Cash on hand</span><b>${amt(T.liquid)}</b></div>
  ${T.assets>0?`<div class="bar ${(-T.liabs/T.assets)>.5?'bad':'good'}" style="margin-top:10px"><i style="width:${clamp(-T.liabs/T.assets,0,1)*100}%"></i></div><div class="hint">Debt is ${pct(-T.liabs/T.assets)} of your assets</div>`:''}</div></div>
  <div class="grid g3">${bs.map(({a,b})=>`<div class="wcard" data-acc="${a.id}" style="--grad:${GRAD[a.type]}"><div class="top"><div><div class="nm">${esc(a.name)}</div><div class="tp">${ACC_TYPES[a.type].n}</div></div><div class="em">${gl(ACC_TYPES[a.type].e,26)}</div></div><div class="bal amt">${accMoney(b,a)}</div><div class="sp">${spark(accountSeries(a,30),110,34,'#fff')}</div></div>`).join('')}<div class="wcard add" data-act="addacc">${icon('plus',22,2.2)}Add account</div></div>${accountsExtra()}</div>`;},
 after(v){const c=$('#nwl',v);if(c)drawArea(c,netWorthSeries(180),{h:200});bindAccountsExtra(v);}};

/* ================= BUDGETS ================= */
let budOff=0;
PAGES.budgets={title:'Budgets',
 render(){const t=today(),p=periodFor(t,budOff),st=stats(p.start,p.end);
  const elapsed=budOff<0?1:budOff>0?0:clamp((diffDays(p.start,t)+1)/p.days,0,1);
  const cats=S.categories.filter(c=>c.type==='expense'),bud=cats.filter(c=>c.budget>0);
  const tb=sum(bud,c=>budgetFor(c,budOff).available),ts=sum(bud,c=>st.byCat[c.id]||0);
  const proj=budOff===0&&elapsed>.12?ts/elapsed:ts;
  const card=c=>{const bv=budgetFor(c,budOff),B=bv.available,s=st.byCat[c.id]||0,r=s/B,left=B-s;
    return`<div class="card glass acard" data-bud="${c.id}"><div class="row" style="margin-bottom:14px"><div class="sq auto" style="--c-bg:${c.color}30">${gl(c.emoji)}</div><div><b style="font-weight:600">${esc(c.name)}</b><div class="sm ${s>B?'bad':r>elapsed+.12?'warn':'muted'}">${s>B?'Over budget':r>elapsed+.12&&budOff===0?'Ahead of pace':'On track'}</div></div><div class="auto"><span class="pill ${r>1?'bad':r>.85?'warn':'good'}">${pct(r)}</span></div></div><div class="barw"><div class="bar ${r>1?'bad':r>.85?'warn':'good'}"><i style="width:${clamp(r,0,1)*100}%"></i></div>${budOff===0?`<div class="pace" style="left:${elapsed*100}%" title="An even pace would be here"></div>`:''}</div><div class="row" style="margin-top:12px"><span class="muted amt sm">${money(s)} of ${money(B)}</span><span class="amt ${left<0?'bad':'good'}" style="text-align:right;font-weight:600">${left<0?money(-left)+' over':money(left)+' left'}</span></div>${bv.carry?`<div class="faint sm" style="margin-top:6px">${trh(bv.carry>0?'bud.carryPos':'bud.carryNeg',{amount:money(Math.abs(bv.carry)),base:money(bv.base)})}</div>`:''}</div>`;};
  return`<div class="page wrap">${lt('Budgets',`${p.label}${budOff===0?` · day ${Math.min(p.days,diffDays(p.start,t)+1)} of ${p.days}`:''}`,`<div class="stepper"><button class="icon-btn" data-bo="-1" aria-label="Previous period">${icon('chevleft')}</button><b>${esc(p.label)}</b><button class="icon-btn" data-bo="1" aria-label="Next period" ${budOff>=0?'disabled style="opacity:.3"':''}>${icon('chevron')}</button></div>`+btn('wand','Auto-suggest','data-act="autobud"')+btn('plus','Category','data-act="addcat"','pri'))}
  <div class="card glass hero" style="margin-bottom:18px"><div class="row"><div><div class="faint sm" style="font-weight:500">TOTAL BUDGETED</div><div class="big" style="margin-top:2px">${amt(tb)}</div><div class="muted" style="margin-top:8px">${amt(ts)} spent · <span class="${tb-ts<0?'bad':'good'}">${tb-ts<0?amt(ts-tb)+' over':amt(tb-ts)+' remaining'}</span></div></div><div style="flex:1.6"><div class="barw"><div class="bar ${ts>tb?'bad':ts>tb*.85?'warn':'good'}" style="height:14px"><i style="width:${tb?clamp(ts/tb,0,1)*100:0}%"></i></div>${budOff===0?`<div class="pace" style="left:${elapsed*100}%"></div>`:''}</div>
   <div class="hint">${budOff===0&&tb>0&&elapsed>.12?`At this pace you'll spend about <b style="color:var(--text)">${money(proj)}</b> this period — ${proj>tb?`<span class="bad">${money(proj-tb)} over budget</span>`:`<span class="good">${money(tb-proj)} under budget</span>`}.`:'The marker shows where an even pace would put you today.'}</div></div></div></div>
  ${bud.length?`<div class="grid g3">${[...bud].sort((a,b)=>(st.byCat[b.id]||0)/budgetFor(b,budOff).available-(st.byCat[a.id]||0)/budgetFor(a,budOff).available).map(card).join('')}</div>`:`<div class="group">${emptyBox('🎯','No budgets yet','<div>Tap a category below, or let Penny suggest limits from your history.</div>',btn('wand','Auto-suggest budgets','data-act="autobud"','pri'))}</div>`}
  <div class="sec-h">${bud.length?'Not budgeted':'Choose a category'}</div>
  <div class="group">${cats.filter(c=>!c.budget).map(c=>`<div class="li" data-bud="${c.id}" style="cursor:pointer"><div class="sq" style="--c-bg:${c.color}30">${gl(c.emoji)}</div><div class="grow"><b>${esc(c.name)}</b><small class="amt">${money(st.byCat[c.id]||0)} spent</small></div><span class="link">Set budget</span>${icon('chevron',16)}</div>`).join('')||'<div class="empty">Every category has a budget</div>'}</div></div>`;}};

/* ================= GOALS ================= */
PAGES.goals={title:'Goals',
 render(){const lp=periodFor(today(),-1),surplus=Math.max(0,stats(lp.start,lp.end).net);
  return`<div class="page wrap">${lt('Goals','Turn “someday” into a date',btn('plus','New Goal','data-act="addgoal"','pri'))}
  ${S.goals.length?`<div class="grid g3">${S.goals.map(g=>{const r=g.saved/g.target,need=g.deadline?goalNeeded(g):0,left=g.deadline?diffDays(today(),g.deadline):null;
   const eta=!g.deadline&&surplus>0?addMonths(today(),Math.ceil((g.target-g.saved)/surplus)):null;
   return`<div class="card glass gcard" data-goal="${g.id}"><div style="display:flex;justify-content:center;margin-bottom:14px">${ring(r,140,14,g.color,`<div class="gem">${gl(g.emoji,30)}</div><b style="font-size:15px">${pct(r)}</b>`)}</div><b style="font-size:18px;font-weight:650">${esc(g.name)}</b><div class="muted amt" style="margin:4px 0 12px">${money(g.saved)} of ${money(g.target)}</div>
   ${g.saved>=g.target?`<span class="pill good">${icon('check',12,2.8)}Reached</span>`:g.deadline?`<div class="muted sm">${left<0?'<span class="bad">Past due</span>':`${left} days left`} · set aside <b class="amt" style="color:var(--text)">${money(need)}</b>/mo</div>`:eta?`<div class="muted sm">At last period's surplus: ~${dshort(eta)}</div>`:'<div class="muted sm">No deadline set</div>'}
   <div style="margin-top:16px;display:flex;gap:8px;justify-content:center"><button class="btn sm pri" data-fund="${g.id}">Add / withdraw</button><button class="btn sm" data-goal="${g.id}">Edit</button></div></div>`;}).join('')}</div>`:`<div class="group">${emptyBox('🌟','No goals yet','<div>What are you saving for?</div>',btn('plus','Create your first goal','data-act="addgoal"','pri'))}</div>`}</div>`;}};

/* ================= RECURRING ================= */
PAGES.bills={title:'Recurring',
 render(){const t=today();const exp=S.bills.filter(b=>b.type==='expense'),inc=S.bills.filter(b=>b.type==='income');
  const subs=exp.filter(b=>cat(b.category).name==='Subscriptions');const due=S.bills.filter(b=>b.next<=t&&!b.auto);const rs=recurringSuggestHtml();
  const row=b=>`<div class="li" data-bill="${b.id}"><div class="sq" style="--c-bg:${cat(b.category).color}30">${gl(cat(b.category).emoji)}</div><div class="grow"><b>${esc(b.name)}</b><small>${FREQ[b.freq]} · next ${relDate(b.next)} · ${esc(acc(b.accountId)?.name||'')}${b.auto?'':' · manual'}</small></div><div class="end"><span class="amt ${b.type==='income'?'good':''}">${b.type==='income'?'+':'−'}${money(b.amount)}</span><small class="amt">${money(monthlyEq(b))}/mo</small></div></div>`;
  return`<div class="page wrap">${lt('Recurring','Bills, subscriptions and regular income — the backbone of your forecast',btn('plus','Add Recurring','data-act="addbill"','pri'))}
  <div class="grid g4" style="margin-bottom:18px"><div class="card glass kpi"><small>Monthly bills</small><div class="mid">${amt(sum(exp,monthlyEq))}</div></div><div class="card glass kpi"><small>Monthly income</small><div class="mid good">${amt(sum(inc,monthlyEq))}</div></div><div class="card glass kpi"><small>Subscriptions / year</small><div class="mid">${amt(sum(subs,monthlyEq)*12)}</div></div><div class="card glass kpi"><small>Fixed costs vs income</small><div class="mid">${sum(inc,monthlyEq)?pct(sum(exp,monthlyEq)/sum(inc,monthlyEq)):'—'}</div></div></div>
  ${due.length?`<div class="sec-h" style="margin-top:6px">Needs your confirmation</div><div class="group">${due.map(b=>`<div class="sugg"><div class="grow"><b>${esc(b.name)}</b> <span class="muted">· due ${relDate(b.next)}</span></div><b class="amt">${money(b.amount)}</b><button class="btn sm pri" data-pay="${b.id}">Mark done</button></div>`).join('')}</div>`:''}
  ${rs.html}
  <div class="sec-h">All recurring</div>${S.bills.length?`<div class="group">${[...S.bills].sort((a,b)=>a.next<b.next?-1:1).map(row).join('')}</div>`:`<div class="group">${emptyBox('🔁','Nothing recurring yet','<div>Add rent, salary, Netflix… Penny will forecast around them.</div>',btn('plus','Add recurring item','data-act="addbill"','pri'))}</div>`}</div>`;}};

/* ================= INSIGHTS ================= */
PAGES.insights={title:'Insights',
 render(){const h=healthScore(),ins=insights();const cats=S.categories.filter(c=>c.type==='expense'),avg=lastMonthsAvgByCat(3);
  const simCats=cats.filter(c=>avg[c.id]>0).sort((a,b)=>avg[b.id]-avg[a.id]);
  return`<div class="page wrap">${lt('Insights','What Penny noticed about your money')}
  <div class="grid g-main"><div><div class="sec-h" style="margin-top:0">What I noticed</div><div class="group">${ins.map(i=>`<div class="insight ${i.tone||''}"><div class="e">${gl(i.e,20)}</div><div><b>${esc(i.title)}</b><span>${esc(i.text)}</span></div></div>`).join('')}</div></div>
  <div><div class="sec-h" style="margin-top:0">Financial health</div><div class="card glass"><div style="display:flex;justify-content:center;margin-bottom:16px">${ring(h.total/100,156,15,h.color,`<b style="font-size:42px;letter-spacing:-1.5px">${h.total}</b><div class="faint">${h.label}</div>`)}</div>${h.parts.map(p=>`<div class="mini-part"><div class="t"><span>${p.n}</span><span>${Math.round(p.v)}/${p.max}</span></div><div class="bar" style="height:6px"><i style="width:${p.v/p.max*100}%"></i></div><div class="hint" style="margin-top:4px">${esc(p.d)}</div></div>`).join('')}</div></div></div>
  <div class="grid g2" style="margin-top:6px"><div><div class="sec-h">What-if simulator</div><div class="card glass">${simCats.length?`<label class="f">If I spent less on</label><select id="sc">${simCats.map(c=>opt(c.id,`${c.name} · avg ${money(avg[c.id])}/mo`)).join('')}</select><label class="f" style="margin-top:18px">by <b id="sp" style="color:var(--text)">20%</b></label><input id="sl" type="range" min="0" max="100" value="20"><div class="grid g3" style="margin-top:22px;text-align:center"><div><div class="faint sm">Per month</div><div class="sim-out good" id="s1"></div></div><div><div class="faint sm">Per year</div><div class="sim-out good" id="s2"></div></div><div><div class="faint sm">Invested 10y @7%</div><div class="sim-out" id="s3" style="color:var(--accent)"></div></div></div>`:emptyBox('🧪','Nothing to simulate yet','<div>Add a few transactions first.</div>')}</div></div>
  <div><div class="sec-h">Income vs spending</div><div class="card glass"><div class="chart" id="bars"></div><div class="legend h" style="margin-top:10px"><div><i style="background:var(--green)"></i>Income</div><div><i style="background:var(--accent)"></i>Spending</div></div></div></div></div>
  <div class="grid g2"><div><div class="sec-h">60-day forecast${whyBtn('forecast')}</div><div class="card glass"><div class="chart" id="fc2"></div><div class="hint">${(()=>{const f=forecast(60);return trh('fc.hint',{daily:money(f.daily),low:money(f.minLow.y),conf:tr('why.conf.'+f.confidence)})+(f.excluded.length?' '+trh('fc.excl',{count:f.excluded.length}):'');})()}</div></div></div><div><div class="sec-h">Spending heatmap · ${periodFor(today()).label}</div><div class="card glass">${heatmap()}</div></div></div></div>`;},
 after(v){
  const groups=[];for(let i=-5;i<=0;i++){const p=periodFor(today(),i),s=stats(p.start,p.end);groups.push({label:FMT.dateFmt({month:'short'}).format(pd(p.start)),inc:s.inc,exp:s.exp});}
  drawBars($('#bars',v),groups,[{key:'inc',color:'#30D158',label:'Income'},{key:'exp',color:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#0A7F66',label:'Spending'}],{h:230});
  const f=forecast(60);drawArea($('#fc2',v),f.pts,{h:210,color:'var(--teal)',markMin:true,min:f.min,zero:true,band:{lo:f.lo,hi:f.hi}});
  const sc=$('#sc',v);if(sc){const avg=lastMonthsAvgByCat(3);const upd=()=>{const cut=$('#sl',v).value/100,m=avg[sc.value]*cut,r=.07/12,fv=m*((Math.pow(1+r,120)-1)/r);$('#sp',v).textContent=Math.round(cut*100)+'%';$('#s1',v).textContent=money(m);$('#s2',v).textContent=money(m*12);$('#s3',v).textContent=money(fv);};sc.onchange=upd;$('#sl',v).oninput=upd;upd();}
 }};

/* ================= SETTINGS ================= */
/* Organised into categories (left list on desktop, drill-down list on phones) with a search box that filters
   rows across every category. Every row stays in the DOM, so the handlers in after() are bound by id as before.
   All text comes from the locale files (set.* keys). */
const toggle=(id,on)=>`<label class="switch"><input type="checkbox" id="${id}" ${on?'checked':''}><i></i></label>`;
const srow=(ic,color,t,d,c)=>`<div class="setrow"><div class="sq ico sm" style="--c:${color}">${icon(ic,16)}</div><div class="grow"><b>${t}</b>${d?`<small>${d}</small>`:''}</div>${c}</div>`;
/* <option> list whose labels are translated: keys are option values, labels live at <prefix>.<value> */
const tOpts=(prefix,keys,isSel)=>keys.map(k=>opt(k,tr(prefix+'.'+k),isSel(k))).join('');
const SET_CATS=[['you','user','#0A7F66'],['look','palette','#5E5CE6'],['region','globe','#30D158'],['notify','bell','#FF453A'],['security','lock','#8E8E93'],['windows','power','#32ADE6'],['data','db','#BF5AF2'],['cats','list','#FF9F0A'],['about','info','#64D2FF']];
let SET_CAT=null;           // null = phone shows the category list; otherwise the open category
const setPhone=()=>window.matchMedia('(max-width:860px)').matches;
const setSec=(id,inner)=>`<section class="setsec" data-sc="${id}" aria-label="${trh('set.cat.'+id)}">${inner}</section>`;
const setGroup=(head,body,foot)=>`<div class="sg">${head?`<div class="sec-h">${head}</div>`:''}${body}${foot?`<div class="sec-f">${foot}</div>`:''}</div>`;
PAGES.settings={title:'Settings',
 render(){const s=S.settings,cat=SET_CAT&&SET_CATS.some(c=>c[0]===SET_CAT)?SET_CAT:null,shown=SET_CATS.filter(c=>c[0]!=='windows'||hasNative);
  const H=trh;
  const you=setGroup('',`<div class="group profile"><div class="setrow plain" style="padding:18px 16px"><div id="av_big" style="cursor:pointer" title="${H('set.changePhoto')}">${avatarHtml(64,30)}</div><div class="grow"><b style="font-size:18px">${esc(s.nick||s.name||tr('set.yourName'))}</b><small>${H('set.profileNote')}</small></div><button class="btn sm" id="ph_up">${H('set.photo')}</button>${s.photo?`<button class="btn sm" id="ph_rm">${H('set.remove')}</button>`:''}<input type="file" id="ph_file" accept="image/*" hidden></div>
   <div class="setrow plain"><div class="avs" id="avs">${AVATARS.map(e=>`<span class="${!s.photo&&s.avatar===e?'on':''}" data-av="${e}">${e}</span>`).join('')}</div></div>
   ${srow('user','var(--blue)',H('set.name'),'',`<input type="text" id="st_name" value="${esc(s.name)}" placeholder="${H('set.yourName')}">`)}
   ${srow('sparkles','var(--pink)',H('set.nick'),H('set.nickD'),`<input type="text" id="st_nick" value="${esc(s.nick)}" placeholder="${H('set.nickPh')}">`)}
   ${srow('star','var(--orange)',H('set.why'),H('set.whyD'),`<input type="text" id="st_why" value="${esc(s.why)}" maxlength="60" placeholder="${H('set.whyPh')}">`)}
   ${srow('bolt','var(--purple)',H('set.greet'),'',`<select id="st_greet">${tOpts('set.greet',['friendly','playful','pro','minimal'],k=>s.greet===k)}</select>`)}
  </div>`)+setGroup('',`<div class="group pro-card" id="procard"><div class="setrow plain" style="padding:16px"><div class="sq ico" style="--c:#D98A4E">${icon('star',18)}</div><div class="grow"><b style="font-size:16px">Penny Pro ${planBadge()}</b><small>${isPro()?(MONETIZATION.enabled?(LIC.name?H('set.proLicensed',{name:LIC.name}):H('set.proThanks')):H('set.proEarly')):H('set.proPitch')}</small></div><button class="btn sm ${isPro()&&MONETIZATION.enabled?'':'pri'}" id="pro_btn">${H(isPro()&&MONETIZATION.enabled?'set.manage':'set.seePro')}</button></div></div>`);

  const look=setGroup(H('set.appearance'),`<div class="group">
   ${srow('palette','var(--indigo)',H('set.theme'),H('set.themeD'),`<select id="st_theme">${tOpts('set.theme',['dark','light','auto'],k=>s.theme===k)}</select>`)}
   ${srow('sparkles','var(--blue)',H('set.accent'),H('set.accentD'),`<div class="swatches">${ACCENTS.map(c=>`<div class="sw ${c.toLowerCase()===s.accent.toLowerCase()?'on':''}" data-ac="${c}" style="background:${c}"></div>`).join('')}<input type="color" id="st_ac" value="${s.accent}" title="${H('set.customColour')}"></div>`)}
   ${srow('layers','var(--teal)',H('set.style'),H('set.styleD'),`<select id="st_style">${tOpts('set.style',['clean','glass'],k=>(s.style||'clean')===k)}</select>`)}
   <div class="glassonly">
   ${srow('eye','var(--teal)',H('set.blur'),H('set.blurD',{px:s.blur}),`<input type="range" id="st_blur" min="0" max="60" value="${s.blur}">`)}
   ${srow('eye','var(--mint)',H('set.tint'),H('set.tintD'),`<input type="range" id="st_op" min="1" max="30" value="${s.opacity}">`)}
   ${srow('card','var(--purple)',H('set.material'),H('set.materialD'),`<select id="st_mat">${tOpts('set.material',['acrylic','mica','tabbed','none'],k=>s.material===k)}</select>`)}
   ${srow('shield','var(--green)',H('set.solid'),H('set.solidD'),toggle('st_solid',s.solid))}
   </div>
   ${srow('list','var(--orange)',H('set.compact'),H('set.compactD'),toggle('st_cmp',s.compact))}
   ${srow('sliders','var(--pink)',H('set.density'),H('set.densityD'),`<select id="st_den">${tOpts('set.density',['compact','comfortable','spacious'],k=>s.density===k)}</select>`)}
   ${srow('info','var(--blue)',H('set.textSize'),H('set.textSizeD',{px:s.fontSize}),`<input type="range" id="st_fs" min="13" max="19" value="${s.fontSize}">`)}
   ${srow('image','var(--pink)',H('set.background'),H('set.backgroundD'),`<select id="st_bg">${BACKGROUNDS.map(([k,l,p])=>opt(k,l+(p&&!can('backgrounds')?'  ·  Pro':''),s.bg===k)).join('')}</select>`)}
   ${srow('bolt','var(--yellow)',H('set.anim'),H('set.animD'),toggle('st_anim',s.anim))}
   ${srow('sparkles','var(--orange)',H('set.motion'),H('set.motionD'),`<select id="st_motion">${tOpts('set.motion',['full','reduced','off'],k=>s.motion===k)}</select>`)}
  </div>`)+setGroup(H('set.layout'),`<div class="group">
   ${s.widgets.map((w,i)=>`<div class="setrow plain"><div class="grow"><b>${I18N.exists('widget.'+w.id)?H('widget.'+w.id):esc(WIDGETS.find(x=>x[0]===w.id)[1])}</b></div><button class="icon-btn" data-wm="${i}" data-d="-1" aria-label="${H('set.moveUp')}" ${i?'':'disabled style="opacity:.25"'}>${icon('arrowup',17)}</button><button class="icon-btn" data-wm="${i}" data-d="1" aria-label="${H('set.moveDown')}" ${i<s.widgets.length-1?'':'disabled style="opacity:.25"'}>${icon('arrowdown',17)}</button>${toggle('wv'+i,w.on).replace('<input','<input data-wv="'+i+'"')}</div>`).join('')}
  </div>`,H('set.layoutF'));

  const nd=nativeDigitsDiffer();
  const region=setGroup(H('set.language'),`<div class="group">
   ${srow('globe','var(--green)',H('set.language'),H('set.languageD'),`<select id="st_lang">${langOptions(readLangPref())}</select>`)}
   ${srow('info','var(--blue)',H('set.format'),H('set.formatD'),`<select id="st_loc">${regionOptions(s.locale||'auto')}</select>`)}
   ${nd?srow('info','var(--indigo)',H('set.digits'),H('set.digitsD'),`<select id="st_dig">${tOpts('set.digits',['latn','native'],k=>(s.digits||'latn')===k)}</select>`):''}
   <div class="setrow plain"><div class="grow"><b>${H('set.preview')}</b><small id="set_preview" dir="auto">${esc(setPreview())}</small></div></div>
  </div>`,H('set.languageF'))+setGroup(H('set.money'),`<div class="group">
   ${srow('coins','var(--green)',H('set.currency'),H('set.currencyD'),`<select id="st_cur">${CURRENCIES.map(c=>opt(c,c,s.currency===c)).join('')}</select>`)}
   ${srow('calendar','var(--red)',H('set.cycle'),H('set.cycleD'),`<input type="number" id="st_cs" min="1" max="28" value="${s.cycleStart}">`)}
   ${fxRowsHtml(s)}
   ${srow('eyeoff','var(--indigo)',H('set.privacy'),H('set.privacyD'),toggle('st_priv',s.privacy))}
  </div>`);

  const notify=setGroup(H('set.cat.notify'),`<div class="group">
   ${srow('bell','var(--red)',H('set.billRem'),H('set.billRemD'),toggle('st_notify',s.notify))}
   ${srow('calendar','var(--orange)',H('set.remindMe'),H('set.remindMeD'),`<select id="st_rd">${[1,3,7].map(k=>opt(k,tr('set.ahead.'+k),s.remindDays===k)).join('')}</select>`)}
   ${srow('clock','var(--blue)',H('set.remTime'),H('set.remTimeD'),`<select id="st_rh">${[7,8,9,10,12,15,18,20].map(h=>opt(h,FMT.hour(h),s.remindHour===h)).join('')}</select>`)}
   ${srow('bell','var(--pink)',H('set.remSound'),H('set.remSoundD'),`<div style="display:flex;gap:8px;align-items:center"><select id="st_rsnd">${REM_SOUNDS.map(([k,l])=>opt(k,I18N.exists('sound.'+k)?tr('sound.'+k):l,s.remSound===k)).join('')}</select><button class="btn sm" id="st_rplay">${H('set.play')}</button></div>`)}
   ${srow('clock','var(--orange)',H('set.remLead'),H('set.remLeadD'),`<select id="st_rlead">${REM_LEAD.map(([m,l])=>opt(m,I18N.exists('lead.'+m)?tr('lead.'+m):l,(s.remLead||0)===m)).join('')}</select>`)}
   ${srow('eyeoff','var(--indigo)',H('set.quiet'),H('set.quietD'),toggle('st_qon',s.quietOn))}
   ${s.quietOn?srow('clock','var(--gray,#8E8E93)',H('set.quietFromTo'),'',`<div style="display:flex;gap:8px"><input type="time" id="st_qf" value="${s.quietFrom}" style="width:120px"><input type="time" id="st_qt" value="${s.quietTo}" style="width:120px"></div>`):''}
   ${srow('list','var(--indigo)',H('set.weekly'),H('set.weeklyD'),toggle('st_wd',s.weeklyDigest))}
  </div>`);

  const security=setGroup(H('set.cat.security'),`<div class="group">
   ${srow('lock','var(--indigo)',H('set.pin'),H(s.pin?'set.pinOn':'set.pinOff'),s.pin?`<button class="btn sm" id="pin_off">${H('set.remove')}</button>`:`<button class="btn sm pri" id="pin_on">${H('set.pinSet')}</button>`)}
   ${srow('clock','var(--purple)',H('set.autoLock'),H(s.pin?'set.autoLockD':'set.autoLockNeedsPin'),`<select id="st_al" ${s.pin?'':'disabled'}>${[0,1,5,15,30].map(k=>opt(k,tr('set.autoLock.'+k),s.autoLock===k)).join('')}</select>`)}
   ${srow('lock','var(--gray,#8E8E93)',H('set.lockMin'),H('set.lockMinD'),toggle('st_lm',s.lockOnMinimize))}
   ${srow('eyeoff','var(--teal)',H('set.blurLeave'),H('set.blurLeaveD'),toggle('st_bl',s.blurOnLeave))}
  </div>`);

  const windows=hasNative?setGroup(H('set.cat.windows'),`<div class="group" id="syssec">
   ${srow('power','var(--green)',H('set.launch'),H('set.launchD'),toggle('sy_launch',SYS.launchAtStartup))}
   ${srow('eye','var(--blue)',H('set.startMin'),H('set.startMinD'),toggle('sy_min',SYS.startMinimized))}
   ${srow('card','var(--indigo)',H('set.tray'),H('set.trayD'),toggle('sy_tray',SYS.tray))}
   ${srow('x','var(--orange)',H('set.ctt'),H('set.cttD'),toggle('sy_ctt',SYS.closeToTray))}
   ${srow('bolt','var(--yellow)',H('set.hotkey'),H(SYS.hotkey?(SYS.hotkeyOk===false?'set.hotkeyTaken':'set.hotkeyD'):'set.off'),`<select id="sy_hk">${[['','set.off'],['CommandOrControl+Alt+P','Ctrl + Alt + P'],['CommandOrControl+Alt+N','Ctrl + Alt + N'],['CommandOrControl+Shift+Space','Ctrl + Shift + Space'],['CommandOrControl+Alt+Space','Ctrl + Alt + Space']].map(([k,l])=>opt(k,l.startsWith('set.')?tr(l):l,(SYS.hotkey?SYS.hotkeyAccel:'')===k)).join('')}</select>`)}
   ${srow('layers','var(--teal)',H('set.top'),H('set.topD'),toggle('sy_top',SYS.alwaysOnTop))}
   ${srow('eyeoff','var(--red)',H('set.capture'),H('set.captureD'),toggle('sy_cap',SYS.hideFromCapture))}
   ${srow('search','var(--purple)',H('set.zoom'),H('set.zoomD'),`<select id="sy_zoom">${[.9,1,1.1,1.25,1.5].map(k=>opt(k,pct(k),Math.abs(SYS.zoom-k)<.01)).join('')}</select>`)}
  </div>`,H(SYS.packaged===false?'set.startupSource':'set.jumpNote')):'';

  const data=setGroup(H('set.yourData'),`<div class="group">
   ${srow('down','var(--blue)',H('set.exportAll'),H('set.exportAllD'),`<button class="btn sm" id="d_exp">${H('set.exportBtn')}</button>`)}
   ${srow('up','var(--green)',H('set.import'),H('set.importD'),`<button class="btn sm" id="d_imp">${H('set.importBtn')}</button>`)}
   ${srow('list','var(--teal)',H('set.csv'),H('set.csvD'),`<button class="btn sm" id="d_csv">${H('set.export')}</button><button class="btn sm" id="d_icsv">${H('set.importShort')}</button>`)}
   ${hasNative?srow('db','var(--gray,#8E8E93)',H('set.dataFolder'),H('set.dataFolderD'),`<button class="btn sm" id="d_open">${H('common.open')}</button>`):''}
  </div>`,H('set.dataF'))+(hasNative?setGroup(H('set.backups'),`<div class="group">${srow('shield','var(--green)',H('set.backNow'),H('set.backNowD'),`<button class="btn sm pri" id="bk_now">${H('set.backBtn')}</button>`)}</div><div class="group bk" id="bklist" style="margin-top:12px"><div class="empty" style="padding:18px">${H('set.loading')}</div></div>`,H('set.backupsF')):'')
  +setGroup(H('set.reset'),`<div class="group">
   ${srow('sparkles','var(--orange)',H('set.demo'),H('set.demoD'),`<button class="btn sm" id="d_demo">${H('set.load')}</button>`)}
   ${srow('trash','var(--red)',H('set.erase'),H('set.eraseD'),`<button class="btn sm danger" id="d_wipe">${H('set.eraseBtn')}</button>`)}
  </div>`);

  const cats=setGroup(H('set.cat.cats'),`<div class="group">
   ${S.categories.map(c=>`<div class="li" data-cat="${c.id}" style="min-height:52px"><div class="sq sm" style="--c-bg:${c.color}30">${gl(c.emoji)}</div><div class="grow"><b>${esc(c.name)}</b></div><span class="muted sm">${c.type==='income'?H('set.catIncome'):c.budget?H('set.catBudget',{amount:money(c.budget)}):H('set.catExpense')}</span>${icon('chevron',16)}</div>`).join('')}
   <div class="li noicon" data-act="addcat" style="min-height:52px;color:var(--accent);font-weight:550">${icon('plus',18,2.4)} ${H('set.newCat')}</div>
  </div>`);

  const rules=setGroup(H('rules.title'),rulesSettingsHtml(),H('rules.footer'));
  const about=(hasNative&&native.updGet?setGroup(H('set.updates'),`<div class="group">
   ${srow('down','var(--green)','Penny '+BRAND.version,`<span id="upd_stat">${esc(updLabel(UPD))}</span>`,`<button class="btn sm" id="upd_check">${H('set.checkNow')}</button><button class="btn sm pri" id="upd_apply" style="${UPD.status==='ready'?'':'display:none'}">${H('upd.restart')}</button>`)}
   ${UPD.notes&&UPD.status==='ready'?`<div class="setrow plain"><div class="grow"><b>${H('set.whatsNew',{version:UPD.available})}</b><small>${esc(UPD.notes)}</small></div></div>`:''}
   ${srow('bolt','var(--blue)',H('set.autoUpdate'),H('set.autoUpdateD'),toggle('upd_auto',SYS.autoUpdate!==false))}
   ${srow('globe','var(--gray,#8E8E93)',H('set.feed'),H('set.feedD'),`<input type="text" id="upd_feed" value="${esc(SYS.updateFeed||'')}" placeholder="${esc(UPD.feed||'https://…/latest.json')}" style="max-width:300px" dir="ltr">`)}
  </div>`,H('set.updatesF')):'')
  +setGroup(H('set.help'),`<div class="group">
   ${srow('info','var(--blue)',H('set.guide'),H('set.guideD'),`<button class="btn sm pri" id="h_tour">${H('set.tour')}</button>`)}
   ${srow('sparkles','var(--yellow)',H('set.tips'),H('set.tipsD'),toggle('st_tips',!s.tipsOff))}
  </div>`)
  +setGroup(H('set.about'),aboutGroup());

  const body={you,look,region,notify,security,windows,data,cats:rules+cats,about};
  return`<div class="page wrap setpage" id="setpage" data-view="${cat?'detail':'list'}" data-scat="${cat||'you'}" style="max-width:1040px">${lt(H('nav.settings'),H('set.sub'))}
  <div class="setsearch">${icon('search',16)}<input type="search" id="set_q" placeholder="${H('set.search')}" aria-label="${H('set.search')}" autocomplete="off"><button class="icon-btn" id="set_qx" aria-label="${H('set.clearSearch')}" hidden>${icon('x',14)}</button></div>
  <div class="setlayout">
   <nav class="setnav" id="setnav" aria-label="${H('nav.settings')}">${shown.map(([id,ic,col])=>`<button class="setnav-i ${(cat||'you')===id?'on':''}" data-sc="${id}"><span class="sq ico sm" style="--c:${col}">${icon(ic,16)}</span><span class="grow">${H('set.cat.'+id)}</span>${icon('chevron',15)}</button>`).join('')}</nav>
   <div class="setbody"><button class="setback" id="setback">${icon('chevleft',16)}<span>${H('nav.settings')}</span></button>
    <h2 class="setcat-t" id="setcat_t">${H('set.cat.'+(cat||'you'))}</h2>
    ${SET_CATS.map(([id])=>setSec(id,body[id])).join('')}
    <div class="empty" id="set_none" hidden>${H('set.noMatch')}</div></div>
  </div></div>`;},
 after(v){
  const S_=S.settings,set=(k,val)=>{S_[k]=val;applySettings();save();};
  /* ---- category navigation + search ---- */
  const pg=$('#setpage',v),q=$('#set_q',v);
  const openCat=id=>{SET_CAT=id;pg.dataset.view='detail';pg.dataset.scat=id;$$('.setnav-i',v).forEach(b=>b.classList.toggle('on',b.dataset.sc===id));$('#setcat_t',v).textContent=tr('set.cat.'+id);v.scrollTop=0;};
  $('#setnav',v).onclick=e=>{const b=e.target.closest('.setnav-i');if(b){q.value='';filter();openCat(b.dataset.sc);}};
  $('#setback',v).onclick=()=>{SET_CAT=null;pg.dataset.view='list';v.scrollTop=0;};
  if(!setPhone()&&!SET_CAT){pg.dataset.view='list';}   // desktop always shows a category; 'list' only matters on phones
  const norm=s=>String(s||'').toLocaleLowerCase(I18N.lang).normalize('NFKD').replace(/[̀-ًͯ-ٟ]/g,'');
  function filter(){
    const t=norm(q.value.trim());pg.classList.toggle('searching',!!t);$('#set_qx',v).hidden=!t;
    let hits=0;
    $$('.setsec',v).forEach(sec=>{let secHit=0;
      $$('.sg',sec).forEach(sg=>{
        const head=norm((sg.querySelector('.sec-h')||{}).textContent),rows=$$('.setrow,.li[data-cat],.li[data-act]',sg);let n=0;
        const headHit=!!t&&!!head&&head.includes(t);
        rows.forEach(r=>{const m=!t||headHit||norm(r.textContent).includes(t);r.hidden=!m;if(m)n++;});
        const listOnly=!rows.length;                      // e.g. the backups list: follows its heading
        const show=!t||n>0||(listOnly&&headHit);sg.hidden=!show;if(show)secHit+=Math.max(n,listOnly?1:0);
        $$('.group',sg).forEach(g=>{g.hidden=!!t&&!g.querySelector('.setrow:not([hidden]),.li[data-cat]:not([hidden]),.li[data-act]:not([hidden])')&&!headHit;});
      });
      sec.hidden=!!t&&!secHit;hits+=secHit;
    });
    $('#set_none',v).hidden=!(t&&!hits);
  }
  q.oninput=filter;$('#set_qx',v).onclick=()=>{q.value='';filter();q.focus();};
  q.onkeydown=e=>{if(e.key==='Escape'&&q.value){q.value='';filter();e.stopPropagation();}};
  $('#st_theme',v).onchange=e=>set('theme',e.target.value);
  $('.swatches',v).onclick=e=>{if(e.target.dataset.ac){set('accent',e.target.dataset.ac);$$('.sw',v).forEach(x=>x.classList.toggle('on',x===e.target));$('#st_ac',v).value=e.target.dataset.ac;}};
  $('#st_ac',v).oninput=e=>{set('accent',e.target.value);$$('.sw',v).forEach(x=>x.classList.remove('on'));};
  $('#st_style',v).onchange=e=>set('style',e.target.value);
  bindFxRows(v,set);
  $('#st_blur',v).oninput=e=>{set('blur',+e.target.value);e.target.closest('.setrow').querySelector('small').textContent=tr('set.blurD',{px:+e.target.value});};
  $('#st_op',v).oninput=e=>set('opacity',+e.target.value);
  $('#st_mat',v).onchange=e=>set('material',e.target.value);
  $('#st_solid',v).onchange=e=>set('solid',e.target.checked);
  $('#st_cmp',v).onchange=e=>set('compact',e.target.checked);
  $('#st_den',v).onchange=e=>set('density',e.target.value);
  $('#st_fs',v).oninput=e=>{set('fontSize',+e.target.value);e.target.closest('.setrow').querySelector('small').textContent=tr('set.textSizeD',{px:+e.target.value});};
  $('#st_anim',v).onchange=e=>set('anim',e.target.checked);
  $('#st_name',v).oninput=e=>{S_.name=e.target.value;save();updateSideFoot();};
  $('#st_nick',v).oninput=e=>{S_.nick=e.target.value;save();updateSideFoot();};$('#st_why',v).oninput=e=>{S_.why=e.target.value;save();updateSideFoot();};$('#st_greet',v).onchange=e=>set('greet',e.target.value);
  $('#avs',v).onclick=e=>{const a=e.target.dataset.av;if(!a)return;S_.avatar=a;S_.photo='';changed();};
  const phf=$('#ph_file',v);$('#ph_up',v).onclick=$('#av_big',v).onclick=()=>phf.click();
  phf.onchange=async()=>{if(!phf.files[0])return;try{S_.photo=await resizePhoto(phf.files[0]);changed();toast(tr('set.photoUpdated'));}catch{toast(tr('set.photoFail'));}};
  const pr=$('#ph_rm',v);if(pr)pr.onclick=()=>{S_.photo='';changed();};
  $('#st_rsnd',v).onchange=e=>set('remSound',e.target.value);$('#st_rplay',v).onclick=()=>{const k=$('#st_rsnd',v).value;playSound(k==='default'?'chime':k);};
  $('#st_rlead',v).onchange=e=>set('remLead',+e.target.value);$('#st_qon',v).onchange=e=>{set('quietOn',e.target.checked);changed();};
  const qf=$('#st_qf',v);if(qf){qf.onchange=e=>set('quietFrom',e.target.value);$('#st_qt',v).onchange=e=>set('quietTo',e.target.value);}
  if($('#upd_check',v)){
    $('#upd_check',v).onclick=async()=>{$('#upd_stat',v).textContent=tr('upd.checking');const u=await native.updCheck();onUpdate(u);};
    $('#upd_apply',v).onclick=applyUpdate;
    $('#upd_auto',v).onchange=e=>{SYS.autoUpdate=e.target.checked;native.sysSet({autoUpdate:e.target.checked});};
    $('#upd_feed',v).onchange=async e=>{SYS.updateFeed=e.target.value.trim();await native.sysSet({updateFeed:SYS.updateFeed});const u=await native.updGet();onUpdate(u);toast(tr(SYS.updateFeed?'set.feedSaved':'set.feedDefault'));};
  }
  wireAbout(v);$('#h_tour',v).onclick=()=>openGuide();$('#st_tips',v).onchange=e=>set('tipsOff',!e.target.checked);
  /* language & regional formats: only DISPLAY changes; stored amounts and dates are never rewritten */
  const refreshPreview=()=>{const p=$('#set_preview',v);if(p)p.textContent=setPreview();};
  $('#st_lang',v).onchange=async e=>{await setAppLanguage(e.target.value);};
  $('#st_loc',v).onchange=e=>{set('locale',e.target.value);setupFmt();applyLanguageEnv();changed();};
  const sdg=$('#st_dig',v);if(sdg)sdg.onchange=e=>{set('digits',e.target.value);setupFmt();applyLanguageEnv();changed();};
  $('#st_cur',v).onchange=e=>{set('currency',e.target.value);setupFmt();refreshPreview();};
  $('#st_cs',v).onchange=e=>{set('cycleStart',clamp(parseInt(e.target.value)||1,1,28));};
  $('#st_priv',v).onchange=e=>set('privacy',e.target.checked);
  $('#st_notify',v).onchange=e=>set('notify',e.target.checked);
  $$('[data-wm]',v).forEach(b=>b.onclick=()=>{const i=+b.dataset.wm,j=i+ +b.dataset.d,w=S_.widgets;[w[i],w[j]]=[w[j],w[i]];changed();});
  $$('[data-wv]',v).forEach(c=>c.onchange=()=>{S_.widgets[+c.dataset.wv].on=c.checked;save();});
  const po=$('#pin_on',v);if(po)po.onclick=openPinSetup;const pf=$('#pin_off',v);if(pf)pf.onclick=()=>{S_.pin=null;changed();toast(tr('set.pinRemoved'));};
  $('#d_exp',v).onclick=openExportSheet;$('#d_imp',v).onclick=startImport;
  $('#pro_btn',v).onclick=()=>openUpgrade();
  $('#st_bg',v).onchange=e=>{const b=BACKGROUNDS.find(x=>x[0]===e.target.value);if(b&&b[2]&&!can('backgrounds')){e.target.value=S_.bg;openUpgrade('backgrounds');return;}set('bg',e.target.value);};
  $('#st_motion',v).onchange=e=>set('motion',e.target.value);
  $('#st_rd',v).onchange=e=>set('remindDays',+e.target.value);$('#st_rh',v).onchange=e=>set('remindHour',+e.target.value);$('#st_wd',v).onchange=e=>set('weeklyDigest',e.target.checked);
  $('#st_al',v).onchange=e=>{set('autoLock',+e.target.value);armIdle();};$('#st_lm',v).onchange=e=>set('lockOnMinimize',e.target.checked);$('#st_bl',v).onchange=e=>set('blurOnLeave',e.target.checked);
  if(hasNative){
    const sy=async patch=>{const r=await native.sysSet(patch);Object.assign(SYS,r);if(('hotkey' in patch||'hotkeyAccel' in patch)&&SYS.hotkey&&r.hotkeyOk===false)toast(tr('set.hotkeyTakenToast'));};
    $('#sy_launch',v).onchange=e=>sy({launchAtStartup:e.target.checked});$('#sy_min',v).onchange=e=>sy({startMinimized:e.target.checked});
    $('#sy_tray',v).onchange=e=>sy({tray:e.target.checked}).then(()=>{if(!e.target.checked&&(SYS.closeToTray||(SYS.launchAtStartup&&SYS.startMinimized)))toast(tr('set.trayStays'));});
    $('#sy_ctt',v).onchange=e=>sy({closeToTray:e.target.checked});
    $('#sy_hk',v).onchange=e=>sy(e.target.value?{hotkey:true,hotkeyAccel:e.target.value}:{hotkey:false});
    $('#sy_top',v).onchange=e=>sy({alwaysOnTop:e.target.checked});$('#sy_cap',v).onchange=e=>sy({hideFromCapture:e.target.checked});
    $('#sy_zoom',v).onchange=e=>sy({zoom:+e.target.value});
  }
  $('#d_csv',v).onclick=()=>exportCSV([...S.transactions].sort((a,b)=>a.date<b.date?1:-1));$('#d_icsv',v).onclick=importCSV;
  const op=$('#d_open',v);if(op)op.onclick=()=>native.openDataFolder();
  $('#d_demo',v).onclick=async()=>{if(await confirmBox(tr('set.demoConfirm'),tr('set.demoOk'),tr('set.demoTitle'))){if(await replaceData(demoData(S.settings.name)))toast(tr('set.demoLoaded'));}};
  $('#d_wipe',v).onclick=async()=>{if(await confirmBox(tr('set.eraseConfirm'),tr('common.continue'),tr('set.eraseTitle'))&&await confirmType(tr('set.eraseConfirm2'),tr('erase.word'))){if(await replaceData(freshData(S.settings.name)))toast(tr('set.erased'),{ms:5000});}};
  if(hasNative){
    native.version().then(x=>{const e=$('#ver',v);if(e)e.textContent=x;});
    const lbl=n=>{const m=n.replace('.json','');
      if(m==='penny-data.lastgood')return tr('backup.lastGood');
      let r;
      if((r=/^before-change-(.*)$/.exec(m)))return tr('backup.beforeChange')+' · '+bkWhen(r[1]);
      if((r=/^pre-migration-(.*)$/.exec(m)))return tr('backup.beforeUpgrade')+' · '+bkWhen(r[1]);
      if((r=/^manual-(.*)$/.exec(m)))return tr('backup.manual')+' · '+bkWhen(r[1]);
      if((r=/^penny-(\d{4}-\d\d-\d\d)/.exec(m)))return tr('backup.daily')+' · '+bkWhen(r[1]);
      return m;};
    const draw=()=>native.listBackups().then(list=>{const box=$('#bklist',v);if(!box)return;
      box.innerHTML=list.length?list.slice(0,10).map(b=>{const meta=b.valid?tr('backup.counts',{tx:b.counts.transactions,acc:b.counts.accounts}):tr('backup.damaged');
        return `<div class="li noicon"><div class="grow"><b>${esc(lbl(b.name))}</b><small>${esc(FMT.dateTime(b.mtime))} · ${esc(FMT.number((b.size/1024),{maximumFractionDigits:0}))} KB · ${esc(meta)}${b.valid&&b.empty?' · '+trh('backup.empty'):''}</small></div><button class="btn sm" data-restore="${esc(b.name)}" ${b.valid?'':'disabled'}>${b.valid?trh('backup.restore'):'—'}</button></div>`;}).join(''):`<div class="empty" style="padding:18px">${trh('backup.none')}</div>`;
      $$('[data-restore]',box).forEach(x=>x.onclick=async()=>{
        const t=await native.readBackup(x.dataset.restore);
        let res;try{res=await parseImport(t||'','');}catch(e){toast(e.message||tr('backup.cantRestore'),{ms:5000});return;}
        const c=res.meta.counts;
        if(!await confirmBox(tr('backup.confirm',{tx:c.transactions,acc:c.accounts,goals:c.goals,rem:c.reminders})+(res.meta.from?' '+tr('backup.range',{from:res.meta.from,to:res.meta.to}):'')+' '+tr('backup.confirmSafety')+(res.warn.length?' '+tr('backup.note')+' '+res.warn.join(' '):''),tr('backup.restore'),tr('backup.confirmTitle')))return;
        if(await replaceData(res.data)){toast(tr('backup.restored'));draw();}
      });});
    draw();
    const bn=$('#bk_now',v);if(bn)bn.onclick=async()=>{const r=await native.snapshot('manual');toast(r&&r.ok?tr('backup.saved'):tr('backup.failed')+(r&&r.error?' ('+r.error+')':''),{ms:4000});draw();};
  }
  bindRulesUI(v);
  filter();
 }};
/* a backup file name carries either a date (2026-10-14) or a timestamp (2026-10-14T09-30-00-123Z); show it in the user's format */
function bkWhen(s){const m=/^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d)-(\d\d)-(\d\d))?/.exec(s||'');if(!m)return s||'';
  const d=new Date(+m[1],+m[2]-1,+m[3],m[4]?+m[4]:0,m[5]?+m[5]:0,m[6]?+m[6]:0);return m[4]?FMT.dateTime(d):FMT.dateShort(`${m[1]}-${m[2]}-${m[3]}`);}
/* sample line so a language / regional-format change is visible right away (display only) */
function setPreview(){try{return `${FMT.money(1234567.89)}  ·  ${FMT.percent(.256,1)}  ·  ${FMT.dateLong(today())}`;}catch{return '';}}
