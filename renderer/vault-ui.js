'use strict';
/* =========================================================================
   Encryption & lock screens (1.9). The cryptography lives in the main process (store.js, createVault):
   the renderer never sees a key. This file draws:
     - the launch unlock screen when the data is protected by a passcode (or encrypted for another PC)
     - the in-app lock (Ctrl+L, idle, minimise)
     - passcode setup + the one-time recovery key sheet
   ========================================================================= */
let VAULT={encrypted:false,mode:'plain',recovery:false,deviceAvailable:false};
async function vaultRefresh(){if(hasNative&&native.vaultStatus){try{VAULT=await native.vaultStatus();}catch{}}return VAULT;}
const vaultOn=()=>hasNative&&VAULT.mode==='passcode';

/* one keypad screen in #lock. onSubmit(pin) -> Promise<true|{msg}>; Enter or the arrow key submits (never on every digit:
   each try is counted by the main process and slowed down after five misses) */
function lockPad({title,sub,onSubmit,extra='',onExtra}){
  const L=$('#lock');L.classList.add('on');let pin='',busy=false;
  L.innerHTML=`<div class="lockbox" role="dialog" aria-modal="true" aria-labelledby="lk_t"><div class="logo lock-logo">${LOGO_SVG(64)}</div><h2 id="lk_t">${esc(title)}</h2><p id="lk_s">${esc(sub)}</p>
    <div class="pin-dots" id="pd" aria-live="polite"></div>
    <div class="keypad">${[1,2,3,4,5,6,7,8,9,'⌫',0,'go'].map(k=>k==='go'?`<button class="go" data-k="go" aria-label="${trh('lock.unlock')}">${icon('chevron',26)}</button>`:`<button class="${k==='⌫'?'ghost':''}" data-k="${k}" aria-label="${k==='⌫'?trh('lock.delete'):k}">${k}</button>`).join('')}</div>
    <div class="lock-extra">${extra}</div></div>`;
  const dots=()=>{$('#pd',L).innerHTML=Array.from({length:Math.max(4,pin.length)},(_,i)=>`<i class="${i<pin.length?'f':''}"></i>`).join('');$('[data-k=go]',L).classList.toggle('ready',pin.length>=4);};dots();
  const shake=()=>$('.lockbox',L).animate([{transform:'translateX(-14px)'},{transform:'translateX(14px)'},{transform:'translateX(-9px)'},{transform:'none'}],{duration:340});
  const submit=async()=>{
    if(busy||pin.length<4)return;busy=true;$('#lk_s',L).textContent=tr('lock.checking');
    let r;try{r=await onSubmit(pin);}catch(e){r={msg:tr('lock.error')};}
    busy=false;
    if(r===true){cleanup();return;}
    shake();pin='';dots();$('#lk_s',L).textContent=(r&&r.msg)||tr('lock.wrong');
  };
  const press=k=>{if(busy)return;if(k==='go')return submit();if(k==='⌫')pin=pin.slice(0,-1);else if(pin.length<8)pin+=k;dots();};
  $$('.keypad button',L).forEach(b=>b.onclick=()=>press(b.dataset.k));
  const kd=e=>{if(!L.classList.contains('on')||$('input',L)===document.activeElement)return;if(/^\d$/.test(e.key))press(e.key);else if(e.key==='Backspace')press('⌫');else if(e.key==='Enter')press('go');};
  document.addEventListener('keydown',kd);
  const cleanup=()=>{document.removeEventListener('keydown',kd);L.classList.remove('on');L.innerHTML='';};
  if(onExtra)onExtra(L,cleanup);
  return cleanup;
}
const waitMsg=r=>r&&r.reason==='wait'?tr('lock.wait',{seconds:String(r.wait)}):r&&r.reason==='device'?tr('lock.deviceChanged'):null;

/* ---------- launch: data is encrypted and needs the passcode / recovery key ---------- */
function vaultUnlockScreen(info){
  info=info||{};
  return new Promise(resolve=>{
    const deviceGone=info.state==='foreign'||(info.deviceBound&&!info.deviceAvailable);
    const done=(r,how)=>{VAULT=r.vault||VAULT;resolve({data:r.data,how});};
    const recoveryForm=()=>{
      const L=$('#lock');L.classList.add('on');
      L.innerHTML=`<div class="lockbox wide" role="dialog" aria-modal="true"><div class="logo lock-logo">${LOGO_SVG(64)}</div><h2>${trh('lock.recoveryTitle')}</h2><p>${trh('lock.recoverySub')}</p>
        <input id="rk" class="rk-in" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" aria-label="${trh('lock.recoveryTitle')}">
        <p id="rk_m" class="lock-msg" aria-live="polite"></p>
        <div class="lock-actions"><button class="btn pri" id="rk_go">${trh('lock.unlock')}</button>${info.passcode&&!deviceGone?`<button class="btn ghost-l" id="rk_back">${trh('lock.usePasscode')}</button>`:''}</div>
        ${aside()}</div>`;
      const go_=async()=>{const v=$('#rk',L).value;if(normRec(v).length<32){$('#rk_m',L).textContent=tr('lock.recoveryShort');return;}
        $('#rk_go',L).disabled=true;$('#rk_m',L).textContent=tr('lock.checking');
        const r=await native.vaultRecover(v);$('#rk_go',L).disabled=false;
        if(r&&r.ok){L.classList.remove('on');L.innerHTML='';done(r,'recovery');return;}
        $('#rk_m',L).textContent=waitMsg(r)||tr('lock.recoveryWrong');};
      $('#rk_go',L).onclick=go_;$('#rk',L).onkeydown=e=>{if(e.key==='Enter')go_();};$('#rk',L).focus();
      const b=$('#rk_back',L);if(b)b.onclick=padForm;
      hookAside(L);
    };
    const normRec=s=>String(s||'').replace(/[^A-Za-z0-9]/g,'');
    const aside=()=>`<button class="lock-link" id="lk_aside">${trh('lock.startFresh')}</button>`;
    const hookAside=L=>{const a=$('#lk_aside',L);if(a)a.onclick=async()=>{
      if(!await confirmBox(tr('lock.startFreshBody'),tr('lock.startFreshOk'),tr('lock.startFresh')))return;
      await native.vaultSetAside();L.classList.remove('on');L.innerHTML='';resolve({data:null,how:'fresh'});};};
    const padForm=()=>{
      lockPad({title:tr('lock.title'),sub:tr('lock.subLaunch'),
        extra:`${info.recovery?`<button class="lock-link" id="lk_rec">${trh('lock.forgot')}</button>`:''}`,
        onExtra:(L,cleanup)=>{const b=$('#lk_rec',L);if(b)b.onclick=()=>{cleanup();recoveryForm();};},
        onSubmit:async pin=>{const r=await native.vaultUnlock(pin);if(r&&r.ok){done(r,'passcode');return true;}return{msg:waitMsg(r)};}});
    };
    if(deviceGone){
      if(info.recovery)recoveryForm();
      else{const L=$('#lock');L.classList.add('on');
        L.innerHTML=`<div class="lockbox wide" role="dialog" aria-modal="true"><div class="logo lock-logo">${LOGO_SVG(64)}</div><h2>${trh('lock.foreignTitle')}</h2><p>${trh('lock.foreignBody')}</p><div class="lock-actions">${aside()}</div></div>`;
        hookAside(L);}
    }else padForm();
  });
}

/* ---------- in-app lock (Ctrl+L, idle, minimise) ---------- */
function showLock(){
  if(!S||!S.settings.pin||$('#lock').classList.contains('on'))return;
  lockPad({title:tr('lock.title'),sub:tr('lock.sub'),onSubmit:async pin=>{
    if(vaultOn()){const r=await native.vaultVerify(pin);return r&&r.ok?true:{msg:waitMsg(r)};}
    if(await hashPin(pin,S.settings.salt)!==S.settings.pin)return{msg:null};
    // passcode from before 1.9: it now also encrypts the data (once, with a recovery key to save)
    if(hasNative&&native.vaultSetPasscode)setTimeout(()=>upgradePasscode(pin),400);
    return true;
  }});
}
async function upgradePasscode(pin){
  const r=await native.vaultSetPasscode(pin);
  if(r&&r.ok){VAULT=r.vault||VAULT;if(r.recoveryKey)showRecoveryKey(r.recoveryKey,{upgraded:true});}
}

/* ---------- passcode setup ---------- */
function openPinSetup(){
  const changing=!!S.settings.pin;
  openSheet({title:tr(changing?'pin.changeTitle':'pin.title'),ok:tr('common.save'),body:`<p class="muted" style="text-align:center;margin-bottom:6px">${trh('pin.body')}</p>
    <div class="amount-wrap"><input id="p" type="password" inputmode="numeric" maxlength="8" class="amount-in" placeholder="••••" aria-label="${trh('pin.new')}"></div>
    <div class="amount-wrap" style="margin-top:8px"><input id="p2" type="password" inputmode="numeric" maxlength="8" class="amount-in sm" placeholder="${trh('pin.repeat')}" aria-label="${trh('pin.repeat')}"></div>
    <div class="vault-note">${icon('shield',16)}<span>${trh(hasNative?'pin.encryptNote':'pin.webNote')}</span></div>`,
   onOk:async s=>{const p=$('#p',s).value,p2=$('#p2',s).value;
     if(!/^\d{4,8}$/.test(p)){toast(tr('pin.digits'));return;}
     if(p!==p2){toast(tr('pin.mismatch'));return;}
     let key=null;
     if(hasNative&&native.vaultSetPasscode){const r=await native.vaultSetPasscode(p);if(!r||!r.ok){toast(tr('pin.failed'),{ms:5000});return;}VAULT=r.vault||VAULT;key=r.recoveryKey;}
     S.settings.salt=uid();S.settings.pin=await hashPin(p,S.settings.salt);closeModal();changed();
     if(key)showRecoveryKey(key);else toast(tr(changing?'pin.changed':'pin.enabled'));}});
}
async function removePasscode(){
  if(!await confirmBox(tr('pin.removeBody'),tr('set.remove'),tr('pin.removeTitle')))return;
  if(hasNative&&native.vaultClearPasscode){const r=await native.vaultClearPasscode();if(!r||!r.ok){toast(tr('pin.failed'));return;}VAULT=r.vault||VAULT;}
  S.settings.pin=null;changed();toast(tr('set.pinRemoved'));
}
async function newRecoveryKey(){
  if(!await confirmBox(tr('rk.newBody'),tr('rk.newOk'),tr('rk.newTitle')))return;
  const r=await native.vaultNewRecovery();if(r&&r.ok)showRecoveryKey(r.recoveryKey);else toast(tr('pin.failed'));
}

/* ---------- the recovery key, shown exactly once ---------- */
function showRecoveryKey(key,{upgraded=false}={}){
  openModal(`<div class="sheet rk-sheet" data-noclose role="dialog" aria-modal="true" aria-labelledby="rk_h"><div class="sb" style="padding:28px">
    <div class="rk-badge">${icon('shield',26)}</div>
    <h2 id="rk_h" style="text-align:center;margin:10px 0 6px">${trh('rk.title')}</h2>
    <p class="muted" style="text-align:center">${trh(upgraded?'rk.upgraded':'rk.body')}</p>
    <div class="rk-key" id="rk_k" tabindex="0">${key.split('-').map(g=>`<span>${g}</span>`).join('')}</div>
    <div class="rk-btns"><button class="btn" id="rk_c">${icon('copy',15)} ${trh('rk.copy')}</button>${hasNative?`<button class="btn" id="rk_s">${icon('download',15)} ${trh('rk.save')}</button>`:''}</div>
    <ul class="rk-tips"><li>${trh('rk.tip1')}</li><li>${trh('rk.tip2')}</li><li>${trh('rk.tip3')}</li></ul>
    <label class="rk-ok"><input type="checkbox" id="rk_ok"> ${trh('rk.confirm')}</label>
    <button class="btn pri" id="rk_done" disabled style="width:100%;height:46px;margin-top:12px">${trh('rk.done')}</button></div></div>`,s=>{
    $('#modal').onmousedown=null;
    $('#rk_c',s).onclick=async()=>{try{await navigator.clipboard.writeText(key);toast(tr('about.copied'));}catch{}};
    const sv=$('#rk_s',s);if(sv)sv.onclick=async()=>{await native.exportFile({name:'Penny recovery key.txt',content:tr('rk.fileText',{key,date:new Date().toLocaleDateString(I18N.lang)})+'\r\n',filters:[{name:'Text',extensions:['txt']}]});};
    $('#rk_ok',s).onchange=e=>{$('#rk_done',s).disabled=!e.target.checked;};
    $('#rk_done',s).onclick=()=>{closeModal();toast(tr('rk.saved'));};
  });
}

/* ---------- Settings > Security row ---------- */
function vaultStatusText(){
  if(!hasNative)return tr('enc.web');
  if(VAULT.mode==='passcode')return tr(VAULT.deviceAvailable?'enc.passDevice':'enc.pass');
  if(VAULT.mode==='device')return tr('enc.device');
  return tr('enc.off');
}
