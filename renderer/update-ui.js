'use strict';
/* =========================================================================
   Updates UI (1.9): top-bar pill with live progress, the update sheet, and the Settings card.
   The main process (updater.js) checks GitHub Releases, downloads, verifies SHA-256 + Ed25519 signature and stages the
   new version; this file only shows it. State arrives through onUpdate() in app.js.
   ========================================================================= */
const updBusy=u=>['checking','downloading','verifying'].includes(u.status);
const updPct=u=>Math.round(Math.max(0,Math.min(1,u.progress||0))*100);
function updSize(b){if(!b)return'';const kb=b/1024;return kb>1024?num(kb/1024,{maximumFractionDigits:1})+' MB':num(Math.max(1,Math.round(kb)))+' KB';}
function updAgo(t){if(!t)return tr('updx.never');const m=Math.round((Date.now()-t)/60000);if(m<1)return tr('updx.justNow');if(m<60)return tr('updx.minAgo',{n:String(m)});const h=Math.round(m/60);if(h<24)return tr('updx.hAgo',{n:String(h)});return FMT.dateTime(new Date(t).toISOString());}
function updSourceText(u){return u.source==='github'?`GitHub · ${u.repo}`:u.source==='custom'?tr('updx.customSource'):tr('updx.noSource');}
/* release notes: plain text or simple Markdown bullets -> safe HTML list */
function updNotesHtml(n){
  const lines=String(n||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);if(!lines.length)return'';
  const items=lines.map(l=>l.replace(/^[-*•]\s*/,'')).filter(l=>!/^#+\s/.test(l)||(l=l.replace(/^#+\s*/,'')));
  return`<ul class="upd-notes">${items.slice(0,14).map(l=>`<li>${esc(l).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')}</li>`).join('')}</ul>`;
}

/* ---------- top bar ---------- */
function renderUpdPill(){
  const b=$('#updbtn');if(!b)return;const u=UPD;
  const show=['downloading','verifying','ready','needs-installer'].includes(u.status);
  b.style.display=show?'':'none';if(!show)return;
  b.className='upd-pill'+(u.status==='ready'?' ready':'');
  b.innerHTML=u.status==='ready'?`${icon('rocket',15)}<span>${trh('updx.pillReady')}</span>`
    :u.status==='needs-installer'?`${icon('download',15)}<span>${trh('updx.pillInstaller')}</span>`
    :`<svg class="upd-ring" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><circle cx="10" cy="10" r="8" class="v" style="stroke-dashoffset:${50.3*(1-(u.progress||0))}"/></svg><span>${updPct(u)}%</span>`;
  b.title=updLabel(u);b.setAttribute('aria-label',updLabel(u));
}

/* ---------- the sheet ---------- */
function updSheetBody(u){
  const v=u.available||'',cur=BRAND.version;
  let hero,title,sub,actions;
  if(u.status==='ready'){hero='rocket';title=tr('updx.readyTitle',{version:v});sub=tr('updx.readySub');
    actions=`<button class="btn pri ubig" id="us_go">${icon('refresh',17)} ${trh('updx.restartNow')}</button><button class="btn ubig" id="us_later">${trh('updx.later')}</button>`;}
  else if(u.status==='downloading'||u.status==='verifying'){hero='download';title=tr('updx.dlTitle',{version:v});sub=u.status==='verifying'?tr('updx.verifying'):tr('updx.dlSub',{size:updSize(u.size)||'…'});
    actions=`<button class="btn ubig" id="us_later">${trh('updx.hide')}</button>`;}
  else if(u.status==='needs-installer'){hero='download';title=tr('updx.instTitle',{version:v});sub=tr('updx.instSub');
    actions=`${u.installerUrl?`<button class="btn pri ubig" id="us_inst">${icon('download',17)} ${trh('updx.getInstaller')}</button>`:''}<button class="btn ubig" id="us_later">${trh('updx.later')}</button>`;}
  else if(u.status==='checking'){hero='refresh';title=tr('upd.checking');sub=updSourceText(u);actions='';}
  else if(u.status==='error'||u.status==='offline'){hero='alert';title=tr(u.status==='offline'?'updx.offline':'upd.error');sub=u.status==='offline'?tr('updx.offlineSub'):(u.error||'');
    actions=`<button class="btn pri ubig" id="us_chk">${trh('updx.tryAgain')}</button><button class="btn ubig" id="us_later">${trh('common.close')}</button>`;}
  else if(u.status==='unconfigured'){hero='info';title=tr('upd.unconfigured');sub=tr('updx.unconfSub');actions=`<button class="btn ubig" id="us_later">${trh('common.close')}</button>`;}
  else{hero='check';title=tr('updx.latestTitle');sub=tr('updx.latestSub',{version:cur});
    actions=`<button class="btn pri ubig" id="us_chk">${trh('set.checkNow')}</button><button class="btn ubig" id="us_later">${trh('common.close')}</button>`;}
  const prog=u.status==='downloading'||u.status==='verifying'||u.status==='checking';
  return`<div class="upd-hero ${u.status}"><div class="upd-orb">${icon(hero,30,2)}</div>${u.status==='ready'||prog?'<div class="upd-glow"></div>':''}</div>
    <h2 class="upd-title">${esc(title)}</h2><p class="upd-sub">${esc(sub)}</p>
    ${prog?`<div class="upd-bar ${u.status==='checking'?'indet':''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${updPct(u)}"><i style="width:${u.status==='checking'?40:Math.max(4,updPct(u))}%"></i></div>${u.status!=='checking'?`<div class="upd-pct">${updPct(u)}%</div>`:''}`:''}
    <div class="upd-chips"><span>${icon('check',13,2.4)} ${esc(tr('updx.current',{version:cur}))}</span>${v&&v!==cur?`<span class="new">${icon('sparkles',13)} ${esc(tr('updx.new',{version:v}))}</span>`:''}${u.size?`<span>${esc(updSize(u.size))}</span>`:''}<span>${icon('shield',13)} ${trh('updx.signed',{name:BRAND.publisher})}</span></div>
    ${u.notes&&v?`<div class="upd-nh">${trh('set.whatsNew',{version:v})}</div>${updNotesHtml(u.notes)}`:''}
    <div class="upd-actions">${actions}</div>
    <div class="upd-foot"><span>${esc(updSourceText(u))} · ${esc(tr('updx.checked',{when:updAgo(u.checkedAt)}))}</span>${u.releaseUrl?`<button class="lnk" data-ext="${esc(u.releaseUrl)}">${trh('updx.viewRelease')}</button>`:''}</div>`;
}
function openUpdateSheet(){
  openModal(`<div class="sheet upd-sheet" role="dialog" aria-modal="true" aria-labelledby="upd_t"><button class="tbtn upd-x" id="us_x" aria-label="${trh('common.close')}">${icon('x',18)}</button><div class="sb" id="usb"></div></div>`,s=>{
    $('#us_x',s).onclick=closeModal;wireUpdSheet(s);
  });
}
function wireUpdSheet(s){
  const b=$('#usb',s);if(!b)return;b.innerHTML=updSheetBody(UPD);const t=$('.upd-title',b);if(t)t.id='upd_t';
  const on=(id,fn)=>{const e=$('#'+id,b);if(e)e.onclick=fn;};
  on('us_go',applyUpdate);on('us_later',closeModal);
  on('us_chk',async()=>{UPD={...UPD,status:'checking'};wireUpdSheet(s);const u=await native.updCheck();onUpdate(u);});
  on('us_inst',()=>{if(isHttps(UPD.installerUrl))window.open(UPD.installerUrl,'_blank','noopener');});
  $$('[data-ext]',b).forEach(x=>x.onclick=()=>{if(isHttps(x.dataset.ext))window.open(x.dataset.ext,'_blank','noopener');});
}
function refreshUpdSheet(){const s=$('#modal .upd-sheet');if(s)wireUpdSheet(s);}

/* ---------- Settings card ---------- */
function updCardHtml(){
  const u=UPD,ready=u.status==='ready',busy=updBusy(u);
  return`<div class="upd-card ${ready?'ready':''}"><div class="upd-mini">${icon(ready?'rocket':'download',22,2)}</div>
    <div class="grow"><b>Penny ${esc(BRAND.version)}${BRAND.channel?' '+esc(BRAND.channel):''}</b><small id="upd_stat">${esc(updLabel(u))}${u.status==='downloading'?` · ${updPct(u)}%`:''}</small>
      <small class="faint">${esc(updSourceText(u))} · ${esc(tr('updx.checked',{when:updAgo(u.checkedAt)}))}</small></div>
    <div class="btns-inline"><button class="btn sm" id="upd_check" ${busy?'disabled':''}>${trh('set.checkNow')}</button><button class="btn sm ${ready?'pri':''}" id="upd_open">${trh(ready?'upd.restart':'updx.details')}</button></div></div>`;
}
