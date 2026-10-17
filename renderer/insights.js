'use strict';
/* =========================================================================
   Insights 2.0 (1.9). Everything runs on this PC from your own data.
   - insightList(): findings grouped into Needs attention / Good news / Worth knowing, each with a stable id
     (so it can be dismissed or snoozed) and one-click actions.
   - New findings: bills due before payday, goal pace with the monthly fix, 3-period rising categories,
     income change; reuses smart.js for unusual charges, double charges, price increases, runway and streaks.
   - The page: period switcher, a recap card, grouped findings, one health score (the Report's four pillars),
     top merchants, category trends, clickable income-vs-spending bars, forecast, heatmap and a what-if tool.
   All text is translated (keys in.*).
   ========================================================================= */
let INS_RANGE='period',INS_MORE=false,INS_SHOW_HIDDEN=false,INS_CUT={cats:[],pct:20};
function insRange(r=INS_RANGE){
  const t=today();
  if(r==='3m'){const a=periodFor(t,-2).start,len=diffDays(a,t),pb=addDays(a,-1);return{key:r,a,b:t,pa:addDays(pb,-len),pb,label:tr('in.r.3mLabel')};}
  if(r==='year'){const y=+t.slice(0,4);return{key:r,a:y+'-01-01',b:t,pa:(y-1)+'-01-01',pb:(y-1)+t.slice(4),label:String(y)};}
  const p=periodFor(t),pv=periodFor(t,-1);return{key:'period',a:p.start,b:t,pa:pv.start,pb:addDays(pv.start,diffDays(p.start,t)),label:p.label,end:p.end};
}
/* jump to Transactions with filters set */
function showTx(f){Object.assign(F,F_DEFAULT,f||{});if(typeof SEL!=='undefined'){SEL.on=false;SEL.ids.clear();}go('transactions');}
const rangeTx=(R,extra)=>showTx({range:'custom',from:R.a,to:R.b,...(extra||{})});

/* ---------- dismiss / snooze ---------- */
function insHidden(){const h=S.settings.insHide;return h&&typeof h==='object'?h:{};}
const isInsHidden=id=>{const u=insHidden()[id];return !!u&&u>=today();};
function insHide(id,days){
  const h={...insHidden()},t=today();for(const k in h)if(h[k]<t)delete h[k]; // forget expired entries
  h[id]=days?addDays(t,days):'9999-12-31';S.settings.insHide=h;save();
}
function insUnhideAll(){S.settings.insHide={};save();}

/* ---------- findings ---------- */
function insightList(R=insRange()){
  const out=[],t=today(),p=periodFor(t),cn=id=>cat(id).name;
  const add=(id,g,ic,title,text,act=[],w=0)=>out.push({id,g,ic,title,text,act,w});
  if(!S.transactions.length){add('welcome','info','sparkles',tr('in.welcome.t'),tr('in.welcome.d'),[{l:tr('tour.q.add'),fn:()=>openTx()},{l:tr('tour.q.import'),fn:()=>{go('transactions');importCSV();}}]);return out;}
  const st=stats(R.a,R.b),pv=stats(R.pa,R.pb);
  // budgets (always the current period)
  const cur=stats(p.start,p.end);
  for(const c of S.categories.filter(c=>c.type==='expense'&&c.budget>0)){
    const s=cur.byCat[c.id]||0,B=budgetFor(c).available;if(!(B>0))continue;
    const acts=[{l:tr('in.a.see'),fn:()=>showTx({cat:c.id,range:'period'})},{l:tr('in.a.budget'),fn:()=>openCat(c)}];
    if(s>B)add(`bud:${c.id}:${p.start}`,'att','alert',tr('in.bud.over.t',{name:c.name}),tr('in.bud.over.d',{over:money(s-B),limit:money(B)}),acts,90);
    else if(s>B*.85)add(`bud85:${c.id}:${p.start}`,'att','target',tr('in.bud.near.t',{name:c.name}),tr('in.bud.near.d',{pct:pct(s/B),left:money(B-s),days:String(Math.max(0,diffDays(t,p.end)))}),acts,60);
  }
  // cash may run short
  const f=forecast(45);
  if(f.min.y<0)add(`cash:${p.start}`,'att','trend',tr('in.cash.t'),tr('in.cash.d',{amount:money(f.min.y),date:dshort(f.min.x)}),[{l:tr('in.a.forecast'),fn:()=>{const e=$('#fc2');e&&e.scrollIntoView({behavior:'smooth',block:'center'});}}],100);
  // bills due before the next payday
  try{
    const pays=detectRecurringAll().filter(r=>r.type==='income'&&r.next&&r.next>t).sort((a,b)=>a.next<b.next?-1:1);
    if(pays.length){
      const next=pays[0].next;let due=0,n=0;
      for(const b of S.bills){if(b.type!=='expense')continue;for(const d of occurrences(b,t,addDays(next,-1))){due+=+b.amount||0;n++;}}
      if(n){const liquid=totals().liquid,short=due>liquid;
        add(`payday:${next}`,short?'att':'info','calendar',tr('in.payday.t',{count:n,amount:money(due)}),tr(short?'in.payday.dShort':'in.payday.d',{date:dshort(next),cash:money(liquid)}),[{l:tr('in.a.bills'),fn:()=>go('bills')}],short?95:0);}
    }
  }catch(e){logErr('payday insight',e);}
  // unusual, double, price increases (smart.js)
  try{anomalies().forEach(a=>add(`anom:${a.t.id}`,'att','search',tr('in.anom.t',{name:txTitle(a.t),amount:money(a.t.amount)}),tr('in.anom.d',{x:String(Math.round(a.t.amount/Math.max(1,a.med))),cat:cn(a.t.category),typical:money(a.med)}),[{l:tr('in.a.view'),fn:()=>openTx(a.t)},{l:tr('in.a.fine'),fn:null,dismiss:true}],70));}catch(e){logErr('anomalies',e);}
  try{duplicates().forEach(([a,b])=>add(`dup:${a.id}:${b.id}`,'att','swap',tr('in.dup.t',{name:b.merchant}),tr('in.dup.d',{amount:money(b.amount),d1:dshort(a.date),d2:dshort(b.date)}),[{l:tr('in.a.review'),fn:()=>showTx({range:'custom',from:a.date,to:b.date,payee:b.merchant})},{l:tr('in.a.fine'),fn:null,dismiss:true}],80));}catch(e){logErr('duplicates',e);}
  try{priceHikes().forEach(h=>add(`hike:${h.name}:${h.to}`,'att','arrowup',tr('in.hike.t',{name:h.name}),tr('in.hike.d',{from:money(h.from),to:money(h.to),year:money((h.to-h.from)*12)}),[{l:tr('in.a.history'),fn:()=>showTx({range:'all',payee:h.name})}],65));}catch(e){logErr('priceHikes',e);}
  // spending vs the same point before
  if(pv.exp>0&&st.exp>0){const ch=(st.exp-pv.exp)/pv.exp,why=[{l:tr('in.a.why'),fn:()=>openWhatChanged(R)}];
    if(ch>.1)add(`spend:${R.key}:${R.a}`,'att','arrowup',tr('in.spend.up.t',{pct:pct(ch)}),tr('in.spend.up.d',{now:money(st.exp),then:money(pv.exp)}),why,50);
    else if(ch<-.1)add(`spend:${R.key}:${R.a}`,'good','arrowdown',tr('in.spend.down.t',{pct:pct(-ch)}),tr('in.spend.down.d',{amount:money(pv.exp-st.exp)}),why,50);}
  // categories rising three periods in a row
  const s1=statsFor(-3).byCat,s2=statsFor(-2).byCat,s3=statsFor(-1).byCat;
  for(const c of S.categories.filter(c=>c.type==='expense')){const a=s1[c.id]||0,b=s2[c.id]||0,d=s3[c.id]||0;
    if(a>0&&a<b&&b<d&&d>a*1.25&&d-a>20)add(`rise:${c.id}:${p.start}`,'info','trend',tr('in.rise.t',{name:c.name}),tr('in.rise.d',{from:money(a),to:money(d)}),[{l:tr('in.a.see'),fn:()=>showTx({cat:c.id,range:'3m'})}],30);}
  // income change: last complete period vs the three before it
  {const l=statsFor(-1).inc,prev=[-2,-3,-4].map(i=>statsFor(i).inc).filter(x=>x>0);
    if(l>0&&prev.length>=2){const avg=sum(prev,x=>x)/prev.length,ch=(l-avg)/avg;
      if(ch<-.15)add(`inc:${periodFor(t,-1).start}`,'att','arrowdown',tr('in.inc.down.t',{pct:pct(-ch)}),tr('in.inc.down.d',{now:money(l),avg:money(avg)}),[],40);
      else if(ch>.15)add(`inc:${periodFor(t,-1).start}`,'good','arrowup',tr('in.inc.up.t',{pct:pct(ch)}),tr('in.inc.up.d',{now:money(l),avg:money(avg)}),[],20);}}
  // goals: pace and the monthly fix
  const pl=planning(),surplus=Math.max(0,pl.income-pl.expenses);
  for(const g of S.goals){if(!(g.target>0)||g.saved>=g.target)continue;const left=g.target-g.saved,acts=[{l:tr('in.a.goals'),fn:()=>go('goals')}],mk=t.slice(0,7);
    if(g.deadline&&g.deadline<t){add(`goalpast:${g.id}:${mk}`,'att','flag',tr('in.goal.past.t',{name:g.name}),tr('in.goal.past.d',{amount:money(left)}),acts,45);continue;}
    if(!g.deadline)continue;
    const need=goalNeeded(g),months=Math.max(1,Math.round(diffDays(t,g.deadline)/30.44));
    if(surplus>0&&need>surplus*1.05){const eta=Math.ceil(left/surplus);add(`goal:${g.id}:${mk}`,'att','star',tr('in.goal.late.t',{name:g.name}),tr('in.goal.late.d',{months:String(eta),target:String(months),need:money(need),more:money(need-surplus)}),acts,35);}
    else if(surplus>0)add(`goalok:${g.id}:${mk}`,'good','star',tr('in.goal.ok.t',{name:g.name}),tr('in.goal.ok.d',{need:money(need)}),acts,15);}
  // savings rate in the chosen range
  if(st.inc>0){if(st.rate>=.2)add(`rate:${R.key}:${R.a}`,'good','piggy',tr('in.rate.good.t',{pct:pct(st.rate)}),tr('in.rate.good.d'),[],25);
    else if(st.rate<0)add(`rate:${R.key}:${R.a}`,'att','alert',tr('in.rate.neg.t'),tr('in.rate.neg.d',{amount:money(-st.net)}),[{l:tr('in.a.why'),fn:()=>openWhatChanged(R)}],85);}
  // runway, streaks, round-ups
  try{const r=runway();if(totals().liquid>0&&r.monthly>20){if(r.months>=6)add('runway:strong','good','lifebuoy',tr('in.run.good.t',{n:FMT.number(+r.months.toFixed(1))}),tr('in.run.good.d'),[],10);
    else if(r.months<2)add(`runway:${t.slice(0,7)}`,'att','lifebuoy',tr('in.run.low.t',{n:FMT.number(+r.months.toFixed(1))}),tr('in.run.low.d',{lo:money(r.monthly*3),hi:money(r.monthly*6)}),[{l:tr('in.a.goal'),fn:()=>{go('goals');openGoal();}}],55);}}catch{}
  try{const sk=streaks();if(sk.noSpend>=2)add(`streak:${t}`,'good','bolt',tr('in.streak.t',{n:String(sk.noSpend)}),tr('in.streak.d',{best:String(sk.best)}),[],12);}catch{}
  const days=Math.min(diffDays(p.start,t)+1,p.days),spendDays=new Set(S.transactions.filter(x=>x.type==='expense'&&x.date>=p.start&&x.date<=t).map(x=>x.date)).size;
  if(R.key==='period'&&days>=7&&days-spendDays>=3)add(`nospend:${p.start}`,'good','leaf',tr('in.nospend.t',{n:String(days-spendDays)}),tr('in.nospend.d'),[],8);
  // worth knowing
  const top=Object.entries(st.byCat).sort((a,b)=>b[1]-a[1])[0];
  if(top&&st.exp>0)add(`top:${R.key}:${R.a}`,'info','coins',tr('in.top.t',{name:cn(top[0])}),tr('in.top.d',{amount:money(top[1]),pct:pct(top[1]/st.exp)}),[{l:tr('in.a.see'),fn:()=>rangeTx(R,{cat:top[0]})}],5);
  const subs=S.bills.filter(b=>b.type==='expense'&&(b.sub||isSubsCat(cat(b.category))));
  if(subs.length){const m=sum(subs,monthlyEq);add('subs:total','info','repeat',tr('in.subs.t',{count:subs.length,amount:money(m)}),tr('in.subs.d',{year:money(m*12)}),[{l:tr('in.a.bills'),fn:()=>go('bills')}],4);}
  try{detectSubs().forEach(d=>add(`sub:${d.name}`,'info','search',tr('in.hidden.t',{name:d.name}),tr('in.hidden.d',{amount:money(d.amount)}),[{l:tr('in.a.addBill'),fn:()=>openBill({name:d.name,amount:d.amount,type:'expense',freq:'monthly',next:d.next||today(),category:d.category,accountId:d.accountId||S.accounts[0]&&S.accounts[0].id,auto:false,sub:true},true)},{l:tr('in.a.notSub'),fn:null,dismiss:true}],6));}catch{}
  let we=0,wd=0;for(const x of S.transactions){if(x.type!=='expense'||x.billId||x.date<R.a||x.date>R.b)continue;const g=pd(x.date).getDay();(g===0||g===6?(we+=x.amount):(wd+=x.amount));}
  if(we+wd>50&&we/(we+wd)>.45)add(`weekend:${R.key}`,'info','calendar',tr('in.weekend.t'),tr('in.weekend.d',{pct:pct(we/(we+wd))}),[],3);
  try{const ru=roundUps(30);if(ru.n>=8)add('roundups','info','coins',tr('in.round.t',{amount:money(ru.total)}),tr('in.round.d',{n:String(ru.n),year:money(ru.yearly)}),[],2);}catch{}
  return out.sort((a,b)=>b.w-a.w);
}

/* ---------- "what changed?" ---------- */
function openWhatChanged(R=insRange()){
  const a=stats(R.a,R.b).byCat,b=stats(R.pa,R.pb).byCat,ids=new Set([...Object.keys(a),...Object.keys(b)]);
  const rows=[...ids].map(id=>({id,now:a[id]||0,then:b[id]||0,d:(a[id]||0)-(b[id]||0)})).filter(r=>Math.abs(r.d)>=1).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d)).slice(0,8);
  const mer=(from,to)=>{const m={};for(const x of S.transactions){if(x.type!=='expense'||!x.merchant||x.date<from||x.date>to)continue;const k=x.merchant.trim();m[k]=(m[k]||0)+x.amount;}return m;};
  const ma=mer(R.a,R.b),mb=mer(R.pa,R.pb),mrows=Object.keys({...ma,...mb}).map(k=>({k,d:(ma[k]||0)-(mb[k]||0)})).filter(r=>r.d>=1).sort((x,y)=>y.d-x.d).slice(0,5);
  const row=r=>`<div class="wc-row" data-cat="${r.id}" role="button" tabindex="0"><span class="sq sm" style="--c-bg:${cat(r.id).color}2e">${gl(cat(r.id).emoji,15)}</span><span class="grow">${esc(cat(r.id).name)}<small>${esc(money(r.then))} → ${esc(money(r.now))}</small></span><b class="amt ${r.d>0?'bad':'good'}">${r.d>0?'+':''}${esc(money(r.d))}</b></div>`;
  openSheet({title:tr('in.wc.title'),ok:'',cancel:tr('common.close'),body:`<p class="muted" style="margin:0 0 12px">${esc(tr('in.wc.sub',{now:R.label}))}</p>
    ${rows.length?`<div class="group">${rows.map(row).join('')}</div>`:`<p class="muted">${trh('in.wc.none')}</p>`}
    ${mrows.length?`<div class="sec-h">${trh('in.wc.merchants')}</div><div class="group">${mrows.map(r=>`<div class="wc-row" data-pay="${esc(r.k)}" role="button" tabindex="0"><span class="sq sm">${icon('cart',15)}</span><span class="grow">${esc(r.k)}</span><b class="amt bad">+${esc(money(r.d))}</b></div>`).join('')}</div>`:''}`,
    mount:s=>{$$('[data-cat]',s).forEach(e=>e.onclick=()=>{closeModal();rangeTx(R,{cat:e.dataset.cat});});$$('[data-pay]',s).forEach(e=>e.onclick=()=>{closeModal();rangeTx(R,{payee:e.dataset.pay});});}});
}

/* ---------- page pieces ---------- */
function insRecap(R){
  const s=stats(R.a,R.b),q=stats(R.pa,R.pb);
  const d=(a,b,inv)=>{if(!(b>0))return'';const c=(a-b)/b;if(Math.abs(c)<.005)return'';const good=inv?c<0:c>0;return`<span class="chip ${good?'good':'bad'}">${icon(c>0?'arrowup':'arrowdown',11,2.6)} ${pct(Math.abs(c))}</span>`;};
  const ids=new Set([...Object.keys(s.byCat),...Object.keys(q.byCat)]),deltas=[...ids].map(id=>({id,d:(s.byCat[id]||0)-(q.byCat[id]||0)}));
  const up=deltas.filter(x=>x.d>1).sort((a,b)=>b.d-a.d)[0],down=deltas.filter(x=>x.d<-1).sort((a,b)=>a.d-b.d)[0];
  const stat=(k,v,delta,cls='')=>`<div class="rc-stat"><small>${trh(k)}</small><b class="amt ${cls}">${v}</b>${delta}</div>`;
  return`<div class="card glass ins-recap"><div class="rc-head"><div><small class="rc-k">${trh('in.recap.k')}</small><h2>${esc(tr('in.recap.t',{label:R.label}))}</h2></div><button class="btn sm" id="in_wc">${icon('sparkles',14)} ${trh('in.a.why')}</button></div>
   <div class="rc-grid">${stat('in.recap.in',money(s.inc),d(s.inc,q.inc),'good')}${stat('in.recap.out',money(s.exp),d(s.exp,q.exp,true))}${stat('in.recap.saved',money(s.net),d(s.net,q.net),s.net<0?'bad':'')}${stat('in.recap.rate',s.inc>0?pct(s.rate):'—','')}</div>
   ${up||down?`<div class="rc-lines">${up?`<div>${icon('arrowup',14,2.4)}<span>${esc(tr('in.recap.up',{name:cat(up.id).name,amount:money(up.d)}))}</span></div>`:''}${down?`<div class="good">${icon('arrowdown',14,2.4)}<span>${esc(tr('in.recap.down',{name:cat(down.id).name,amount:money(-down.d)}))}</span></div>`:''}</div>`:''}
   <div class="rc-foot faint">${esc(tr('in.recap.vs'))}</div></div>`;
}
function insRow(i){
  return`<div class="ins-item g-${i.g}" data-id="${esc(i.id)}"><div class="ins-ic">${icon(i.ic,18,2.1)}</div><div class="grow"><b>${esc(i.title)}</b><span>${esc(i.text)}</span>
   ${i.act.length?`<div class="ins-acts">${i.act.map((a,k)=>`<button class="btn sm ${k===0&&!a.dismiss?'tint':''}" data-a="${k}">${esc(a.l)}</button>`).join('')}</div>`:''}</div>
   <div class="ins-menu"><button class="icon-btn sm" data-m aria-label="${trh('in.hideMenu')}" title="${trh('in.hideMenu')}">${icon('x',15)}</button>
   <div class="ins-pop" hidden><button data-h="7">${trh('in.snooze')}</button><button data-h="0">${trh('in.dismiss')}</button></div></div></div>`;
}
function insGroup(key,list,max){
  if(!list.length)return'';const shown=max&&!INS_MORE?list.slice(0,max):list;
  return`<div class="ins-g g-${key}"><div class="sec-h">${trh('in.g.'+key)} <span class="cnt">${list.length}</span></div><div class="group">${shown.map(insRow).join('')}
   ${shown.length<list.length?`<button class="ins-more" id="in_more">${trh('in.more',{n:list.length-shown.length})}</button>`:''}</div></div>`;
}
function insHealth(){
  const h=healthScore();
  return`<div class="card glass">${ch('shield','var(--green)',trh('in.health'),whyBtn('health'))}<div style="display:flex;justify-content:center;margin:4px 0 16px">${ring(h.total/100,140,14,h.color,`<b style="font-size:38px;letter-spacing:-1.5px">${h.none?'–':h.total}</b><div class="faint">${esc(h.label)}</div>`)}</div>
   ${h.parts.map(p=>`<div class="mini-part"><div class="t"><span>${esc(p.n)}</span><span class="faint">${esc(p.d)}</span></div><div class="bar" style="height:6px"><i style="width:${p.v}%"></i></div></div>`).join('')}
   <button class="btn" id="in_rep" style="width:100%;margin-top:14px">${icon('shield',15)} ${trh('in.openReport')}</button></div>`;
}
function insMerchants(R){
  const m={};for(const x of S.transactions){if(x.type!=='expense'||!x.merchant||x.date<R.a||x.date>R.b)continue;const k=x.merchant.trim(),o=m[k]=m[k]||{name:k,total:0,n:0,cat:x.category};o.total+=x.amount;o.n++;}
  const l=Object.values(m).sort((a,b)=>b.total-a.total).slice(0,6),max=l[0]?l[0].total:1;
  return`<div class="card glass">${ch('cart','var(--orange)',trh('in.merchants'),esc(R.label))}${l.length?l.map(x=>`<div class="mrow" data-pay="${esc(x.name)}" role="button" tabindex="0"><span class="sq sm" style="--c-bg:${cat(x.cat).color}2e">${gl(cat(x.cat).emoji,15)}</span><div class="grow"><div class="row sm"><span>${esc(x.name)}</span><span><b class="amt">${money(x.total)}</b></span></div><div class="bar thin"><i style="width:${x.total/max*100}%;background:${cat(x.cat).color}"></i></div><small class="faint">${esc(tr('in.visits',{count:x.n}))}</small></div></div>`).join(''):`<p class="muted sm" style="margin:0">${trh('in.noMerchants')}</p>`}</div>`;
}
function insTrends(R){
  const a=stats(R.a,R.b).byCat,b=stats(R.pa,R.pb).byCat;
  const l=Object.entries(a).sort((x,y)=>y[1]-x[1]).slice(0,6),max=l[0]?l[0][1]:1;
  return`<div class="card glass">${ch('trend','var(--indigo)',trh('in.trends'),trh('in.trendsVs'))}${l.length?l.map(([id,v])=>{const o=b[id]||0,c=o>0?(v-o)/o:null;return`<div class="mrow" data-cat="${id}" role="button" tabindex="0"><span class="sq sm" style="--c-bg:${cat(id).color}2e">${gl(cat(id).emoji,15)}</span><div class="grow"><div class="row sm"><span>${esc(cat(id).name)}</span><span><b class="amt">${money(v)}</b>${c==null?`<span class="chip">${trh('in.new')}</span>`:Math.abs(c)>=.01?`<span class="chip ${c>0?'bad':'good'}">${icon(c>0?'arrowup':'arrowdown',10,2.6)} ${pct(Math.abs(c))}</span>`:''}</span></div><div class="bar thin"><i style="width:${v/max*100}%;background:${cat(id).color}"></i></div></div></div>`;}).join(''):`<p class="muted sm" style="margin:0">${trh('in.noSpend')}</p>`}</div>`;
}
function insWhatIf(){
  const avg=lastMonthsAvgByCat(3),cats=S.categories.filter(c=>c.type==='expense'&&avg[c.id]>0).sort((a,b)=>avg[b.id]-avg[a.id]).slice(0,10);
  if(!cats.length)return`<div class="card glass">${ch('wand','var(--purple)',trh('in.wi.title'))}<p class="muted sm" style="margin:0">${trh('in.wi.empty')}</p></div>`;
  INS_CUT.cats=INS_CUT.cats.filter(id=>cats.some(c=>c.id===id));if(!INS_CUT.cats.length)INS_CUT.cats=[cats[0].id];
  return`<div class="card glass">${ch('wand','var(--purple)',trh('in.wi.title'))}<div class="faint sm" style="margin-bottom:10px">${trh('in.wi.pick')}</div>
   <div class="wi-chips">${cats.map(c=>`<button class="wi-chip ${INS_CUT.cats.includes(c.id)?'on':''}" data-wc="${c.id}" aria-pressed="${INS_CUT.cats.includes(c.id)}"><span>${esc(c.name)}</span><small>${money(avg[c.id])}</small></button>`).join('')}</div>
   <label class="f" style="margin-top:16px">${trh('in.wi.by')} <b id="wi_p" style="color:var(--text)">${INS_CUT.pct}%</b></label><input id="wi_s" type="range" min="5" max="100" step="5" value="${INS_CUT.pct}" aria-label="${trh('in.wi.by')}">
   <div class="grid g3 wi-out"><div><small>${trh('in.wi.month')}</small><b class="amt good" id="wi1"></b></div><div><small>${trh('in.wi.year')}</small><b class="amt good" id="wi2"></b></div><div><small>${trh('in.wi.ten')}</small><b class="amt good" id="wi3"></b></div></div>
   <div class="wi-goal" id="wi_g"></div></div>`;
}
function wireWhatIf(v){
  const s=$('#wi_s',v);if(!s)return;const avg=lastMonthsAvgByCat(3);
  const upd=()=>{
    const m=sum(INS_CUT.cats,id=>avg[id]||0)*INS_CUT.pct/100,r=.07/12,fv=m*((Math.pow(1+r,120)-1)/r);
    $('#wi_p',v).textContent=INS_CUT.pct+'%';$('#wi1',v).textContent=money(m);$('#wi2',v).textContent=money(m*12);$('#wi3',v).textContent=money(fv);
    const pl=planning(),surplus=Math.max(0,pl.income-pl.expenses),g=S.goals.find(g=>g.target>g.saved);let txt='';
    if(g&&m>0){const left=g.target-g.saved,before=surplus>0?Math.ceil(left/surplus):null,after=Math.ceil(left/(surplus+m));
      txt=before==null?tr('in.wi.goalNew',{name:g.name,count:after}):before>after?tr('in.wi.goal',{name:g.name,count:before-after,after:String(after)}):'';}
    $('#wi_g',v).innerHTML=txt?`${icon('star',15)}<span>${esc(txt)}</span>`:'';$('#wi_g',v).style.display=txt?'':'none';
  };
  s.oninput=()=>{INS_CUT.pct=+s.value;upd();};
  $$('[data-wc]',v).forEach(b=>b.onclick=()=>{const id=b.dataset.wc,i=INS_CUT.cats.indexOf(id);if(i>=0){if(INS_CUT.cats.length>1)INS_CUT.cats.splice(i,1);}else INS_CUT.cats.push(id);b.classList.toggle('on',INS_CUT.cats.includes(id));b.setAttribute('aria-pressed',INS_CUT.cats.includes(id));upd();});
  upd();
}

PAGES.insights={title:'Insights',
 render(){
  const R=insRange(),all=insightList(R),vis=all.filter(i=>!isInsHidden(i.id)),hidden=all.length-vis.length;
  const att=vis.filter(i=>i.g==='att'),good=vis.filter(i=>i.g==='good'),info=vis.filter(i=>i.g==='info');
  const seg=`<div class="seg" role="tablist" aria-label="${trh('in.r.aria')}">${['period','3m','year'].map(k=>`<button role="tab" aria-selected="${INS_RANGE===k}" class="${INS_RANGE===k?'on':''}" data-r="${k}">${trh('in.r.'+k)}</button>`).join('')}</div>`;
  return`<div class="page wrap ins-page">${lt(trh('nav.insights'),trh('in.sub'),seg)}
   ${insRecap(R)}
   <div class="grid g-main" style="margin-top:6px"><div>
    ${att.length?'':`<div class="ins-allclear">${icon('check',18,2.6)}<span>${trh('in.allClear')}</span></div>`}
    ${insGroup('att',att)}${insGroup('good',good)}${insGroup('info',info,4)}
    ${hidden?`<button class="ins-hidden" id="in_unhide">${trh('in.hiddenN',{n:hidden})}</button>`:''}
   </div><div>${insHealth()}${insMerchants(R)}${insTrends(R)}</div></div>
   <div class="grid g2"><div><div class="sec-h">${trh('in.ivs')}</div><div class="card glass"><div class="bars-wrap"><div class="chart" id="bars"></div><div class="bar-hits" id="bhits"></div></div><div class="legend h" style="margin-top:10px"><div><i style="background:var(--green)"></i>${trh('in.recap.in')}</div><div><i style="background:var(--accent)"></i>${trh('in.recap.out')}</div><div class="faint sm">${trh('in.tapBar')}</div></div></div></div>
    <div><div class="sec-h">${trh('in.wi.sec')}</div>${insWhatIf()}</div></div>
   <div class="grid g2"><div><div class="sec-h">${trh('in.forecast')}${whyBtn('forecast')}</div><div class="card glass"><div class="chart" id="fc2"></div><div class="hint">${(()=>{const f=forecast(60);return trh('fc.hint',{daily:money(f.daily),low:money(f.minLow.y),conf:tr('why.conf.'+f.confidence)})+(f.excluded.length?' '+trh('fc.excl',{count:f.excluded.length}):'');})()}</div></div></div>
    <div><div class="sec-h">${esc(tr('in.heat',{label:periodFor(today()).label}))}</div><div class="card glass">${heatmap()}</div></div></div></div>`;
 },
 after(v){
  const R=insRange(),list=insightList(R);
  $$('[data-r]',v).forEach(b=>b.onclick=()=>{INS_RANGE=b.dataset.r;INS_MORE=false;refresh();});
  const wc=$('#in_wc',v);if(wc)wc.onclick=()=>openWhatChanged(R);
  const rp=$('#in_rep',v);if(rp)rp.onclick=()=>go('report');
  const mo=$('#in_more',v);if(mo)mo.onclick=()=>{INS_MORE=true;refresh();};
  const uh=$('#in_unhide',v);if(uh)uh.onclick=()=>{insUnhideAll();refresh();toast(tr('in.unhidden'));};
  $$('.ins-item',v).forEach(el=>{const it=list.find(i=>i.id===el.dataset.id);if(!it)return;
    $$('[data-a]',el).forEach(b=>b.onclick=()=>{const a=it.act[+b.dataset.a];if(a.dismiss){insHide(it.id,0);hideRow(el);toast(tr('in.dismissed'),{action:tr('common.undo'),fn:()=>{const h={...insHidden()};delete h[it.id];S.settings.insHide=h;save();refresh();}});}else a.fn&&a.fn();});
    const m=$('[data-m]',el),pop=$('.ins-pop',el);
    m.onclick=e=>{e.stopPropagation();$$('.ins-pop',v).forEach(p=>{if(p!==pop)p.hidden=true;});pop.hidden=!pop.hidden;};
    $$('[data-h]',pop).forEach(b=>b.onclick=()=>{insHide(it.id,+b.dataset.h);hideRow(el);toast(tr(+b.dataset.h?'in.snoozed':'in.dismissed'),{action:tr('common.undo'),fn:()=>{const h={...insHidden()};delete h[it.id];S.settings.insHide=h;save();refresh();}});});
  });
  if(!v._insPop){v._insPop=1;v.addEventListener('click',()=>$$('.ins-pop',v).forEach(p=>p.hidden=true));}
  $$('.mrow[data-pay]',v).forEach(e=>{const go_=()=>rangeTx(R,{payee:e.dataset.pay});e.onclick=go_;e.onkeydown=k=>{if(k.key==='Enter')go_();};});
  $$('.mrow[data-cat]',v).forEach(e=>{const go_=()=>rangeTx(R,{cat:e.dataset.cat});e.onclick=go_;e.onkeydown=k=>{if(k.key==='Enter')go_();};});
  // income vs spending, last 6 periods; a click on a month opens its transactions
  const groups=[],ps=[];for(let i=-5;i<=0;i++){const p=periodFor(today(),i),s=stats(p.start,p.end);ps.push(p);groups.push({label:FMT.dateFmt({month:'short'}).format(pd(p.start)),inc:s.inc,exp:s.exp});}
  drawBars($('#bars',v),groups,[{key:'inc',color:getComputedStyle(document.documentElement).getPropertyValue('--green').trim()||'#2BB89A',label:tr('in.recap.in')},{key:'exp',color:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#0A7F66',label:tr('in.recap.out')}],{h:230});
  const bh=$('#bhits',v);if(bh){bh.innerHTML=ps.map((p,i)=>`<button data-p="${i}" aria-label="${esc(groups[i].label)}" title="${esc(groups[i].label)}"></button>`).join('');$$('[data-p]',bh).forEach(b=>b.onclick=()=>{const p=ps[+b.dataset.p];showTx({range:'custom',from:p.start,to:p.end});});}
  const f=forecast(60);drawArea($('#fc2',v),f.pts,{h:210,color:'var(--teal)',markMin:true,min:f.min,zero:true,band:{lo:f.lo,hi:f.hi}});
  wireWhatIf(v);
 }};
function hideRow(el){el.classList.add('gone');setTimeout(()=>refresh(),260);}

/* dashboard card: the top findings, same engine */
DW.insights=()=>{const l=insightList().filter(i=>!isInsHidden(i.id)).slice(0,4);
  return`<div class="card glass">${ch('sparkles','var(--purple)',trh('in.dash'),more('insights',trh('in.more2')))}${l.map(i=>`<div class="ins-item mini g-${i.g}"><div class="ins-ic">${icon(i.ic,16,2.1)}</div><div class="grow"><b>${esc(i.title)}</b><span>${esc(i.text)}</span></div></div>`).join('')||emptyBox('✨',tr('in.nothing'))}</div>`;};
