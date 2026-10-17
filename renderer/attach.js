'use strict';
/* =========================================================================
   Attachments on transactions (1.10): receipts, photos, PDFs and documents.
   Files are stored encrypted next to your data (store.js › createAttachments); a transaction only keeps
   {id,name,ext,size,added} in t.files. Add them from the transaction sheet (button, drag and drop, or paste a screenshot),
   or right-click a transaction. Images open in a viewer inside Penny; other files open in their usual app.
   ========================================================================= */
const ATT_IMG=/^(jpe?g|png|webp|gif|bmp)$/;
const ATT_THUMB=new Map();   // id -> blob URL (this session only)
const attOK=()=>hasNative&&!!native.attSave;
const fmtSize=b=>b<1024?b+' B':b<1048576?Math.round(b/1024)+' KB':(b/1048576).toFixed(b<10485760?1:0)+' MB';
const attKind=ext=>ATT_IMG.test(ext)||/^hei[cf]$/.test(ext)?'image':ext==='pdf'?'pdf':'doc';
function attErrText(code){return tr('att.err.'+(['TYPE','SIZE','LOCKED','MISSING','EMPTY'].includes(code)?code:'other'));}
async function attThumb(f){
  if(!ATT_IMG.test(f.ext))return null;if(ATT_THUMB.has(f.id))return ATT_THUMB.get(f.id);
  const r=await native.attPreview(f.id);if(!r||!r.ok)return null;
  const u=URL.createObjectURL(new Blob([r.bytes],{type:r.type}));ATT_THUMB.set(f.id,u);return u;
}
function attItem(f){
  const k=attKind(f.ext);
  return`<div class="att" data-aid="${esc(f.id)}"><button type="button" class="att-open" title="${trh('att.open')}"><span class="att-th k-${k}">${icon(k==='image'?'image':'file',18,2)}</span><span class="att-n"><b>${esc(f.name)}</b><small>${esc(f.ext.toUpperCase())} · ${fmtSize(f.size||0)}</small></span></button><button type="button" class="att-x" aria-label="${esc(tr('att.remove',{name:f.name}))}" title="${trh('att.removeT')}">${icon('x',13,2.4)}</button></div>`;
}
function attSection(files){
  if(!attOK())return'';
  return`<div class="fg att-fg"><div class="att-head"><label>${trh('att.title')}</label><small class="muted">${trh('att.private')}</small></div>
   <div class="att-list" id="attl">${(files||[]).map(attItem).join('')}</div>
   <button type="button" class="att-add" id="attadd">${icon('clip',16,2.1)}<span><b>${trh('att.add')}</b><small>${trh('att.addHint')}</small></span></button></div>`;
}
/* sheet wiring: files is the live array the save handler reads */
function wireAttach(s,files){
  if(!attOK())return;
  const list=$('#attl',s);
  const draw=()=>{list.innerHTML=files.map(attItem).join('');files.forEach(f=>attThumb(f).then(u=>{const th=u&&$(`.att[data-aid="${CSS.escape(f.id)}"] .att-th`,list);if(th){th.innerHTML=`<img src="${u}" alt="">`;th.classList.add('img');}}));};
  const addMetas=(metas,bad)=>{metas.forEach(m=>files.push(m));if(metas.length){draw();toast(tr('att.added',{count:metas.length}));}(bad||[]).forEach(b=>toast(`${b.name}: ${attErrText(b.error)}`,{ms:4500}));};
  const fromFiles=async fl=>{
    const metas=[],bad=[];
    for(const f of [...fl].slice(0,10)){
      if(f.size>20*1024*1024){bad.push({name:f.name,error:'SIZE'});continue;}
      try{const r=await native.attSave(f.name||(tr('att.shot')+' '+today()+'.png'),new Uint8Array(await f.arrayBuffer()));r&&r.ok?metas.push(r.file):bad.push({name:f.name,error:r&&r.error});}catch{bad.push({name:f.name,error:'other'});}
    }
    addMetas(metas,bad);
  };
  $('#attadd',s).onclick=async()=>{const r=await native.attPick();if(r&&r.ok)addMetas(r.files||[],r.bad);};
  list.onclick=e=>{const it=e.target.closest('.att');if(!it)return;const f=files.find(x=>x.id===it.dataset.aid);if(!f)return;
    if(e.target.closest('.att-x')){files.splice(files.indexOf(f),1);draw();toast(tr('att.removed'));}else openAttachment(f);};
  // drag and drop anywhere on the sheet, and pasted screenshots
  const box=s.closest('.sheet')||s;
  box.addEventListener('dragover',e=>{if([...(e.dataTransfer?.types||[])].includes('Files')){e.preventDefault();box.classList.add('att-drop');}});
  box.addEventListener('dragleave',e=>{if(!box.contains(e.relatedTarget))box.classList.remove('att-drop');});
  box.addEventListener('drop',e=>{box.classList.remove('att-drop');if(e.dataTransfer?.files?.length){e.preventDefault();fromFiles(e.dataTransfer.files);}});
  box.addEventListener('paste',e=>{const fl=[...(e.clipboardData?.files||[])];if(!fl.length)return;
    const inText=!!e.target.closest('input,textarea');if(inText&&!fl.every(f=>f.type.startsWith('image/')))return;   // pasting text into a field works as usual
    {e.preventDefault();fromFiles(fl.map((f,i)=>f.name&&f.name!=='image.png'?f:new File([f],`${tr('att.shot')} ${today()}${i?' '+(i+1):''}.png`,{type:f.type})));}});
  draw();
}
/* images: a viewer inside Penny; everything else: the usual app for that file */
async function openAttachment(f){
  if(!ATT_IMG.test(f.ext)){const r=await native.attOpen(f.id);if(!r||!r.ok)toast(attErrText(r&&r.error));return;}
  const u=await attThumb(f);if(!u){toast(attErrText('MISSING'));return;}
  const back=document.activeElement,v=document.createElement('div');v.className='att-view';v.setAttribute('role','dialog');v.setAttribute('aria-modal','true');v.setAttribute('aria-label',f.name);
  v.innerHTML=`<div class="av-bar"><b>${esc(f.name)}</b><span class="grow"></span><button class="btn sm" data-av="open">${icon('external',14,2.2)} ${trh('att.openApp')}</button><button class="btn sm" data-av="save">${icon('download',14,2.2)} ${trh('att.saveCopy')}</button><button class="icon-btn" data-av="close" aria-label="${trh('about.close')}">${icon('x',18,2.2)}</button></div><div class="av-img"><img src="${u}" alt="${esc(f.name)}"></div>`;
  document.body.appendChild(v);requestAnimationFrame(()=>v.classList.add('on'));
  const close=()=>{document.removeEventListener('keydown',kd,true);v.classList.remove('on');setTimeout(()=>v.remove(),200);try{back&&back.focus();}catch{}};
  const kd=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  document.addEventListener('keydown',kd,true);
  v.onclick=async e=>{const b=e.target.closest('[data-av]');if(!b){if(e.target===v||e.target.classList.contains('av-img'))close();return;}
    const a=b.dataset.av;if(a==='close')close();else if(a==='open'){const r=await native.attOpen(f.id);if(!r.ok)toast(attErrText(r.error));}else if(a==='save'){const r=await native.attSaveAs(f.id);if(r.ok)toast(tr('att.saved'));}};
  $('[data-av=close]',v).focus();
}
/* right-click › Attach: pick files and add them to a saved transaction */
async function attachToTx(t){
  if(!attOK())return;const r=await native.attPick();if(!r||!r.ok)return;
  (r.bad||[]).forEach(b=>toast(`${b.name}: ${attErrText(b.error)}`,{ms:4500}));
  if(!r.files.length)return;
  const x=S.transactions.find(y=>y.id===t.id);if(!x)return;x.files=[...(x.files||[]),...r.files];changed();toast(tr('att.added',{count:r.files.length}));
}
/* tidy up files nobody refers to any more; kept 30 days first, so Undo and restoring a recent backup keep working */
setTimeout(function attTidy(){
  if(typeof hasNative==='undefined'||!hasNative)return;              // nothing stored outside the app (tests, browser preview)
  if(!attOK()||!S||!S.transactions)return setTimeout(attTidy,60000);
  const ids=[];S.transactions.forEach(t=>(t.files||[]).forEach(f=>ids.push(f.id)));
  native.attGc(ids).catch(()=>{});
},20000);
