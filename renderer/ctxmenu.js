'use strict';
/* =========================================================================
   Right-click menu (1.10). One themed menu for the whole app; what it offers depends on what you clicked:
   text fields (cut / copy / paste), selected text, a transaction, account, budget, goal, bill, reminder or category,
   an amount, a sidebar page, and general actions everywhere else. Works from the keyboard too (Menu key or Shift+F10),
   with arrow keys, Enter and Esc. Follows Light / Dark, right-to-left and "reduce motion".
   ========================================================================= */
let _ctx=null;
const ctxCopy=async(text,msg)=>{try{await navigator.clipboard.writeText(String(text));toast(msg||tr('ctx.copied'));}catch{toast(tr('ctx.copyFail'));}};
const ctxEdit=c=>{if(hasNative&&native.edit)native.edit(c);else document.execCommand(c);};
function ctxClose(){
  if(!_ctx)return;const m=_ctx;_ctx=null;m.off();
  m.el.classList.add('out');setTimeout(()=>m.el.remove(),motionOK()?120:0);
  try{m.back&&m.back.focus&&document.contains(m.back)&&m.back.focus({preventScroll:true});}catch{}
}
/* items: {t,ic,k(hint),fn,danger,off} | '-' (separator) | {head} */
function ctxOpen(items,x,y,back){
  ctxClose();
  items=items.filter(Boolean);while(items[0]==='-')items.shift();while(items[items.length-1]==='-')items.pop();
  items=items.filter((it,i)=>!(it==='-'&&items[i-1]==='-'));
  if(!items.length)return;
  const el=document.createElement('div');el.className='ctx-menu';el.setAttribute('role','menu');
  el.innerHTML=items.map((it,i)=>it==='-'?'<div class="ctx-sep" role="separator"></div>':it.head?`<div class="ctx-head">${esc(it.head)}</div>`
    :`<button class="ctx-i${it.danger?' danger':''}" role="menuitem" data-i="${i}" ${it.off?'disabled aria-disabled="true"':''} tabindex="-1"><span class="ctx-ic">${it.ic?icon(it.ic,15,2.1):''}</span><span class="ctx-t">${esc(it.t)}</span>${it.k?`<kbd>${esc(it.k)}</kbd>`:''}</button>`).join('');
  document.body.appendChild(el);
  const W=el.offsetWidth,H=el.offsetHeight,vw=innerWidth,vh=innerHeight,rtl=document.dir==='rtl';
  let L=rtl?x-W:x,T=y;if(L+W>vw-8)L=x-W;if(L<8)L=Math.min(vw-W-8,Math.max(8,x));if(T+H>vh-8)T=Math.max(8,y-H);
  el.style.left=L+'px';el.style.top=T+'px';el.style.transformOrigin=`${x<L+W/2?'left':'right'} ${y<T+H/2?'top':'bottom'}`;
  const btns=$$('.ctx-i:not([disabled])',el);
  const run=i=>{const it=items[i];ctxClose();if(it&&it.fn)setTimeout(()=>it.fn(),0);};
  el.onclick=e=>{const b=e.target.closest('.ctx-i');if(b&&!b.disabled)run(+b.dataset.i);};
  el.onmousemove=e=>{const b=e.target.closest('.ctx-i');if(b&&!b.disabled&&document.activeElement!==b)b.focus({preventScroll:true});};
  const kd=e=>{
    if(!_ctx)return;const i=btns.indexOf(document.activeElement);
    if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();ctxClose();}
    else if(e.key==='ArrowDown'){e.preventDefault();btns[(i+1)%btns.length].focus();}
    else if(e.key==='ArrowUp'){e.preventDefault();btns[i<=0?btns.length-1:i-1].focus();}
    else if(e.key==='Home'){e.preventDefault();btns[0].focus();}else if(e.key==='End'){e.preventDefault();btns[btns.length-1].focus();}
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(i>=0)run(+btns[i].dataset.i);}
    else if(e.key.length===1){const k=e.key.toLowerCase(),start=i+1,list=[...btns.slice(start),...btns.slice(0,start)],m=list.find(b=>b.textContent.trim().toLowerCase().startsWith(k));if(m){e.preventDefault();m.focus();}}
    e.stopPropagation();
  };
  const down=e=>{if(!el.contains(e.target))ctxClose();};
  const away=()=>ctxClose();
  document.addEventListener('keydown',kd,true);document.addEventListener('mousedown',down,true);
  window.addEventListener('blur',away);window.addEventListener('resize',away);document.addEventListener('scroll',away,true);
  _ctx={el,back,off:()=>{document.removeEventListener('keydown',kd,true);document.removeEventListener('mousedown',down,true);window.removeEventListener('blur',away);window.removeEventListener('resize',away);document.removeEventListener('scroll',away,true);}};
  requestAnimationFrame(()=>el.classList.add('on'));
  el.tabIndex=-1;if(back===null&&btns[0])btns[0].focus({preventScroll:true});else el.focus({preventScroll:true});   // keyboard: first item; mouse: the menu, so arrows still work
}

/* ---------- what to offer ---------- */
function txFilterShow(patch){Object.assign(F,F_DEFAULT,{range:'all'},patch);go('transactions');}
function ctxItems(target){
  const L=[],sel=String(getSelection()||'').trim(),edit=target.closest('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),textarea,[contenteditable=true]');
  if(edit){
    const ro=edit.readOnly||edit.disabled,has=edit.value!==undefined?edit.selectionStart!==edit.selectionEnd:!!sel;
    L.push({t:tr('ctx.undo'),ic:'undo',k:'Ctrl Z',fn:()=>{edit.focus();ctxEdit('undo');},off:ro},'-',
      {t:tr('ctx.cut'),ic:'scissors',k:'Ctrl X',fn:()=>{edit.focus();ctxEdit('cut');},off:ro||!has},
      {t:tr('ctx.copy'),ic:'copy',k:'Ctrl C',fn:()=>{edit.focus();ctxEdit('copy');},off:!has},
      {t:tr('ctx.paste'),ic:'paste',k:'Ctrl V',fn:()=>{edit.focus();ctxEdit('paste');},off:ro},
      {t:tr('ctx.selectAll'),ic:'selectall',k:'Ctrl A',fn:()=>{edit.focus();edit.select?edit.select():ctxEdit('selectAll');}});
    return L;
  }
  if(!S)return L;
  if(sel&&sel.length<200){
    L.push({t:tr('ctx.copy'),ic:'copy',k:'Ctrl C',fn:()=>ctxCopy(sel)},{t:tr('ctx.searchFor',{text:sel.length>24?sel.slice(0,23)+'…':sel}),ic:'search',fn:()=>openCmd(sel)},'-');
  }
  const D=k=>{const e=target.closest(`[data-${k}]`);return e&&e.dataset[k.replace(/-(\w)/g,(_,c)=>c.toUpperCase())];};
  const txId=D('tx')||D('selid'),t=txId&&S.transactions.find(x=>x.id===txId);
  if(t){
    L.push({head:txTitle(t)},
      {t:tr('ctx.tx.edit'),ic:'edit',k:'Enter',fn:()=>openTx(t)},
      {t:tr('ctx.tx.dup'),ic:'copy',fn:()=>{const{id,bankId,fitid,importId,billId,...rest}=t;openTx(null,{...rest,date:today()});}},
      attOK()?{t:tr('ctx.tx.attach'),ic:'clip',fn:()=>attachToTx(t)}:null,
      t.files&&t.files.length?{t:tr('att.count',{count:t.files.length}),ic:'file',fn:()=>t.files.length===1?openAttachment(t.files[0]):openTx(t)}:null,
      {t:tr('ctx.copyAmount'),ic:'coins',fn:()=>ctxCopy(money(t.amount))},
      t.merchant?{t:tr('ctx.tx.payee',{name:t.merchant.length>22?t.merchant.slice(0,21)+'…':t.merchant}),ic:'list',fn:()=>txFilterShow({payee:t.merchant})}:null,
      t.type!=='transfer'&&t.category?{t:tr('ctx.tx.cat',{name:cat(t.category).name}),ic:'tag',fn:()=>txFilterShow({cat:t.category})}:null,
      '-',{t:tr('ctx.tx.del'),ic:'trash',danger:true,fn:()=>undoable(tr('ctx.tx.deleted'),()=>{S.transactions=S.transactions.filter(x=>x.id!==t.id);})});
    return L;
  }
  const a=D('acc')&&acc(D('acc'));
  if(a){L.push({head:a.name},{t:tr('ctx.acc.edit'),ic:'edit',fn:()=>openAcc(a)},{t:tr('ctx.acc.add'),ic:'plus',fn:()=>openTx(null,{accountId:a.id})},{t:tr('ctx.acc.tx'),ic:'list',fn:()=>txFilterShow({acc:a.id})});return L;}
  const cId=D('bud')||D('cat'),c=cId&&S.categories.find(x=>x.id===cId);
  if(c){L.push({head:c.name},{t:tr('ctx.cat.budget'),ic:'target',fn:()=>editBudget(c)},{t:tr('ctx.cat.tx'),ic:'list',fn:()=>txFilterShow({cat:c.id})},{t:tr('ctx.cat.add'),ic:'plus',fn:()=>openTx(null,{type:c.type||'expense',category:c.id})});return L;}
  const gId=D('goal')||D('fund'),g=gId&&S.goals.find(x=>x.id===gId);
  if(g){L.push({head:g.name},{t:tr('ctx.goal.fund'),ic:'piggy',fn:()=>openFunds(g)},{t:tr('ctx.goal.edit'),ic:'edit',fn:()=>openGoal(g)});return L;}
  const bId=D('bill')||D('pay'),b=bId&&S.bills.find(x=>x.id===bId);
  if(b){L.push({head:b.name},{t:tr('ctx.bill.edit'),ic:'edit',fn:()=>openBill(b)},{t:tr('ctx.bill.pay'),ic:'check',fn:()=>{postBill(b,b.next);b.next=stepBill(b.next,b.freq,b.anchor);changed();toast(tr('bill.recorded',{name:b.name}));}},{t:tr('ctx.bill.tx'),ic:'list',fn:()=>txFilterShow({payee:b.name})});return L;}
  const r=D('rid')&&(S.reminders||[]).find(x=>x.id===D('rid'));
  if(r){L.push({head:r.title},!r.done?{t:tr('ctx.rem.done'),ic:'check',fn:()=>completeReminder(r)}:null,!r.done?{t:tr('ctx.rem.snooze'),ic:'clock',fn:()=>snoozeReminder(r,60)}:null,{t:tr('ctx.rem.edit'),ic:'edit',fn:()=>openReminder(r)});return L;}
  const nav=target.closest('#side [data-nav]');
  if(nav){const k=nav.dataset.nav,i=NAV.findIndex(n=>n[0]===k);L.push({t:tr('ctx.open'),ic:'chevron',k:i<9?'Alt '+(i+1):i===NAV.length-1?'Alt 0':'',fn:()=>go(k)});
    if(k==='transactions')L.push({t:tr('cmd.newTx'),ic:'plus',k:'N',fn:()=>openTx()});
    if(k==='reminders')L.push({t:tr('cmd.newReminder'),ic:'bell',fn:()=>openReminder()});
    if(k==='goals')L.push({t:tr('cmd.newGoal'),ic:'star',fn:()=>openGoal()});
    if(k==='accounts')L.push({t:tr('cmd.newAccount'),ic:'card',fn:()=>openAcc()});
    return L;}
  const am=target.closest('.amt,.big,.kpi .mid');
  if(am&&!S.settings.privacy&&/\d/.test(am.textContent))L.push({t:tr('ctx.copyAmount'),ic:'coins',fn:()=>ctxCopy(am.textContent.trim())},'-');
  // everywhere else: the things people reach for most
  const dark=document.documentElement.dataset.theme==='dark';
  L.push({t:tr('cmd.newTx'),ic:'plus',k:'N',fn:()=>openTx()},{t:tr('ctx.ask'),ic:'search',k:'Ctrl K',fn:()=>openCmd()},
    cur==='transactions'?{t:tr('ctx.find'),ic:'search',k:'/',fn:()=>{const f=$('#fq');if(f){f.focus();f.select();}}}:null,'-',
    {t:tr(S.settings.privacy?'ctx.showAmounts':'ctx.hideAmounts'),ic:S.settings.privacy?'eye':'eyeoff',k:'P',fn:togglePriv},
    {t:tr(dark?'ctx.light':'ctx.dark'),ic:dark?'sun':'moon',fn:()=>setTheme(dark?'light':'dark')},
    $('#view').scrollTop>200?{t:tr('jump.top'),ic:'arrowup',k:'Home',fn:()=>$('#view').scrollTo({top:0,behavior:motionOK()?'smooth':'auto'})}:null,
    '-',{t:tr('cmd.lock'),ic:'lock',k:'Ctrl L',fn:lockApp},
    hasCommunity()?{t:tr('cm.menu'),ic:'chat',fn:joinCommunity}:null);
  return L;
}
document.addEventListener('contextmenu',e=>{
  if(e.target.closest('.ctx-menu')){e.preventDefault();return;}
  const lock=$('#lock')&&$('#lock').classList.contains('on'),modal=$('#modal').classList.contains('on')||$('#cmd').classList.contains('on')||$('.tour-root');
  const edit=e.target.closest('input,textarea,[contenteditable=true]');
  if((lock||modal)&&!edit){e.preventDefault();ctxClose();return;}   // dialogs: only text fields get a menu
  e.preventDefault();
  const kb=!e.clientX&&!e.clientY;let x=e.clientX,y=e.clientY;
  if(kb){const r=(document.activeElement||e.target).getBoundingClientRect();x=r.left+Math.min(24,r.width/2);y=r.top+Math.min(r.height,30);}
  const back=document.activeElement;
  ctxOpen(ctxItems(e.target),x,y,kb?null:back);
});
