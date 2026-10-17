'use strict';
/* ---------- sheets, alerts, toasts ---------- */
function openModal(html,mount){
  const m=$('#modal');m.innerHTML=html;m.classList.add('on');m.onmousedown=e=>{if(e.target===m)closeModal()};
  mount&&mount($('#modal > *'));return $('#modal > *');
}
function closeModal(){const m=$('#modal');try{modalExit();}catch{}m.classList.remove('on');m.innerHTML='';m.onmousedown=null;}
function openSheet({title,ok=tr('common.save'),cancel=tr('common.cancel'),body,mount,onOk}){
  const s=openModal(`<div class="sheet"><div class="grab"></div><div class="sh"><button class="tbtn" id="shx">${cancel}</button><b>${esc(title)}</b>${ok?`<button class="tbtn bold" id="shok">${ok}</button>`:'<span></span>'}</div><div class="sb">${body}</div></div>`);
  $('#shx',s).onclick=closeModal;
  const submit=()=>{if(onOk)onOk(s);};
  if(ok)$('#shok',s).onclick=submit;
  s.onkeydown=e=>{if(e.key==='Enter'&&ok&&!['SELECT','BUTTON'].includes(e.target.tagName)){e.preventDefault();submit();}};
  mount&&mount(s);
  const f=$('input:not([type=hidden]):not([type=checkbox]):not([type=color]):not([type=date])',s);f&&setTimeout(()=>f.focus(),80);
  return s;
}
function toast(msg,o={}){
  if(typeof o==='number')o={ms:o};
  const t=document.createElement('div');t.className='toast';t.innerHTML=`<span>${esc(msg)}</span>${o.action?`<button class="ta">${esc(o.action)}</button>`:''}`;
  $('#toasts').appendChild(t);
  const kill=()=>{t.classList.add('out');setTimeout(()=>t.remove(),320);};
  if(o.action)$('.ta',t).onclick=()=>{o.fn&&o.fn();kill();};
  setTimeout(kill,o.ms||(o.action?5200:2800));
}
function confirmBox(msg,ok=tr('common.delete'),title=tr('confirm.areYouSure')){
  return new Promise(res=>openModal(`<div class="alert"><h3>${esc(title)}</h3><p>${esc(msg)}</p><div class="bt"><button id="n">${trh('common.cancel')}</button><button class="${/delete|erase|remove/i.test(ok)||ok===tr('common.delete')||ok===tr('erase.cta')?'d':''}" id="y">${esc(ok)}</button></div></div>`,s=>{
    $('#n',s).onclick=()=>{closeModal();res(false)};$('#y',s).onclick=()=>{closeModal();res(true)};
    $('#modal').onmousedown=e=>{if(e.target.id==='modal'){closeModal();res(false);}};
  }));
}
function confirmType(msg,word,ok=tr('erase.cta'),title=tr('confirm.absolutelySure')){
  return new Promise(res=>openModal(`<div class="alert"><h3>${esc(title)}</h3><p>${esc(msg)}</p><input id="ct" autocomplete="off" spellcheck="false" placeholder="${trh('confirm.typeToConfirm',{word})}" style="width:100%;margin:6px 0 12px;text-align:center"><div class="bt"><button id="n">${trh('common.cancel')}</button><button class="d" id="y" disabled style="opacity:.45">${esc(ok)}</button></div></div>`,s=>{
    const inp=$('#ct',s),y=$('#y',s);inp.focus();
    inp.oninput=()=>{const typed=inp.value.trim().toUpperCase(),on=typed===word.toUpperCase()||typed==='ERASE'; /* the English word is always accepted, so a keyboard layout can never lock you out */y.disabled=!on;y.style.opacity=on?1:.45;};
    $('#n',s).onclick=()=>{closeModal();res(false)};y.onclick=()=>{if(y.disabled)return;closeModal();res(true)};
    $('#modal').onmousedown=e=>{if(e.target.id==='modal'){closeModal();res(false);}};
  }));
}
function undoable(label,fn){
  const snap=JSON.stringify({accounts:S.accounts,categories:S.categories,transactions:S.transactions,goals:S.goals,bills:S.bills,reminders:S.reminders,rules:S.rules});
  fn();changed();
  toast(label,{action:tr('common.undo'),fn:()=>{Object.assign(S,JSON.parse(snap));changed();toast(tr('common.restored'));}});
}
const opt=(v,l,sel)=>`<option value="${esc(v)}" ${sel?'selected':''}>${esc(l)}</option>`;
const accOpts=sel=>S.accounts.map(a=>opt(a.id,a.name,a.id===sel)).join('');
const changed=()=>{save();refresh();};
const curSym=()=>FMT.currencySymbol();
function emojiPick(id,val){return`<div class="emoji-pick" id="${id}" data-val="${esc(val)}">${PICK_EMOJIS.map(e=>`<span class="${e===val?'on':''}" data-e="${e}">${gl(e,20)}</span>`).join('')}</div>`;}
function wireEmoji(root,id){const box=$('#'+id,root);box.onclick=e=>{const sp=e.target.closest('span[data-e]');if(!sp)return;$$('span',box).forEach(s=>s.classList.remove('on'));sp.classList.add('on');box.dataset.val=sp.dataset.e;};}
function catChips(type,sel){return S.categories.filter(c=>c.type===type).map(c=>`<button type="button" class="cc ${c.id===sel?'on':''}" data-c="${c.id}"><span>${gl(c.emoji,16)}</span>${esc(c.name)}</button>`).join('');}

/* ---------- transaction sheet ---------- */
function openTx(tx,preset){
  if(!S.accounts.length){toast(tr('tx.addAccountFirst'));go('accounts');openAcc();return;}
  const edit=!!tx;
  let t=tx?{...tx}:{type:'expense',date:today(),accountId:S.settings.lastAcc&&acc(S.settings.lastAcc)?S.settings.lastAcc:S.accounts[0].id,amount:'',merchant:'',note:'',category:null,...(preset||{})};
  let manualCat=edit;
  const files=(t.files||[]).map(f=>({...f}));   // attachments while the sheet is open (save handler reads this)
  let splits=null;   // split parts while the sheet is open (shared by the form and the save handler)
  const merchants=[...new Set(S.transactions.map(x=>x.merchant).filter(Boolean))].slice(-100);
  /* one-tap repeats: your most frequent recent payees, with their usual category, account and last amount */
  const recent=edit?[]:(()=>{const m=new Map();[...S.transactions].filter(x=>x.type==='expense'&&x.merchant).sort((x,y)=>x.date<y.date?1:-1).slice(0,250).forEach(x=>{const k=x.merchant.toLowerCase(),e=m.get(k);if(e)e.n++;else m.set(k,{n:1,t:x});});return[...m.values()].sort((x,y)=>y.n-x.n).slice(0,6).map(e=>e.t);})();
  openSheet({title:tr(edit?'tx.edit':'tx.new'),ok:tr(edit?'common.save':'common.add'),
   body:`${edit?'':`<div class="smart">${icon('sparkles',18)}<input id="smart" placeholder="${trh('tx.smartPlaceholder')}"></div>`}
    ${recent.length?`<div class="recent" id="recent" aria-label="${trh('tx.recent')}">${recent.map((x,i)=>`<button type="button" class="rc" data-i="${i}">${gl(cat(x.category).emoji,14)}<span>${esc(x.merchant)}</span></button>`).join('')}</div>`:''}
    <div class="seg" id="tseg"><button class="exp" data-t="expense">${trh('tx.expense')}</button><button class="inc" data-t="income">${trh('tx.income')}</button><button class="trf" data-t="transfer">${trh('tx.transfer')}</button></div>
    <div class="amount-wrap"><small id="amtcur">${trh('tx.amountIn',{currency:accCur(acc(t.accountId))})}</small><input id="amt" class="amount-in" type="number" step="0.01" min="0" placeholder="0" value="${t.amount}"></div>
    <div class="fg"><div class="fr"><label id="merl">${trh('tx.payee')}</label><input id="mer" list="ml" value="${esc(t.merchant)}" placeholder="${trh('tx.payeeExample')}"><datalist id="ml">${merchants.map(m=>`<option value="${esc(m)}">`).join('')}</datalist></div>
      <div class="fr col" id="catw"><label class="f" style="margin:0">${trh('tx.category')}</label><div class="chips" id="chips"></div>
        <div id="splitbox" style="display:none"><div id="splitrows"></div><div class="row sm" style="margin-top:8px"><button type="button" class="link" id="splitadd">${trh('tx.split.add')}</button><span id="splitrem" class="muted amt" style="text-align:right"></span></div></div>
        <button type="button" class="link" id="splitbtn" style="align-self:flex-start;margin-top:4px">${trh('tx.split.start')}</button></div></div>
    <div class="fg"><div class="fr"><label id="accl">${trh('tx.account')}</label><select id="acc">${accOpts(t.accountId)}</select></div>
      <div class="fr" id="tow" style="display:none"><label>${trh('tx.toAccount')}</label><select id="to">${accOpts(t.toAccountId||(S.accounts[1]||S.accounts[0]).id)}</select></div>
       <div class="fr" id="tamw" style="display:none"><label id="taml">${trh('tx.received')}</label><input id="tam" type="number" step="0.01" min="0" value="${t.toAmount||''}" placeholder="${trh('tx.receivedAuto')}"></div>
       <div class="fr"><label>${trh('common.date')}</label><input id="date" type="date" value="${t.date}"></div></div>
    <div class="fg"><div class="fr"><label>${trh('tx.note')}</label><input id="note" value="${esc(t.note||'')}" placeholder="${trh('common.optional')}"></div>
      <div class="fr" id="repw"><label>${trh('tx.repeat')}</label><select id="rep">${['never','weekly','biweekly','monthly','quarterly','yearly'].map(k=>opt(k,tr('tx.rep.'+k),k==='never')).join('')}</select></div></div>
    ${attSection(t.files)}
    ${edit?`<div class="fg"><div class="fr dest" id="del">${trh('tx.delete')}</div></div>`:''}`,
   mount:s=>{
    wireAttach(s,files);
    splits=(t.splits&&t.splits.length)?t.splits.map(x=>({category:x.category,amount:x.amount})):null;
    const catOpts=(type,sel)=>S.categories.filter(c=>c.type===type).map(c=>opt(c.id,c.name,c.id===sel)).join('');
    const curType=()=>t.type==='income'?'income':'expense';
    const readSplits=()=>{if(!splits)return;splits=$$('.spl',s).map(r=>({category:$('.sc',r).value,amount:Math.round((parseFloat($('.sa',r).value)||0)*100)/100}));};
    s._rs=readSplits;   // the save handler (outside mount) reads the rows through this
    const splitRem=()=>{const tot=parseFloat($('#amt',s).value)||0,v=Finance.validateSplits(tot,splits||[]);const el=$('#splitrem',s);el.textContent=splits?(Math.abs(v.diff)<0.005?tr('tx.split.balanced'):tr(v.diff>0?'tx.split.left':'tx.split.over',{amount:money(Math.abs(v.diff))})):'';el.className='amt sm '+(Math.abs(v.diff)<0.005?'good':'bad');};
    const drawSplit=()=>{
      const on=!!splits&&t.type!=='transfer';
      $('#splitbox',s).style.display=on?'':'none';$('#chips',s).style.display=on?'none':'';$('#splitbtn',s).style.display=on||t.type==='transfer'?'none':'';
      if(!on)return;
      $('#splitrows',s).innerHTML=splits.map((x,i)=>`<div class="spl" data-i="${i}"><select class="sc" aria-label="${trh('tx.category')}">${catOpts(curType(),x.category)}</select><input class="sa" type="number" step="0.01" min="0" value="${x.amount||''}" placeholder="0.00" aria-label="${trh('tx.amount')}"><button type="button" class="icon-btn sx" aria-label="${trh('common.delete')}" ${splits.length<=2?'disabled':''}>${icon('x',14)}</button></div>`).join('');
      splitRem();
    };
    const startSplit=()=>{const tot=Math.round((parseFloat($('#amt',s).value)||0)*100)/100,list=S.categories.filter(c=>c.type===curType()),first=t.category||(list[0]||{}).id,other=(list.find(c=>c.id!==first)||{}).id;splits=[{category:first,amount:tot},{category:other,amount:0}];drawSplit();};
    $('#splitbtn',s).onclick=startSplit;
    $('#splitadd',s).onclick=()=>{readSplits();const used=new Set(splits.map(x=>x.category)),c=S.categories.find(c=>c.type===curType()&&!used.has(c.id))||S.categories.find(c=>c.type===curType());splits.push({category:c.id,amount:0});drawSplit();};
    $('#splitrows',s).oninput=()=>{readSplits();splitRem();};
    $('#splitrows',s).onclick=e=>{const b=e.target.closest('.sx');if(!b||b.disabled)return;readSplits();splits.splice(+b.closest('.spl').dataset.i,1);drawSplit();};
    $('#amt',s).addEventListener('input',()=>{if(splits)splitRem();});
    /* a transfer between accounts in different currencies asks what actually arrived */
    const xfer=()=>{const A=acc($('#acc',s).value),B=acc($('#to',s).value),on=t.type==='transfer'&&A&&B&&accCur(A)!==accCur(B);$('#tamw',s).style.display=on?'':'none';if(on)$('#taml',s).textContent=tr('tx.receivedIn',{currency:accCur(B)});$('#amtcur',s).textContent=tr('tx.amountIn',{currency:accCur(A)});};
    $('#acc',s).addEventListener('change',xfer);$('#to',s).addEventListener('change',xfer);
    const fill=()=>{
      $$('#tseg button',s).forEach(b=>b.classList.toggle('on',b.dataset.t===t.type));
      const type=t.type==='income'?'income':'expense';
      const list=S.categories.filter(c=>c.type===type);if(!list.some(c=>c.id===t.category))t.category=(list.find(c=>/other/i.test(c.name))||list[0])?.id;
      $('#chips',s).innerHTML=catChips(type,t.category);
      $('#catw',s).style.display=t.type==='transfer'?'none':'';$('#tow',s).style.display=t.type==='transfer'?'':'none';
      $('#repw',s).style.display=t.type==='transfer'||(edit&&t.billId)?'none':'';
      $('#accl',s).textContent=t.type==='transfer'?tr('tx.fromAccount'):t.type==='income'?tr('tx.depositTo'):tr('tx.payFrom');
      $('#merl',s).textContent=t.type==='transfer'?tr('tx.description'):t.type==='income'?tr('tx.source'):tr('tx.payee');
      drawSplit();xfer();
    };
    $$('#tseg button',s).forEach(b=>b.onclick=()=>{t.type=b.dataset.t;t.category=null;manualCat=false;splits=null;fill();});
    $('#chips',s).onclick=e=>{const b=e.target.closest('.cc');if(!b)return;t.category=b.dataset.c;manualCat=true;$$('.cc',s).forEach(x=>x.classList.toggle('on',x===b));};
    $('#mer',s).oninput=e=>{if(manualCat||t.type==='transfer')return;const c=guessCategory(e.target.value,t.type,{amount:parseFloat($('#amt',s).value)||0,accountId:$('#acc',s).value});if(c){t.category=c;$$('.cc',s).forEach(x=>x.classList.toggle('on',x.dataset.c===c));}};
    const rc=$('#recent',s);
    if(rc)rc.onclick=e=>{const b=e.target.closest('.rc');if(!b)return;const x=recent[+b.dataset.i];if(!x)return;t.type='expense';t.category=x.category;manualCat=true;$('#mer',s).value=x.merchant;$('#amt',s).value=x.amount;if(acc(x.accountId))$('#acc',s).value=x.accountId;fill();$('#amt',s).focus();$('#amt',s).select();};
    const sm=$('#smart',s);
    if(sm)sm.oninput=()=>{const r=parseSmart(sm.value);if(!r)return;t.type=r.type;if(r.amount!=null)$('#amt',s).value=r.amount;$('#mer',s).value=r.merchant||'';$('#date',s).value=r.date;if(r.note)$('#note',s).value=r.note;t.category=r.category;manualCat=!!r.category;fill();};
    fill();
    if(edit)$('#del',s).onclick=()=>{closeModal();undoable(tr('tx.deleted'),()=>{S.transactions=S.transactions.filter(x=>x.id!==tx.id);});};
   },
   onOk:async s=>{
      const a=parseFloat($('#amt',s).value);if(!(a>0)){toast(tr('tx.err.amount'));$('#amt',s).focus();return;}
      const n={id:t.id||uid(),billId:t.billId,date:$('#date',s).value||today(),amount:Math.round(a*100)/100,type:t.type,accountId:$('#acc',s).value,merchant:$('#mer',s).value.trim(),note:$('#note',s).value.trim()};if(files.length)n.files=files.slice(0,30);
      if(t.fitid)n.fitid=t.fitid;
      if(t.type==='transfer'){n.toAccountId=$('#to',s).value;if(n.toAccountId===n.accountId){toast(tr('tx.err.sameAccount'));return;}
        const ta=parseFloat($('#tam',s).value);if($('#tamw',s).style.display!=='none'&&ta>0)n.toAmount=Math.round(ta*100)/100;}
      else{
        n.category=t.category;
        if(splits){s._rs();const v=Finance.validateSplits(n.amount,splits);if(!v.ok){toast(tr('tx.err.split',{amount:money(Math.abs(v.diff))}));return;}n.splits=splits.filter(x=>x.amount>0).map(x=>({category:x.category,amount:x.amount}));n.category=[...n.splits].sort((x,y)=>y.amount-x.amount)[0].category;}
      }
      const old=edit?S.transactions.find(x=>x.id===n.id):null;
      /* guards: a date in the future, and a likely double entry (same account, amount and payee within 2 days) */
      const redo=()=>{const {id,...rest}=n;edit?openTx({...tx,...n}):openTx(null,rest);};   // "No" brings the form back exactly as it was
      if(Finance.isFuture(n.date,today())&&(!old||old.date!==n.date)&&!(await confirmBox(tr('tx.futureQ',{date:dlong(n.date)}),tr('common.addAnyway'),tr('tx.futureT')))){redo();return;}
      if(!edit){const dup=Finance.findDuplicates(n,S.transactions);if(dup.length&&!(await confirmBox(tr('tx.dupQ',{date:dlong(dup[0].t.date),payee:dup[0].t.merchant||cat(dup[0].t.category).name}),tr('common.addAnyway'),tr('tx.dupT')))){redo();return;}}
      if(!edit&&t.type!=='transfer'){const ar=RulesEngine.apply(S.rules,S.categories,n);if(ar.merchant)n.merchant=ar.merchant;if(!n.category&&ar.category)n.category=ar.category;}   // your rules: clean payee name, default category
      const rep=t.type==='transfer'?'never':$('#rep',s).value;
      let repNote='';
      if(rep!=='never'){
        const b={id:uid(),name:n.merchant||cat(n.category).name,amount:n.amount,type:n.type,freq:rep,anchor:pd(n.date).getDate(),category:n.category,accountId:n.accountId,auto:true,next:stepBill(n.date,rep,pd(n.date).getDate())};
        S.bills.push(b);n.billId=b.id;repNote=` · ${tr('tx.repeatsNote',{freq:tr('freq.'+rep).toLocaleLowerCase(I18N.lang)})}`;
      }
      if(edit)S.transactions=S.transactions.map(x=>x.id===n.id?n:x);else S.transactions.push(n);
      S.settings.lastAcc=n.accountId;
      closeModal();changed();
      if(edit){const off=n.type!=='transfer'&&old&&old.category!==n.category?offerRule(n.merchant,n.category,n.type):null;off?toast(tr('rules.offer',{payee:n.merchant,category:(cat(n.category)||{}).name||''}),off):toast(tr('common.saved'));}else toast(tr('tx.added',{amount:money(n.amount),note:repNote}),{action:tr('common.undo'),fn:()=>{S.transactions=S.transactions.filter(x=>x.id!==n.id);if(n.billId&&rep!=='never')S.bills=S.bills.filter(b=>b.id!==n.billId);changed();}});
   }});
}

/* ---------- account sheet ---------- */
function openAcc(a){
  const edit=!!a;if(!edit&&S.accounts.length>=limitOf('accounts')){openUpgrade('accounts');return;}const cur=edit?balance(a):0;const hasTx=edit&&S.transactions.some(x=>x.accountId===a.id||x.toAccountId===a.id);
  openSheet({title:edit?'Edit Account':'New Account',ok:edit?'Save':'Add',
   body:`<div class="fg"><div class="fr"><label>Name</label><input id="n" value="${esc(a?.name||'')}" placeholder="e.g. Everyday checking"></div>
    <div class="fr"><label>Type</label><select id="t">${Object.entries(ACC_TYPES).map(([k,v])=>opt(k,v.n,(a?.type||'checking')===k)).join('')}</select></div>
    <div class="fr"><label id="bl">Balance</label><input id="b" type="number" step="0.01" value="${edit?Math.abs(cur)*(isLiab(a)?1:Math.sign(cur)||1):''}" placeholder="0.00"></div>
    <div class="fr"><label>${trh('acc.currency')}</label><select id="cur" ${hasTx?'disabled':''}>${[...new Set([accCur(a),S.settings.currency,...CURRENCIES])].map(k=>opt(k,k,k===accCur(a))).join('')}</select></div></div>
    <div class="sec-f" id="bh" style="margin-top:-6px"></div>
    <div class="sec-f" style="margin-top:-6px">${trh(hasTx?'acc.currencyLocked':'acc.currencyD')}</div>
    <div class="fg" id="invf" style="display:none;margin-top:14px"><div class="fr"><label>${trh('acc.marketValue')}</label><input id="mv" type="number" step="0.01" min="0" value="${a?.value??''}" placeholder="${trh('common.optional')}"></div><div class="fr"><label>${trh('acc.asOf')}</label><input id="mvd" type="date" value="${a?.valueDate||today()}"></div><div class="fr"><label>${trh('acc.since')}</label><input id="since" type="date" value="${a?.since||''}"></div></div>
    <div class="sec-f" id="invh" style="display:none;margin-top:-6px">${trh('acc.marketValueD')}</div>
    <div class="fg" id="debtf" style="display:none;margin-top:14px"><div class="fr"><label>Interest rate (APR %)</label><input id="apr" type="number" step="0.01" min="0" placeholder="e.g. 19.9" value="${a?.apr??''}"></div><div class="fr"><label>Minimum payment / month</label><input id="mp" type="number" step="0.01" min="0" placeholder="Optional" value="${a?.minPay??''}"></div><div class="fr" id="termw"><label>${trh('acc.term')}</label><input id="term" type="number" step="1" min="1" placeholder="${trh('common.optional')}" value="${a?.term??''}"></div></div>
    <div class="sec-f" id="debth" style="display:none;margin-top:-6px">Used by the Planner to compare payoff strategies.</div>
    ${edit?'<div class="fg" style="margin-top:16px"><div class="fr dest" id="del">Delete Account</div></div>':''}`,
   mount:s=>{
    const lab=()=>{const l=ACC_TYPES[$('#t',s).value].liab;$('#bl',s).textContent=l?'Amount owed':'Balance';$('#debtf',s).style.display=$('#debth',s).style.display=l?'':'none';const ty=$('#t',s).value;$('#termw',s).style.display=ty==='loan'?'':'none';$('#invf',s).style.display=$('#invh',s).style.display=ty==='investment'?'':'none';$('#bh',s).textContent=l?'Enter what you owe as a positive number. It counts against your net worth.':'The balance as of today. Penny tracks changes from here.';};
    $('#t',s).onchange=lab;lab();
    if(edit)$('#del',s).onclick=async()=>{closeModal();const n=S.transactions.filter(x=>x.accountId===a.id||x.toAccountId===a.id).length;if(await confirmBox(`“${a.name}”${n?` and its ${n} transactions`:''} will be removed. You can undo right after.`)){undoable('Account deleted',()=>{S.transactions=S.transactions.filter(x=>x.accountId!==a.id&&x.toAccountId!==a.id);S.bills=S.bills.filter(b=>b.accountId!==a.id);S.accounts=S.accounts.filter(x=>x.id!==a.id);});}};
   },
   onOk:s=>{
      const name=$('#n',s).value.trim();if(!name){toast('Give the account a name');return;}
      const type=$('#t',s).value;let v=parseFloat($('#b',s).value)||0;if(ACC_TYPES[type].liab)v=-Math.abs(v);
      const mvRaw=type==='investment'?$('#mv',s).value:'',mv=mvRaw!==''&&isFinite(parseFloat(mvRaw))?Math.max(0,parseFloat(mvRaw)):null,mvd=$('#mvd',s).value||today();
      const extra={currency:$('#cur',s).value||S.settings.currency};if(type==='investment'){const sn=$('#since',s).value;extra.since=sn||undefined;}
      if(ACC_TYPES[type].liab){extra.apr=parseFloat($('#apr',s).value)||0;extra.minPay=parseFloat($('#mp',s).value)||0;if(type==='loan'){const tm=parseInt($('#term',s).value,10);extra.term=tm>0?tm:undefined;}}
      if(edit){a.name=name;a.type=type;Object.assign(a,extra);
        if(mv!=null){a.value=mv;a.valueDate=mvd;}else{delete a.value;delete a.valueDate;}
        if(mv==null)a.opening=Math.round((v-flowDelta(a))*100)/100;}
      else S.accounts.push({id:uid(),name,type,opening:v,...extra,...(mv!=null?{value:mv,valueDate:mvd}:{})});
      closeModal();changed();
   }});
}

/* ---------- goal sheets ---------- */
function openGoal(g){
  const edit=!!g;if(!edit&&S.goals.length>=limitOf("goals")){openUpgrade("accounts");return;}
  openSheet({title:edit?'Edit Goal':'New Goal',ok:edit?'Save':'Create',
   body:`<div class="fg"><div class="fr"><label>Name</label><input id="n" value="${esc(g?.name||'')}" placeholder="e.g. Dream vacation"></div>
     <div class="fr col"><label class="f" style="margin:0">Icon</label>${emojiPick('em',g?.emoji||'🎯')}</div></div>
    <div class="fg"><div class="fr"><label>Target</label><input id="t" type="number" step="1" value="${g?.target||''}" placeholder="0"></div>
     <div class="fr"><label>Saved so far</label><input id="s" type="number" step="1" value="${g?.saved||0}"></div>
     <div class="fr"><label>Deadline</label><input id="d" type="date" value="${g?.deadline||''}"></div></div>
    <div class="sec-f" style="margin-top:-6px">A deadline lets Penny tell you how much to set aside each month.</div>
    ${edit?'<div class="fg" style="margin-top:16px"><div class="fr dest" id="del">Delete Goal</div></div>':''}`,
   mount:s=>{wireEmoji(s,'em');if(edit)$('#del',s).onclick=()=>{closeModal();undoable('Goal deleted',()=>{S.goals=S.goals.filter(x=>x.id!==g.id);});};},
   onOk:s=>{const name=$('#n',s).value.trim(),t=parseFloat($('#t',s).value);if(!name||!(t>0)){toast('Name and target are required');return;}
      const o={name,emoji:$('#em',s).dataset.val,target:t,saved:parseFloat($('#s',s).value)||0,deadline:$('#d',s).value||null};
      if(edit)Object.assign(g,o);else S.goals.push({id:uid(),color:PALETTE[S.goals.length%PALETTE.length],...o});closeModal();changed();}});
}
function openFunds(g){
  let sign=1;
  openSheet({title:'Goal Funds',ok:'Update',
   body:`<div style="text-align:center;margin-bottom:10px"><div class="bigic">${gl(g.emoji,40)}</div><b style="font-size:19px">${esc(g.name)}</b><div class="muted">${money(g.saved)} of ${money(g.target)}</div></div>
    <div class="seg" id="sg"><button class="inc on" data-s="1">Add money</button><button class="exp" data-s="-1">Withdraw</button></div>
    <div class="amount-wrap"><small>Amount · ${esc(S.settings.currency)}</small><input id="a" class="amount-in" type="number" step="0.01" placeholder="0"></div>
    <div class="chips" style="justify-content:center">${[25,50,100,250,500].map(v=>`<button type="button" class="cc" data-q="${v}">+${v}</button>`).join('')}</div>`,
   mount:s=>{$$('#sg button',s).forEach(b=>b.onclick=()=>{sign=+b.dataset.s;$$('#sg button',s).forEach(x=>x.classList.toggle('on',x===b));});
     $$('[data-q]',s).forEach(b=>b.onclick=()=>{$('#a',s).value=(parseFloat($('#a',s).value)||0)+ +b.dataset.q;});},
   onOk:s=>{const a=parseFloat($('#a',s).value);if(!(a>0)){toast('Enter an amount');return;}g.saved=Math.max(0,g.saved+sign*a);closeModal();changed();if(g.saved>=g.target){toast('Goal reached! Congratulations!',{ms:4200});confetti();}else toast(sign>0?`Added ${money(a)} to ${g.name}`:'Goal updated');}});
}

/* ---------- recurring sheet ---------- */
function openBill(b,suggest){
  if(!S.accounts.length){toast('Add an account first');return;}
  const edit=!!b&&!suggest;const v=b||{name:'',amount:'',type:'expense',freq:'monthly',next:today(),auto:true,accountId:S.accounts[0].id};
  let category=v.category;
  openSheet({title:edit?'Edit Recurring':'New Recurring',ok:edit?'Save':'Add',
   body:`<div class="fg"><div class="fr"><label>Name</label><input id="n" value="${esc(v.name)}" placeholder="Netflix, Rent, Salary…"></div>
     <div class="fr"><label>Amount</label><input id="a" type="number" step="0.01" value="${v.amount}" placeholder="0.00"></div>
     <div class="fr"><label>Kind</label><select id="ty">${opt('expense','Bill / expense',v.type==='expense')}${opt('income','Income',v.type==='income')}</select></div></div>
    <div class="fg"><div class="fr"><label>Repeats</label><select id="f">${Object.entries(FREQ).map(([k,l])=>opt(k,l,v.freq===k)).join('')}</select></div>
     <div class="fr"><label>Next date</label><input id="d" type="date" value="${v.next}"></div>
     <div class="fr"><label>Account</label><select id="ac">${accOpts(v.accountId)}</select></div>
     <div class="fr col"><label class="f" style="margin:0">Category</label><div class="chips" id="chips"></div></div></div>
    <div class="fg"><div class="fr"><label>Post automatically</label><label class="switch tog"><input type="checkbox" id="au" ${v.auto?'checked':''}><i></i></label></div></div>
    <div class="sec-f" style="margin-top:-6px">Automatic items are added on their due date. Turn off to confirm each one yourself.</div>
    ${edit?'<div class="fg" style="margin-top:16px"><div class="fr dest" id="del">Delete Recurring Item</div></div>':''}`,
   mount:s=>{
    const fc=()=>{const type=$('#ty',s).value==='income'?'income':'expense';const list=S.categories.filter(c=>c.type===type);if(!list.some(c=>c.id===category))category=list[0]?.id;$('#chips',s).innerHTML=catChips(type,category);};
    fc();$('#ty',s).onchange=()=>{category=null;fc();};
    $('#chips',s).onclick=e=>{const x=e.target.closest('.cc');if(!x)return;category=x.dataset.c;$$('.cc',s).forEach(y=>y.classList.toggle('on',y===x));};
    if(edit)$('#del',s).onclick=()=>{closeModal();undoable('Recurring item deleted',()=>{S.bills=S.bills.filter(x=>x.id!==b.id);});};
   },
   onOk:s=>{const name=$('#n',s).value.trim(),a=parseFloat($('#a',s).value);if(!name||!(a>0)){toast('Name and amount are required');return;}
      const next=$('#d',s).value||today();
      const o={name,amount:a,type:$('#ty',s).value,freq:$('#f',s).value,next,anchor:pd(next).getDate(),category,accountId:$('#ac',s).value,auto:$('#au',s).checked};
      if(edit)Object.assign(b,o);else S.bills.push({id:uid(),...o});
      const n=runBills();closeModal();changed();if(n)toast(`Posted ${n} due item${n>1?'s':''}`);}});
}

/* ---------- category & budget sheets ---------- */
function openCat(c){
  const edit=!!c;const v=c||{name:'',emoji:'🧩',color:PALETTE[S.categories.length%PALETTE.length],type:'expense',budget:0};let color=v.color;
  openSheet({title:edit?'Edit Category':'New Category',ok:edit?'Save':'Add',
   body:`<div class="fg"><div class="fr"><label>Name</label><input id="n" value="${esc(v.name)}" placeholder="e.g. Pets"></div>
     <div class="fr"><label>Type</label><select id="t" ${edit?'disabled':''}>${opt('expense','Expense',v.type==='expense')}${opt('income','Income',v.type==='income')}</select></div>
     <div class="fr" id="bw"><label>Monthly budget</label><input id="b" type="number" step="1" value="${v.budget||''}" placeholder="None"></div></div>
    <div class="fg" id="catx"><div class="fr"><label>${trh('cat.bucket')}</label><select id="bk">${opt('needs',tr('cat.bucket.needs'),Finance.bucketOf(v)==='needs')}${opt('wants',tr('cat.bucket.wants'),Finance.bucketOf(v)==='wants')}</select></div>
     <div class="fr" id="rw"><label>${trh('cat.roll')}</label><select id="ro">${['off','surplus','both'].map(k=>opt(k,tr('cat.roll.'+k),(v.roll||'off')===k)).join('')}</select></div></div>
    <div class="sec-f" id="catxh" style="margin-top:-6px">${trh('cat.bucketD')} ${trh('cat.rollD')}</div>
    <div class="fg"><div class="fr col"><label class="f" style="margin:0">Icon</label>${emojiPick('em',v.emoji)}</div>
     <div class="fr col"><label class="f" style="margin:0">Colour</label><div class="swatches" id="sw">${PALETTE.map(p=>`<div class="sw ${p===v.color?'on':''}" data-c="${p}" style="background:${p}"></div>`).join('')}</div></div></div>
    ${edit?'<div class="fg"><div class="fr dest" id="del">Delete Category</div></div>':''}`,
   mount:s=>{wireEmoji(s,'em');
    $('#sw',s).onclick=e=>{if(!e.target.dataset.c)return;color=e.target.dataset.c;$$('.sw',s).forEach(x=>x.classList.toggle('on',x===e.target));};
    const bw=()=>{const inc=$('#t',s).value==='income';$('#bw',s).style.display=inc?'none':'';$('#catx',s).style.display=$('#catxh',s).style.display=inc?'none':'';};$('#t',s).onchange=bw;bw();
    if(edit)$('#del',s).onclick=()=>{closeModal();if(S.categories.filter(x=>x.type===c.type).length<2){toast('Keep at least one category of each type');return;}
      undoable('Category deleted',()=>{const fb=S.categories.find(x=>x.type===c.type&&x!==c);S.transactions.forEach(t=>{if(t.category===c.id)t.category=fb.id;if(t.splits)t.splits.forEach(sp=>{if(sp.category===c.id)sp.category=fb.id;});});S.bills.forEach(t=>{if(t.category===c.id)t.category=fb.id});S.categories=S.categories.filter(x=>x.id!==c.id);});};
   },
   onOk:s=>{const name=$('#n',s).value.trim();if(!name){toast('Name required');return;}
      const inc=$('#t',s).value==='income',roll=inc?'off':$('#ro',s).value;
      const o={name,emoji:$('#em',s).dataset.val,color,budget:inc?0:Math.max(0,parseFloat($('#b',s).value)||0),bucket:inc?'wants':$('#bk',s).value,roll};
      if(roll==='off')o.rollFrom=undefined;else if(!(edit&&c.roll===roll&&c.rollFrom))o.rollFrom=periodFor(today()).start;   // carry-over counts from the period it was switched on
      if(edit)Object.assign(c,o);else S.categories.push({id:uid(),type:$('#t',s).value,...o});closeModal();changed();}});
}
function editBudget(c){
  const avg=lastMonthsAvgByCat(3)[c.id];
  openSheet({title:`${c.name} Budget`,ok:'Save',
   body:`<div style="text-align:center"><div class="bigic">${gl(c.emoji,40)}</div></div>
    <div class="amount-wrap"><small>Monthly limit · ${esc(S.settings.currency)}</small><input id="b" class="amount-in" type="number" step="1" value="${c.budget||''}" placeholder="0"></div>
    ${avg>0?`<div class="chips" style="justify-content:center"><button class="cc" id="sg">Suggest ${money(Math.ceil(avg*1.05/5)*5)} <span class="faint">· your usual is ${money(avg)}</span></button></div>`:''}
    <div class="sec-f" style="text-align:center">Set to 0 to remove the budget.</div>`,
   mount:s=>{const g=$('#sg',s);if(g)g.onclick=()=>{$('#b',s).value=Math.ceil(avg*1.05/5)*5;};},
   onOk:s=>{c.budget=Math.max(0,parseFloat($('#b',s).value)||0);closeModal();changed();}});
}

/* ---------- CSV ---------- */
function toCSV(rows){return rows.map(r=>r.map(c=>{c=String(c??'');return/[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c}).join(',')).join('\n');}
function parseCSV(text){
  const rows=[];let row=[],cur='',q=false;text=text.replace(/^﻿/,'');
  const first=text.split('\n')[0]||'';const sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch}
    else if(ch==='"')q=true;else if(ch===sep){row.push(cur);cur=''}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';if(row.some(x=>x!==''))rows.push(row);row=[]}
    else cur+=ch;}
  row.push(cur);if(row.some(x=>x!==''))rows.push(row);return rows;
}
/* a split transaction is exported as one row per part (same date and payee), so category totals in a spreadsheet stay right */
function txCSV(list){const rows=[];for(const t of list){const parts=t.type!=='transfer'&&t.splits&&t.splits.length>1?t.splits:[{category:t.category,amount:t.amount}];parts.forEach((p,i)=>rows.push([t.date,t.type,p.amount,t.merchant,t.type==='transfer'?'':cat(p.category).name,acc(t.accountId)?.name,t.toAccountId?acc(t.toAccountId)?.name:'',(t.note||'')+(parts.length>1?` (split ${i+1}/${parts.length})`:'')]));}
  return toCSV([['Date','Type','Amount','Merchant','Category','Account','To account','Note'],...rows]);}
async function exportCSV(list){const r=await saveFile(`penny-transactions-${today()}.csv`,txCSV(list),[{name:'CSV',extensions:['csv']}]);if(r)toast('Exported '+list.length+' transactions');}
async function saveFile(name,content,filters){
  if(hasNative)return native.exportFile({name,content,filters});
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content]));a.download=name;a.click();return true;
}
async function pickFile(filters,accept){
  if(hasNative)return native.importFile({filters});
  return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept=accept;i.onchange=()=>{const f=i.files[0];if(!f)return res(null);const r=new FileReader();r.onload=()=>res(r.result);r.readAsText(f)};i.click();});
}
function parseAmountLocale(s){
  s=String(s||'').trim().replace(/[^\d.,\-()]/g,'');if(!s)return NaN;
  let neg=/^\(.*\)$/.test(s)||s.startsWith('-');s=s.replace(/[()\-]/g,'');
  const lc=s.lastIndexOf(','),ld=s.lastIndexOf('.');
  if(lc>ld)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');
  const n=parseFloat(s);return neg?-n:n;
}
/* Dates in a CSV: day-first or month-first is decided ONCE for the whole file (auto-detected, the user can override and
   sees a live preview), never guessed row by row. Impossible readings (month 14) are corrected automatically. */
const validYMD=(y,m,d)=>{if(!(y>=1900&&y<=2200&&m>=1&&m<=12&&d>=1&&d<=31))return false;const x=new Date(y,m-1,d);return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d;};
const NUMDATE=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/;
function csvDateOrder(rows,iD){
  let dmy=0,mdy=0;
  for(const r of rows.slice(1)){const m=String(r[iD]||'').trim().match(NUMDATE);if(!m)continue;const a=+m[1],b=+m[2];if(a>12&&b<=12)dmy++;else if(b>12&&a<=12)mdy++;}
  const kind=dmy&&!mdy?'dmy':mdy&&!dmy?'mdy':dmy&&mdy?'conflict':'ambiguous';
  const fallback=(typeof formatLocaleBase==='function'?formatLocaleBase():'en-US')==='en-US'?'mdy':'dmy';
  return {kind,order:kind==='dmy'||kind==='mdy'?kind:fallback};
}
function parseDateLoose(d,order){
  d=String(d||'').trim();let m;
  if((m=d.match(/^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})(?!\d)/)))return validYMD(+m[1],+m[2],+m[3])?`${m[1]}-${pad(+m[2])}-${pad(+m[3])}`:null;
  if((m=d.match(NUMDATE))){
    let a=+m[1],b=+m[2],y=+m[3];if(y<100)y+=2000;
    let day,mon;
    if(a>12&&b<=12){day=a;mon=b;}else if(b>12&&a<=12){mon=a;day=b;}
    else if(order==='mdy'){mon=a;day=b;}else{day=a;mon=b;}
    return validYMD(y,mon,day)?`${y}-${pad(mon)}-${pad(day)}`:null;
  }
  const x=new Date(d);return isNaN(x)?null:ymd(x);
}
/* importCSV() lives in import-wizard.js (CSV / TSV / OFX / QFX) */

/* ---------- confetti ---------- */
function confetti(){
  const c=document.createElement('canvas');c.style.cssText='position:fixed;inset:0;z-index:99;pointer-events:none';c.width=innerWidth;c.height=innerHeight;document.body.appendChild(c);
  const g=c.getContext('2d'),P=Array.from({length:140},()=>({x:innerWidth/2,y:innerHeight/2,vx:(Math.random()-.5)*16,vy:-Math.random()*16-4,s:Math.random()*8+4,c:PALETTE[Math.floor(Math.random()*PALETTE.length)],r:Math.random()*6}));
  let f=0;(function tick(){g.clearRect(0,0,c.width,c.height);P.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.4;p.r+=.2;g.save();g.translate(p.x,p.y);g.rotate(p.r);g.fillStyle=p.c;g.fillRect(-p.s/2,-p.s/2,p.s,p.s*.6);g.restore();});if(++f<120)requestAnimationFrame(tick);else c.remove();})();
}

/* ---------- demo data ---------- */
function demoData(name){
  let seed=11;const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const pick=a=>a[Math.floor(rnd()*a.length)],between=(a,b)=>Math.round((a+rnd()*(b-a))*100)/100;
  const cats=JSON.parse(JSON.stringify(DEFAULT_CATS));const C=n=>cats.find(c=>c.name===n).id;
  const bud={Groceries:450,Dining:220,Transport:150,Housing:1300,Utilities:180,Health:80,Shopping:200,Entertainment:100,Subscriptions:60,Travel:150};
  cats.forEach(c=>{if(bud[c.name])c.budget=bud[c.name]});
  const A={chk:uid(),sav:uid(),cash:uid(),cc:uid(),inv:uid()};
  const accounts=[{id:A.chk,name:'Everyday Checking',type:'checking',opening:2300},{id:A.sav,name:'Rainy Day Savings',type:'savings',opening:8200},{id:A.cash,name:'Wallet',type:'cash',opening:480},{id:A.cc,name:'Visa Rewards',type:'credit',opening:-640,apr:19.9,minPay:120},{id:A.inv,name:'Index Fund',type:'investment',opening:9300}];
  const t0=today(),tx=[];const add=(d,type,a,m,c,ac)=>tx.push({id:uid(),date:d,type,amount:a,merchant:m,category:c,accountId:ac});
  for(let i=-125;i<=0;i++){const d=addDays(t0,i),dow=pd(d).getDay();
    if(i%4===0)add(d,'expense',between(28,96),pick(['Whole Foods','Aldi','Carrefour','Trader Joe\'s']),C('Groceries'),A.cc);
    if(rnd()<.38)add(d,'expense',between(5,48),pick(['Starbucks','Starbucks','Chipotle','Sushi Zen','Pizza Hut','Local Café']),C('Dining'),pick([A.cc,A.cc,A.chk,A.cash]));
    if(rnd()<.32)add(d,'expense',between(3,32),pick(['Uber','Shell','Uber','Metro Card']),C('Transport'),A.cc);
    if(rnd()<(dow===0||dow===6?.16:.05))add(d,'expense',between(18,150),pick(['Amazon','Zara','IKEA']),C('Shopping'),A.cc);
    if(rnd()<.06)add(d,'expense',between(10,45),pick(['Cinema City','Steam','Concert Tickets']),C('Entertainment'),A.cc);
    if(rnd()<.03)add(d,'expense',between(15,70),pick(['Pharmacy','Dr. Amin Clinic']),C('Health'),A.chk);
  }
  [-95,-65,-35,-6].forEach(o=>add(addDays(t0,o),'expense',14.95,'Audible',C('Subscriptions'),A.cc));
  [-100,-70,-40,-10].forEach(o=>{const d=addDays(t0,o);tx.push({id:uid(),date:d,type:'transfer',amount:400,merchant:'Monthly saving',accountId:A.chk,toAccountId:A.sav});});
  add(addDays(t0,-52),'income',480,'Logo project','' +C('Freelance'),A.chk);add(addDays(t0,-14),'income',650,'Website client',C('Freelance'),A.chk);
  const defs=[['Rent',1250,'expense',1,'Housing',A.chk],['Salary',3600,'income',5,'Salary',A.chk],['Netflix',15.49,'expense',12,'Subscriptions',A.cc],['Spotify',10.99,'expense',15,'Subscriptions',A.cc],['Gym',39,'expense',3,'Health',A.chk],['Internet',59.9,'expense',20,'Utilities',A.chk],['Electricity',74,'expense',22,'Utilities',A.chk]];
  const bills=defs.map(([n,a,ty,day,c,ac])=>{
    const b={id:uid(),name:n,amount:a,type:ty,freq:'monthly',anchor:day,category:C(c),accountId:ac,auto:true,next:null};
    const base=ymd(new Date(pd(t0).getFullYear(),pd(t0).getMonth(),1));
    for(let k=-5;k<=2;k++){const d=addMonths(base,k,day);if(d<=t0&&d>=addDays(t0,-125))tx.push({id:uid(),billId:b.id,date:d,type:ty,amount:a,merchant:n,category:b.category,accountId:ac,note:'Recurring'});else if(d>t0&&!b.next)b.next=d;}
    return b;});
  const rem=(title,kind,off,time,repeat,amount,ac,cc)=>({id:uid(),title,kind,date:addDays(t0,off),next:addDays(t0,off),time,repeat,lead:kind==='rent'?1440:60,sound:'chime',notes:'',amount:amount||0,accountId:ac||'',category:cc||'',done:false,firedFor:'',snooze:0,anchor:pd(addDays(t0,off)).getDate()});
  const reminders=[rem('Pay rent','rent',3,'09:00','monthly',1250,A.chk,C('Housing')),rem('Dentist appointment','appt',2,'15:30','none'),rem('Take vitamins','med',0,'20:00','daily'),rem('Mum\'s birthday','bday',9,'','yearly'),rem('Pay electricity bill','bill',5,'','monthly',62,A.chk,C('Utilities')),rem('Review monthly budget','task',12,'18:00','monthly')];
  tx.sort((a,b)=>a.date<b.date?-1:1);
  return{version:1,settings:{...DEFAULT_SETTINGS,name,widgets:DEFAULT_SETTINGS.widgets.map(w=>({...w}))},accounts,categories:cats,transactions:tx,bills,reminders,
    goals:[{id:uid(),name:'Emergency fund',emoji:'🛡️',target:15000,saved:8200,deadline:addDays(t0,330),color:PALETTE[0]},{id:uid(),name:'Japan trip',emoji:'✈️',target:4000,saved:1350,deadline:addDays(t0,210),color:PALETTE[1]},{id:uid(),name:'New laptop',emoji:'💻',target:2200,saved:900,deadline:addDays(t0,120),color:PALETTE[2]}]};
}
function freshData(name){
  const cats=JSON.parse(JSON.stringify(DEFAULT_CATS));
  return{version:1,settings:{...DEFAULT_SETTINGS,name,widgets:DEFAULT_SETTINGS.widgets.map(w=>({...w}))},accounts:[{id:uid(),name:'Cash',type:'cash',opening:0}],categories:cats,transactions:[],bills:[],goals:[],reminders:[],rules:[],snapshots:[]};
}

/* ---------- PIN lock ---------- */
async function hashPin(pin,salt){
  const s=salt+':'+pin;
  if(window.crypto?.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return String(h>>>0);
}
/* showLock, openPinSetup: see vault-ui.js */
