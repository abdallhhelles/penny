'use strict';
/* NAV: [page id, icon, translation key, colour]. Labels live in renderer/locales/*.json (nav.<page id>). */
const NAV=[['dashboard','home','nav.dashboard','#0A7F66'],['transactions','list','nav.transactions','#30D158'],['accounts','card','nav.accounts','#BF5AF2'],['budgets','target','nav.budgets','#FF9F0A'],['goals','star','nav.goals','#FF375F'],['reminders','bell','nav.reminders','#FF453A'],['bills','repeat','nav.bills','#32ADE6'],['calendar','calendar','nav.calendar','#FF453A'],['insights','sparkles','nav.insights','#5E5CE6'],['report','shield','nav.report','#0A7F66'],['plan','bolt','nav.plan','#FFD60A'],['settings','sliders','nav.settings','#8E8E93']];
let cur='dashboard';
let UPD={status:'idle'},_updToast='';
function updLabel(u){const v=u.available||'';return{idle:tr('upd.idle'),checking:tr('upd.checking'),uptodate:tr('upd.uptodate'),downloading:tr('upd.downloading',{version:v}),verifying:tr('updx.verifying'),ready:tr('upd.ready',{version:v}),error:u.error||tr('upd.error'),offline:tr('updx.offline'),unconfigured:tr('upd.unconfigured'),"needs-installer":tr('upd.needsInstaller',{version:v})}[u.status]||''}
function onUpdate(u){
  UPD=u||{status:'idle'};renderUpdPill();refreshUpdSheet();
  const st=$('#upd_stat');if(st&&cur==='settings'){const c=st.closest('.upd-card');if(c){c.outerHTML=updCardHtml();wireUpdCard();}}
  if(u.status==='ready'&&_updToast!==u.available){_updToast=u.available;if(!$('#modal .upd-sheet'))toast(tr('upd.readyToast',{version:u.available}),{action:tr('updx.see'),fn:openUpdateSheet,ms:12000});}
}
function wireUpdCard(){
  const c=$('#upd_check'),o=$('#upd_open');
  if(c)c.onclick=async()=>{onUpdate({...UPD,status:'checking'});const u=await native.updCheck();onUpdate(u);if(u.status==='uptodate')toast(tr('upd.uptodate'));};
  if(o)o.onclick=()=>UPD.status==='ready'?applyUpdate():openUpdateSheet();
}
async function applyUpdate(){saveNow();native.updApply();}

function hexRgb(h){const m=h.replace('#','');const n=parseInt(m.length===3?m.split('').map(c=>c+c).join(''):m,16);return[(n>>16)&255,(n>>8)&255,n&255];}
function applySettings(){
  const s=S.settings,r=document.documentElement;
  const theme=s.theme==='auto'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):s.theme;
  r.dataset.theme=theme;
  r.style.setProperty('--accent',s.accent);r.style.setProperty('--accent-rgb',hexRgb(s.accent).join(','));
  r.style.setProperty('--blur',s.blur+'px');
  r.style.setProperty('--glass-a',theme==='light'?(.2+s.opacity/100*2.4).toFixed(2):(s.opacity/100).toFixed(2));
  r.style.setProperty('--pad',{compact:'16px',comfortable:'22px',spacious:'30px'}[s.density]);
  r.style.setProperty('--fs',s.fontSize+'px');r.dataset.bg=s.bg||'aurora';r.dataset.style=s.style==='glass'?'glass':'clean';r.dataset.motion=s.motion||'full';
  const mat=hasNative&&native.platform==='win32'&&s.material!=='none'&&!s.solid;
  r.classList.toggle('mat-on',mat);r.classList.toggle('no-anim',!s.anim);r.classList.toggle('solid',!!s.solid);
  if(hasNative){native.material(s.solid?'none':s.material);native.overlay(theme==='light'?'#000000':'#ffffff');}
  $('#app')?.classList.toggle('compact',s.compact);
  document.body.classList.toggle('priv',s.privacy);
  updatePrivBtn();
}
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(S&&S.settings.theme==='auto')applySettings();});

function updateSideFoot(){const e=$('#sf');if(!e)return;const n=S.settings.name||tr('side.you');e.innerHTML=`${avatarHtml(36)}<div class="txt"><b>${esc(S.settings.nick||n)}</b><small>${S.settings.why?esc(S.settings.why):trh('side.private')}</small></div>`;}
function updatePrivBtn(){const b=$('#privbtn');if(b)b.innerHTML=icon(S.settings.privacy?'eyeoff':'eye',20);}
function updateBadge(){const n=$('[data-nav=bills] .badge');const c=S?dueSoon(3).filter(x=>x.overdue||x.d<=today()).length:0;if(n){n.textContent=c;n.style.display=c?'':'none';}syncNative(c);}
const syncNative=debounce(c=>{if(!hasNative||!S)return;try{const sp=safeToSpend(),left=sp.perDay-sp.spentToday;native.tooltip(S.settings.privacy?tr('tray.tooltipHidden'):tr('tray.tooltipSafe',{amount:money(Math.max(0,left))}));native.badge(c);}catch{}},600);
function buildShell(){
  $('#side').innerHTML=`<div class="brand"><div class="logo">${LOGO_SVG(23)}</div><div><b>Penny</b><small>${trh('shell.tagline')}</small></div></div>${NAV.map(([k,i,l,c],n)=>`<div class="nav" data-nav="${k}" role="button" tabindex="0" title="${trh(l)}${n<9?' (Alt+'+(n+1)+')':n===NAV.length-1?' (Alt+0)':''}"><span class="sq" style="--c:${c}">${icon(i,17,2)}</span><span>${trh(l)}</span>${k==='bills'?'<span class="badge" style="display:none"></span>':''}${k==='plan'&&MONETIZATION.enabled&&!isPro()?'<span class="protag">PRO</span>':''}</div>`).join('')}<div class="spacer"></div><div class="side-foot" id="sf" data-go="settings"></div>`;
  $('#top').innerHTML=`<div class="inline-title" id="ttl"></div><div class="search" id="srch" role="button" tabindex="0">${icon('search',16)}<span>${trh('shell.search')}</span><kbd>Ctrl K</kbd></div><button class="icon-btn" id="privbtn" title="${trh('shell.privacyTitle')}" aria-label="${trh('shell.privacyAria')}"></button><button class="upd-pill" id="updbtn" style="display:none"></button><button class="btn pri" data-act="add">${icon('plus',17,2.4)}${trh('shell.new')}</button>`;
  $('#side').onclick=e=>{const n=e.target.closest('[data-nav]');if(n)go(n.dataset.nav);else if(e.target.closest('[data-go]'))go('settings');};
  $('#side').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){const n=e.target.closest('[data-nav]');if(n){e.preventDefault();go(n.dataset.nav);}}};
  $('#srch').onclick=()=>openCmd();$('#privbtn').onclick=togglePriv;$('#updbtn').onclick=openUpdateSheet;if(hasNative&&native.updGet)native.updGet().then(onUpdate).catch(()=>{});
  $('#top').onclick=e=>{const a=e.target.closest('[data-act]');if(a)act(a.dataset.act);};
  $('#view').onscroll=e=>$('#top').classList.toggle('scrolled',e.target.scrollTop>46);
  updateSideFoot();updatePrivBtn();
}
function go(p){if(p==='settings'&&cur!=='settings'&&setPhone())SET_CAT=null;   /* phones open Settings at the category list */
  const v=$('#view'),same=p===cur;if(!same&&cur)SCROLL_MEM[cur]=v.scrollTop;
  cur=p;$$('.nav').forEach(n=>{const on=n.dataset.nav===p;n.classList.toggle('on',on);on?n.setAttribute('aria-current','page'):n.removeAttribute('aria-current');});placeNavPill();
  $('#ttl').textContent=I18N.exists('nav.'+p)?tr('nav.'+p):PAGES[p].title;render();
  v.scrollTop=same?0:(SCROLL_MEM[p]||0);$('#top').classList.toggle('scrolled',v.scrollTop>46);
  v.classList.add('fresh');clearTimeout(go._t);go._t=setTimeout(()=>v.classList.remove('fresh'),1100);if(!SCROLL_MEM[p])countUp(v);}
function countUp(root){
  if((S.settings.motion||'full')!=='full')return;
  $$('.kpi .mid .amt[data-v],.hero .amt[data-v],.big .amt[data-v]',root).forEach(el=>{const to=+el.dataset.v;if(!isFinite(to)||Math.abs(to)<1)return;const t0=performance.now(),D=750;
    const step=t=>{const k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);el.textContent=money(to*e);if(k<1)requestAnimationFrame(step);else el.textContent=money(to);};requestAnimationFrame(step);});
}
function render(){const v=$('#view');v.innerHTML=PAGES[cur].render();$$('.grid > *',v).forEach((el,i)=>el.style.setProperty('--i',Math.min(i,9)));PAGES[cur].after&&PAGES[cur].after(v);updateBadge();}
/* after a change: update the page in place (motion.js) so nothing flashes; full rebuild only if that fails */
function refresh(){const v=$('#view'),st=v.scrollTop;updateSideFoot();
  try{morphView(v,PAGES[cur].render());$$('.grid > *',v).forEach((el,i)=>el.style.setProperty('--i',Math.min(i,9)));PAGES[cur].after&&PAGES[cur].after(v);updateBadge();}
  catch(e){logErr('in-place refresh failed, rebuilding',e);render();}
  v.scrollTop=st;}
window.addEventListener('resize',debounce(()=>{if(S&&['dashboard','accounts','insights'].includes(cur))refresh();},200));
const togglePriv=()=>{S.settings.privacy=!S.settings.privacy;applySettings();save();if(cur==='settings')refresh();toast(tr(S.settings.privacy?'priv.hidden':'priv.visible'));};

/* ---------- actions & delegation ---------- */
function act(a){
  if(a==='add')openTx();else if(a==='addacc')openAcc();else if(a==='addgoal')openGoal();else if(a==='addbill')openBill();else if(a==='addcat')openCat();else if(a==='autobud')autoBudget();else if(a==='upgrade')openUpgrade();else if(a==='addrem')openReminder();else if(a==='tour')openGuide();else if(a==='nexttip'){S.settings.tipIdx=(S.settings.tipIdx||0)+1;changed();}else if(a==='tipsoff'){S.settings.tipsOff=true;changed();toast(tr('tips.hidden'));}
}
function autoBudget(){
  const avg=lastMonthsAvgByCat(3);const c=S.categories.filter(c=>c.type==='expense'&&!c.budget&&avg[c.id]>0);
  if(!c.length){toast('Not enough history yet, or every category already has a budget');return;}
  openSheet({title:'Suggested Budgets',ok:'Apply All',body:`<p class="muted" style="text-align:center;margin-bottom:14px">Based on your average of the last 3 periods, rounded up with a small saving buffer.</p><div class="fg">${c.map(x=>`<div class="fr"><span class="lic">${gl(x.emoji,20)}</span><label style="flex:1">${esc(x.name)}<small style="display:block" class="muted">usually ${money(avg[x.id])}</small></label><b class="amt">${money(Math.ceil(avg[x.id]*1.05/5)*5)}</b></div>`).join('')}</div>`,
   onOk:()=>{c.forEach(x=>x.budget=Math.ceil(avg[x.id]*1.05/5)*5);closeModal();changed();toast('Budgets created');}});
}
document.addEventListener('click',e=>{
  const v=e.target.closest('#view');if(!v)return;
  const el=e.target.closest('[data-go],[data-act],[data-fund],[data-pay],[data-sug],[data-tx],[data-acc],[data-bud],[data-goal],[data-bill],[data-cat],[data-bo]');if(!el)return;
  const d=el.dataset;if(el.tagName==='A'||el.tagName==='BUTTON')e.preventDefault();
  if(d.go)go(d.go);
  else if(d.bo){budOff=Math.min(0,budOff+ +d.bo);refresh();}
  else if(d.act)act(d.act);
  else if(d.fund)openFunds(S.goals.find(g=>g.id===d.fund));
  else if(d.pay){const b=S.bills.find(x=>x.id===d.pay);postBill(b,b.next);b.next=stepBill(b.next,b.freq,b.anchor);changed();toast(tr('bill.recorded',{name:b.name}));}
  else if(d.sug!==undefined){const s=detectRecurringAll()[+d.sug];if(s)openBill({name:s.name,amount:Math.round(s.amount*100)/100,type:s.type,freq:s.freq,anchor:s.anchor,next:s.next,auto:s.type!=='income'?true:false,accountId:s.accountId,category:s.category},true);}
  else if(d.tx)openTx(S.transactions.find(t=>t.id===d.tx));
  else if(d.acc)openAcc(acc(d.acc));
  else if(d.bud)editBudget(cat(d.bud));
  else if(d.goal&&!e.target.closest('[data-fund]'))openGoal(S.goals.find(g=>g.id===d.goal));
  else if(d.bill)openBill(S.bills.find(b=>b.id===d.bill));
  else if(d.cat)openCat(cat(d.cat));
});

/* ---------- Spotlight: ask, search, commands ---------- */
function openCmd(prefill=''){
  const C=$('#cmd');C.classList.add('on');
  C.innerHTML=`<div class="box glass"><div class="in">${icon('search',22)}<input id="cq" placeholder="${trh('cmd.placeholder')}" autocomplete="off" aria-label="${trh('cmd.aria')}"></div><div class="res" id="cr"></div></div>`;
  C.onmousedown=e=>{if(e.target===C)closeCmd();};
  const items=[...NAV.map(([k,i,l,c])=>({i:icon(i,15,2.2),c,t:tr('cmd.goto',{page:tr(l)}),h:tr('cmd.pageHint'),g:tr('cmd.groupGoto'),run:()=>go(k)})),
    {i:icon('plus',15,2.4),c:'#0A7F66',t:tr('cmd.newTx'),h:'N',g:tr('cmd.groupActions'),run:()=>openTx()},{i:icon('card',15),c:'#BF5AF2',t:tr('cmd.newAccount'),g:tr('cmd.groupActions'),run:()=>openAcc()},{i:icon('star',15),c:'#FF375F',t:tr('cmd.newGoal'),g:tr('cmd.groupActions'),run:()=>openGoal()},{i:icon('repeat',15),c:'#32ADE6',t:tr('cmd.newRecurring'),g:tr('cmd.groupActions'),run:()=>openBill()},{i:icon('tag',15),c:'#FF9F0A',t:tr('cmd.newCategory'),g:tr('cmd.groupActions'),run:()=>openCat()},
    {i:icon('plus',15,2.4),c:'#30D158',t:tr('cmd.addIncome'),g:tr('cmd.groupActions'),run:()=>openTx(null,{type:'income'})},
    {i:icon('bell',15),c:'#FF453A',t:tr('cmd.newReminder'),g:tr('cmd.groupActions'),run:()=>openReminder()},
    {i:icon('sparkles',15),c:'#0A7F66',t:tr('tour.row'),g:tr('cmd.groupActions'),run:()=>startTour()},{i:icon('info',15),c:'#0A7F66',t:tr('cmd.showGuide'),g:tr('cmd.groupActions'),run:()=>openGuide()},
    {i:icon('star',15),c:'#D98A4E',t:tr('cmd.pro'),g:tr('cmd.groupActions'),run:()=>openUpgrade()},
    {i:icon('eyeoff',15),c:'#5E5CE6',t:tr('cmd.togglePrivacy'),h:'P',g:tr('cmd.groupActions'),run:togglePriv},
    {i:icon('palette',15),c:'#5E5CE6',t:tr('cmd.switchTheme'),g:tr('cmd.groupActions'),run:()=>{S.settings.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';applySettings();save();if(cur==='settings')refresh();}},
    {i:icon('lock',15),c:'#8E8E93',t:tr('cmd.lock'),h:'Ctrl L',g:tr('cmd.groupActions'),run:lockApp},{i:icon('down',15),c:'#30D158',t:tr('cmd.exportCsv'),g:tr('cmd.groupActions'),run:()=>exportCSV(S.transactions)}];
  let sel=0,list=[],ans=null;
  const draw=()=>{const raw=$('#cq',C).value,q=raw.toLowerCase().trim();
    ans=q.length>3?askPenny(raw):null;
    list=items.filter(x=>!q||x.t.toLowerCase().includes(q));
    if(q.length>1){S.transactions.filter(t=>`${t.merchant} ${t.note} ${cat(t.category).name}`.toLowerCase().includes(q)).sort((a,b)=>a.date<b.date?1:-1).slice(0,6).forEach(t=>list.push({i:txIcon(t).e,c:txIcon(t).c+'55',t:`${txTitle(t)} · ${money(t.amount)}`,h:dshort(t.date),g:tr('cmd.groupTransactions'),run:()=>openTx(t)}));}
    sel=clamp(sel,0,Math.max(0,list.length-1));
    let html='',lastG='';
    if(ans)html+=`<div class="answer"><div class="lbl">${icon('sparkles',13,2.4)}${trh('cmd.answer')}</div><div class="t">${gl(ans.e,18)} ${esc(ans.title)}</div><div class="d">${esc(ans.text)}</div>${(ans.list&&ans.list.length)?`<div class="mini">${ans.list.map(t=>`<div><span>${esc(txTitle(t))} <span class="faint">· ${dshort(t.date)}</span></span><b class="amt">${money(t.amount)}</b></div>`).join('')}</div>`:''}</div>`;
    list.forEach((x,i)=>{if(x.g!==lastG){lastG=x.g;html+=`<div class="gh">${x.g}</div>`;}html+=`<div class="r ${i===sel?'on':''}" data-i="${i}"><span class="sq ${x.c&&x.c.length<8?'ico':''}" style="--c:${x.c};${x.c&&x.c.length>8?'background:'+x.c:''}">${x.i}</span><span>${esc(x.t)}</span>${x.h?`<small>${esc(x.h)}</small>`:''}</div>`;});
    $('#cr',C).innerHTML=html||`<div class="empty">${trh('cmd.noMatches')}</div>`;
    const on=$('.r.on',C);on&&on.scrollIntoView({block:'nearest'});};
  const run=i=>{const x=list[i];if(!x)return;closeCmd();x.run();};
  $('#cq',C).oninput=()=>{sel=0;draw();};
  $('#cq',C).onkeydown=e=>{if(e.key==='ArrowDown'){sel=Math.min(list.length-1,sel+1);draw();e.preventDefault();}else if(e.key==='ArrowUp'){sel=Math.max(0,sel-1);draw();e.preventDefault();}else if(e.key==='Enter')run(sel);};
  $('#cr',C).onclick=e=>{const r=e.target.closest('.r');if(r)run(+r.dataset.i);};
  $('#cq',C).value=prefill;draw();$('#cq',C).focus();
}
function closeCmd(){const C=$('#cmd');C.classList.remove('on');C.innerHTML='';}
function lockApp(){if(S.settings.pin)showLock();else toast(tr('lock.setPasscode'));}

/* ---------- keyboard ---------- */
document.addEventListener('keydown',e=>{
  if(!S)return;
  const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if(e.key==='Escape'){if($('#cmd').classList.contains('on'))closeCmd();else if($('#modal').classList.contains('on')&&!$('#modal [data-noclose]'))closeModal();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#cmd').classList.contains('on')?closeCmd():openCmd();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'){e.preventDefault();lockApp();return;}
  if(e.altKey&&/^[0-9]$/.test(e.key)){const i=e.key==='0'?NAV.length-1:+e.key-1;if(NAV[i]){go(NAV[i][0]);}return;}
  if(typing||e.ctrlKey||e.metaKey||e.altKey||$('#modal').classList.contains('on')||$('#cmd').classList.contains('on')||$('#lock').classList.contains('on'))return;
  if(e.key==='n'||e.key==='N'){e.preventDefault();openTx();}
  else if(e.key==='p'||e.key==='P')togglePriv();
});

/* ---------- data replace & onboarding ---------- */
async function replaceData(d){
  if(hasNative&&S){
    const r=await native.snapshot('before-change');
    if(r&&r.ok===false&&r.error!=='no-data'){logErr('safety backup failed',r.error);toast('Couldn’t save a safety backup first, so nothing was changed.',{ms:6000});return false;}
  }
  d=normalize(d);S=d;_ver++;setupFmt();applySettings();runBills();saveNow();updateSideFoot();budOff=0;go(cur==='settings'?'settings':'dashboard');return true;
}
const REGION_CUR={US:'USD',GB:'GBP',EG:'EGP',DE:'EUR',FR:'EUR',ES:'EUR',IT:'EUR',NL:'EUR',CA:'CAD',AU:'AUD',SA:'SAR',AE:'AED',IN:'INR',JP:'JPY',TR:'TRY',BR:'BRL',MX:'MXN',CH:'CHF',ZA:'ZAR'};
function onboarding(){
  const reg=(navigator.language.split('-')[1]||'US').toUpperCase();const guess=REGION_CUR[reg]||'USD';
  const lg=LOCALES.find(l=>l[0]===navigator.language)?navigator.language:'en-US';
  openModal(`<div class="sheet" data-noclose><div class="grab"></div><div class="sb" style="padding:26px 28px 30px"><div style="text-align:center"><div class="logo" style="margin:6px auto 16px;width:72px;height:72px;border-radius:22px">${LOGO_SVG(42)}</div><h2 style="font-size:30px;letter-spacing:-.7px">${trh('onb.title')}</h2><p class="muted" style="margin:6px 0 26px;font-size:16px">${trh('onb.sub')}</p></div>
    <div class="fg"><div class="fr"><label>${trh('onb.language')}</label><select id="wl">${langOptions(readLangPref())}</select></div><div class="fr"><label>${trh('onb.name')}</label><input id="wn" placeholder="${trh('common.optional')}"></div><div class="fr"><label>${trh('onb.currency')}</label><select id="wc">${CURRENCIES.map(c=>opt(c,c,c===guess)).join('')}</select></div></div>
    <div style="display:grid;gap:10px;margin-top:22px"><button class="btn pri" id="wf" style="height:50px;font-size:17px">${trh('onb.start')}</button><button class="btn" id="wd" style="height:46px">${trh('onb.demo')}</button></div></div></div>`,s=>{
    $('#modal').onmousedown=null;
    const go_=async demo=>{const name=$('#wn',s).value.trim();const d=demo?demoData(name):freshData(name);d.settings.currency=$('#wc',s).value;d.settings.locale=lg;closeModal();await replaceData(d);setTimeout(()=>startTour(),600);};
    $('#wf',s).onclick=()=>go_(false);$('#wd',s).onclick=()=>go_(true);
    $('#wl',s).onchange=async e=>{await setAppLanguage(e.target.value,{reopen:true});};
    $('#wn',s).focus();$('#wn',s).onkeydown=e=>{if(e.key==='Enter')go_(false);};
  });
}

/* ---------- boot ---------- */
/* ---------- idle lock, focus privacy, native events, reminders ---------- */
let _idleT=null;
function armIdle(){
  clearTimeout(_idleT);const m=S&&S.settings.pin?S.settings.autoLock:0;if(!m)return;
  _idleT=setTimeout(()=>{if(S&&S.settings.pin&&!$('#lock').classList.contains('on'))lockApp();},m*60000);
}
['mousemove','keydown','mousedown','wheel','touchstart'].forEach(ev=>document.addEventListener(ev,debounce(()=>armIdle(),400),{passive:true}));
window.addEventListener('blur',()=>{if(S&&S.settings.blurOnLeave)document.body.classList.add('away');});
window.addEventListener('focus',()=>document.body.classList.remove('away'));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&S&&S.settings.lockOnMinimize&&S.settings.pin)lockApp();});
function quickAddNow(kind){
  if(!S||$('#lock').classList.contains('on'))return;
  closeCmd();if($('#modal').classList.contains('on'))closeModal();
  setTimeout(()=>openTx(null,{type:kind==='income'?'income':'expense'}),60);
}
function showAfterUnlock(fn){if($('#lock').classList.contains('on')){const w=setInterval(()=>{if(!$('#lock').classList.contains('on')){clearInterval(w);fn();}},400);}else fn();}
function hookNative(){
  if(!hasNative||!native.onEvent)return;
  native.onEvent((name,arg)=>{if(name==='update-state'){onUpdate(arg);return;}if(!S)return;if(name==='quick-add')quickAddNow(arg);else if(name==='privacy')togglePriv();else if(name==='lock')lockApp();else if(name==='navigate'&&arg&&arg.scat){showAfterUnlock(()=>{SET_CAT=arg.scat;go(arg.page||'settings');});}else if(name==='navigate'){showAfterUnlock(()=>{go(arg.page||'reminders');const r=S.reminders.find(x=>x.id===arg.id);if(r)openRemAction(r);});}});
  native.ready&&native.ready();
}
function checkReminders(){
  if(!hasNative||!S)return;
  const hide=$('#lock').classList.contains('on')||S.settings.privacy;
  const st=S.settings,h=new Date().getHours(),t=today();
  if(st.notify&&h>=st.remindHour&&st.lastNotified!==t){
    const due=dueSoon(st.remindDays||3);
    st.lastNotified=t;saveNow();
    if(due.length){const first=hide?tr('notif.openToSee'):due.slice(0,3).map(x=>tr('notif.billItem',{name:x.b.name,amount:money(x.b.amount),when:x.overdue?tr('notif.overdue'):relDate(x.d).toLocaleLowerCase(I18N.lang)})).join(' · ');
      native.notify({title:tr('notif.billsDue',{count:due.length}),body:first});}
  }
  if(st.weeklyDigest&&pd(t).getDay()===1&&h>=st.remindHour&&st.lastDigest!==t&&S.transactions.length){
    st.lastDigest=t;saveNow();const w=lastWeekSummary();
    if(w.n)native.notify({title:tr('notif.weekTitle'),body:hide?tr('notif.weekOpen'):tr('notif.week'+(w.inc?'Earned':'')+(w.top?'Top':''),{spent:money(w.exp),earned:money(w.inc),category:w.top?cat(w.top[0]).name:''})});
  }
}

(async function boot(){
  if(hasNative){try{Object.assign(SYS,await native.sysGet());}catch{}}
  await initI18n();   // language first: every screen below (even error screens) is translated
  await loadLicense();
  hookNative();
  await vaultRefresh();
  let d,unlockedBy=null;
  try{
    d=await loadData();
    if(d&&d.__locked){const u=await vaultUnlockScreen(d.vault);unlockedBy=u.how;d=u.data?await prepData(u.data):null;}
  }catch(e){
    logErr('could not open data',e);
    try{S=freshData('');setupFmt();applySettings();}catch{} // only so the screen can render; S is cleared below so nothing can be saved
    openModal(`<div class="alert" data-noclose><h3>${trh('err.openTitle')}</h3><p>${trh('err.openBody')}</p><div class="bt">${hasNative?`<button id="of">${trh('err.openFolder')}</button>`:''}<button id="ok">${trh('common.close')}</button></div></div>`,s=>{$('#modal').onmousedown=null;const o=$('#of',s);if(o)o.onclick=()=>native.openDataFolder();$('#ok',s).onclick=()=>window.close();});
    S=null;return;
  }
  if(d&&d.__damaged){
    S=freshData('');setupFmt();applySettings();buildShell();go('dashboard');
    openModal(`<div class="alert" data-noclose><h3>${trh('err.damagedTitle')}</h3><p>${trh('err.damagedBody')}</p><div class="bt"><button id="ok">${trh('err.startFresh')}</button></div></div>`,s=>{$('#modal').onmousedown=null;$('#ok',s).onclick=()=>{closeModal();onboarding();};});
    return;
  }
  if(d&&d.__newer){
    S=freshData('');setupFmt();applySettings();
    openModal(`<div class="alert" data-noclose><h3>${trh('err.newerTitle')}</h3><p>${trh('err.newerBody',{schema:String(d.schema)})}</p><div class="bt"><button id="ok">${trh('common.close')}</button></div></div>`,s=>{$('#modal').onmousedown=null;$('#ok',s).onclick=()=>window.close();});
    S=null;return;
  }
  if(!d){S=freshData('');setupFmt();applySettings();buildShell();go('dashboard');onboarding();return;}
  S=d;setupFmt();buildShell();applySettings();
  const n=runBills();if(n)saveNow();
  go('dashboard');
  if(unlockedBy==='recovery'){S.settings.pin=null;saveNow();setTimeout(()=>{toast(tr('lock.recovered'),{ms:7000});openPinSetup();},700);}
  else if(!unlockedBy)showLock();
  if(d.__rec)setTimeout(()=>toast(tr('err.recovered',{name:d.__rec.replace('penny-','').replace('.json','')}),{ms:6500}),500);
  else if(n)setTimeout(()=>toast(tr('bills.posted',{count:n})),600);
  armIdle();setTimeout(()=>{checkReminders();tickReminders();},2500);setInterval(()=>tickReminders(),30000);setInterval(()=>{if(S){const n=runBills();if(n){saveNow();refresh();}}checkReminders();},10*60*1000);
})();
