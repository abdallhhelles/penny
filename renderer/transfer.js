'use strict';
/* =========================================================
   Data portability: versioned export / import (+ optional password)
   File extension: .penny  (plain JSON inside, optionally AES-256 encrypted)
   ========================================================= */
const EXPORT_EXT='penny';
const EXPORT_FILTERS=[{get name(){return tr('exp.fileType')},extensions:['penny','lumivault','json']}];

function toB64(buf){const u=new Uint8Array(buf);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}
function fromB64(s){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
async function sha256Hex(str){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function deriveKey(pw,salt,iter){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const dataCounts=d=>({accounts:d.accounts.length,transactions:d.transactions.length,categories:d.categories.length,goals:d.goals.length,bills:d.bills.length,reminders:(d.reminders||[]).length});

/* ---------- export ---------- */
async function buildExport({settings=true,password=''}={}){
  const {__rec,...clean}=S;
  const data=JSON.parse(JSON.stringify(clean));
  if(!settings){
    const keep=S.settings;
    data.settings={...DEFAULT_SETTINGS,name:keep.name,currency:keep.currency,locale:keep.locale,cycleStart:keep.cycleStart};
  }
  const payload=JSON.stringify(data);
  const meta={format:'penny-export',schema:SCHEMA,app:BRAND.name,appVersion:BRAND.version,exportedAt:new Date().toISOString(),settingsIncluded:!!settings};
  if(!password){
    return JSON.stringify({...meta,counts:dataCounts(data),checksum:await sha256Hex(payload),data},null,1);
  }
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=250000;
  const key=await deriveKey(password,salt,iterations);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(payload));
  return JSON.stringify({...meta,encrypted:true,kdf:{name:'PBKDF2-SHA256',iterations,salt:toB64(salt)},iv:toB64(iv),cipher:toB64(cipher)},null,1);
}

/* ---------- import: read, verify, upgrade ---------- */
function sanitizeData(d){
  const warn=[];const accIds=new Set(d.accounts.map(a=>a&&a.id));
  d.accounts=d.accounts.filter(a=>a&&typeof a.id==='string'&&typeof a.name==='string'&&ACC_TYPES[a.type]);
  const okAcc=new Set(d.accounts.map(a=>a.id));
  d.reminders=(d.reminders||[]).filter(r=>r&&typeof r.id==='string'&&typeof r.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.date));
  d.categories=(d.categories||[]).filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&(c.type==='expense'||c.type==='income'));
  if(!d.categories.length)d.categories=JSON.parse(JSON.stringify(DEFAULT_CATS));
  const catIds=new Set(d.categories.map(c=>c.id));
  const fb=type=>(d.categories.find(c=>c.type===type&&/other/i.test(c.name))||d.categories.find(c=>c.type===type)||d.categories[0]).id;
  const before=d.transactions.length;
  d.transactions=d.transactions.filter(t=>t&&typeof t.id==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t.date)&&Number.isFinite(t.amount)&&['income','expense','transfer'].includes(t.type)&&okAcc.has(t.accountId)&&(t.type!=='transfer'||okAcc.has(t.toAccountId)));
  const dropped=before-d.transactions.length;
  if(dropped)warn.push(tr('imp.w.dropped',{count:dropped}));
  let fixed=0;
  for(const t of d.transactions){if(t.type!=='transfer'&&!catIds.has(t.category)){t.category=fb(t.type==='income'?'income':'expense');fixed++;}}
  if(fixed)warn.push(tr('imp.w.fixed',{count:fixed}));
  let badSplit=0;
  for(const t of d.transactions){
    if(t.fitid!==undefined&&typeof t.fitid!=='string')delete t.fitid;
    if(t.files!==undefined){const ok=Array.isArray(t.files)?t.files.filter(f=>f&&/^[a-f0-9]{24}$/.test(f.id)&&typeof f.name==='string'&&/^[a-z0-9]{1,5}$/.test(f.ext)&&Number.isFinite(f.size)).slice(0,30).map(f=>({id:f.id,name:f.name.slice(0,120),ext:f.ext,size:f.size,added:typeof f.added==='string'?f.added.slice(0,10):''})):[];if(ok.length)t.files=ok;else delete t.files;}
    if(t.splits!==undefined){const ok=t.type!=='transfer'&&Array.isArray(t.splits)&&t.splits.every(x=>x&&Number.isFinite(x.amount)&&catIds.has(x.category))&&Finance.validateSplits(t.amount,t.splits).ok;if(!ok){delete t.splits;badSplit++;}}
  }
  if(badSplit)warn.push(tr('imp.w.split',{count:badSplit}));
  d.bills=(d.bills||[]).filter(b=>b&&typeof b.id==='string'&&Number.isFinite(b.amount)&&/^\d{4}-\d{2}-\d{2}$/.test(b.next)&&FREQ[b.freq]&&okAcc.has(b.accountId));
  d.goals=(d.goals||[]).filter(g=>g&&typeof g.id==='string'&&Number.isFinite(g.target));
  const st=d.settings;
  if(st!==undefined){
    if(!st||typeof st!=='object'||Array.isArray(st))d.settings={};
    else{
      if(typeof st.photo!=='string'||(st.photo&&!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(st.photo)))st.photo='';
      st.avatar=avId(typeof st.avatar==='string'?st.avatar:'');
      for(const k of['name','nick','why']){if(typeof st[k]!=='string')st[k]='';else st[k]=st[k].slice(0,200);}
    }
  }
  return warn;
}
async function parseImport(text,password){
  let j;
  try{j=JSON.parse(text);}catch{throw new Error(tr('imp.e.read'));}
  let data,meta={},warn=[];
  if(j&&(j.format==='penny-export'||j.format==='lumivault-export')){
    meta={schema:j.schema,appVersion:j.appVersion,exportedAt:j.exportedAt,encrypted:!!j.encrypted,settingsIncluded:j.settingsIncluded!==false};
    if(j.schema>SCHEMA)throw new Error(tr('imp.e.newerFmt',{schema:String(j.schema)}));
    if(j.encrypted){
      if(!password){const e=new Error(tr('imp.e.locked'));e.needPassword=true;throw e;}
      try{
        const key=await deriveKey(password,fromB64(j.kdf.salt),j.kdf.iterations);
        const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(j.iv)},key,fromB64(j.cipher));
        data=JSON.parse(new TextDecoder().decode(pt));
      }catch{const e=new Error(tr('imp.e.badPw'));e.badPassword=true;throw e;}
    }else{
      data=j.data;
      if(j.checksum&&data&&await sha256Hex(JSON.stringify(data))!==j.checksum)warn.push(tr('imp.w.checksum'));
    }
  }else if(j&&Array.isArray(j.accounts)&&Array.isArray(j.transactions)){
    data=j;meta={legacy:true,settingsIncluded:true,exportedAt:null,appVersion:tr('imp.earlier')};
  }else throw new Error(tr('imp.e.notPenny'));
  if(!data||!Array.isArray(data.accounts)||!Array.isArray(data.transactions))throw new Error(tr('imp.e.missing'));
  if((data.schema||data.version||1)>SCHEMA)throw new Error(tr('imp.e.newer'));
  warn.push(...sanitizeData(data));
  data=normalize(data);
  const dates=data.transactions.map(t=>t.date).sort();
  meta.counts=dataCounts(data);meta.from=dates[0]||null;meta.to=dates[dates.length-1]||null;
  return{data,meta,warn};
}

/* ---------- merge into current data (never creates duplicates) ---------- */
function mergeData(inc){
  const r={accounts:0,transactions:0,categories:0,goals:0,bills:0,reminders:0,skipped:0};
  const key=(...a)=>a.map(x=>String(x??'').toLowerCase().trim()).join('|');
  const uniq=(list,id)=>list.some(x=>x.id===id)?uid():id;
  const accMap={},catMap={},billMap={};
  for(const a of inc.accounts){
    const ex=S.accounts.find(x=>key(x.name,x.type)===key(a.name,a.type));
    if(ex)accMap[a.id]=ex.id;else{const n={...a,id:uniq(S.accounts,a.id)};S.accounts.push(n);accMap[a.id]=n.id;r.accounts++;}
  }
  for(const c of inc.categories){
    const ex=S.categories.find(x=>key(x.name,x.type)===key(c.name,c.type));
    if(ex)catMap[c.id]=ex.id;else{const n={...c,id:uniq(S.categories,c.id)};S.categories.push(n);catMap[c.id]=n.id;r.categories++;}
  }
  for(const r0 of (inc.rules||[])){const r={...r0,id:uniq(S.rules,r0.id),category:catMap[r0.category]||'',accountId:accMap[r0.accountId]||''};if(!r.category&&!r.rename)continue;if(!S.rules.some(x=>x.op===r.op&&x.text===r.text&&x.category===r.category&&x.min===r.min&&x.max===r.max&&x.type===r.type))S.rules.push(r);}
  for(const b of inc.bills){
    const ex=S.bills.find(x=>key(x.name,x.amount,x.freq,x.type)===key(b.name,b.amount,b.freq,b.type));
    if(ex)billMap[b.id]=ex.id;
    else{const n={...b,id:uniq(S.bills,b.id),accountId:accMap[b.accountId],category:catMap[b.category]||b.category};S.bills.push(n);billMap[b.id]=n.id;r.bills++;}
  }
  const sig=t=>key(t.date,t.type,t.amount,t.merchant,t.accountId,t.toAccountId||'');
  const have=new Set(S.transactions.map(sig));
  for(const t of inc.transactions){
    const n={...t,accountId:accMap[t.accountId],category:t.type==='transfer'?t.category:(catMap[t.category]||t.category)};
    if(t.toAccountId)n.toAccountId=accMap[t.toAccountId];
    if(Array.isArray(t.splits))n.splits=t.splits.map(x=>({...x,category:catMap[x.category]||x.category}));   // parts follow their category into this file
    if(t.billId)n.billId=billMap[t.billId];
    if(have.has(sig(n))){r.skipped++;continue;}
    have.add(sig(n));n.id=uniq(S.transactions,t.id);S.transactions.push(n);r.transactions++;
  }
  for(const g of inc.goals){
    if(S.goals.some(x=>key(x.name,x.target)===key(g.name,g.target)))continue;
    S.goals.push({...g,id:uniq(S.goals,g.id)});r.goals++;
  }
  for(const x of (inc.reminders||[])){
    if(S.reminders.some(y=>key(y.title,y.date,y.time,y.repeat)===key(x.title,x.date,x.time,x.repeat)))continue;
    S.reminders.push({...x,id:uniq(S.reminders,x.id),accountId:accMap[x.accountId]||x.accountId,category:catMap[x.category]||x.category});r.reminders++;
  }
  _ver++;
  return r;
}

/* ---------- UI: export sheet ---------- */
function openExportSheet(){
  const c=dataCounts(S);
  openSheet({title:tr('exp.title'),ok:tr('exp.ok'),body:`
    <p class="muted" style="text-align:center;margin:0 0 18px">${trh('exp.sub')}</p>
    <div class="fg" style="margin-bottom:6px">
      <div class="fr"><label style="flex:1;min-width:0">${trh('exp.settings')}<small class="muted" style="display:block;font-size:12.5px">${trh('exp.settingsD')}</small></label><label class="switch tog"><input type="checkbox" id="xs" checked><i></i></label></div>
      <div class="fr"><label style="flex:1;min-width:0">${trh('exp.pw')}<small class="muted" style="display:block;font-size:12.5px">${trh('exp.pwD')}</small></label><label class="switch tog"><input type="checkbox" id="xp"><i></i></label></div>
      <div class="fr" id="xr1" style="display:none"><label>${trh('exp.password')}</label><input id="xpw" type="password" placeholder="${trh('exp.pwPh')}" autocomplete="new-password"></div>
      <div class="fr" id="xr2" style="display:none"><label>${trh('exp.confirm')}</label><input id="xpw2" type="password" placeholder="${trh('exp.pwPh2')}" autocomplete="new-password"></div>
    </div>
    <div class="sec-f" id="xwarn" style="display:none;margin-top:6px;color:var(--orange)">${trh('exp.pwWarn')}</div>
    <div class="sec-f" style="margin-top:12px;text-align:center">${esc([tr('cnt.accounts',{count:c.accounts}),tr('cnt.tx',{count:c.transactions}),tr('cnt.cats',{count:c.categories}),tr('cnt.goals',{count:c.goals}),tr('cnt.bills',{count:c.bills}),tr('cnt.rems',{count:c.reminders})].join(' · '))}</div>`,
  mount(s){
    $('#xp',s).onchange=e=>{if(e.target.checked&&!can('encrypt')){e.target.checked=false;toast(tr('exp.pro'));return;}const on=e.target.checked;$('#xr1',s).style.display=$('#xr2',s).style.display=$('#xwarn',s).style.display=on?'':'none';if(on)$('#xpw',s).focus();};
  },
  async onOk(s){
    const pw=$('#xp',s).checked?$('#xpw',s).value:'';
    if($('#xp',s).checked){
      if(pw.length<6){toast(tr('exp.pwShort'));return;}
      if(pw!==$('#xpw2',s).value){toast(tr('exp.pwMismatch'));return;}
    }
    try{
      const text=await buildExport({settings:$('#xs',s).checked,password:pw});
      const r=await saveFile(`penny-export-${today()}.${EXPORT_EXT}`,text,EXPORT_FILTERS);
      if(r){closeModal();toast(tr(pw?'exp.savedEnc':'exp.saved'));}
    }catch(e){console.error(e);toast(tr('exp.failed'));}
  }});
}

/* ---------- UI: import flow ---------- */
async function startImport(){
  const text=await pickFile(EXPORT_FILTERS,'.penny,.lumivault,.json');
  if(!text)return;
  await tryImport(text,'');
}
async function tryImport(text,password){
  try{
    const res=await parseImport(text,password);
    openImportPreview(res);
  }catch(e){
    if(e.needPassword||e.badPassword){
      if(e.badPassword)toast(e.message);
      openSheet({title:tr('imp.pwTitle'),ok:tr('lock.unlock'),body:`<p class="muted" style="text-align:center;margin:0 0 14px">${trh('imp.pwSub')}</p><div class="fg"><div class="fr"><label>${trh('exp.password')}</label><input id="ip" type="password" autocomplete="off"></div></div>`,
        onOk(s){const p=$('#ip',s).value;if(!p)return;closeModal();tryImport(text,p);}});
    }else toast(e.message||tr('imp.e.generic'),{ms:5000});
  }
}
function openImportPreview({data,meta,warn}){
  const c=meta.counts,fmt=d=>d?dshort(d):'';
  const range=meta.from?`${dlong(meta.from)} → ${dlong(meta.to)}`:tr('imp.noTx');
  let mode='replace';
  openSheet({title:tr('imp.title'),ok:tr('imp.ok'),body:`
    <div class="group" style="box-shadow:none;margin-bottom:14px">
      <div class="li noicon"><div class="grow"><b>${meta.exportedAt?trh('imp.exported',{date:FMT.dateTime(meta.exportedAt)}):trh('imp.backup')}</b><small>${trh('imp.from',{version:String(meta.appVersion||'')})}${meta.encrypted?' · '+trh('imp.encrypted'):''}</small></div></div>
      <div class="li noicon"><div class="grow">${trh('nav.accounts')}</div><div class="end">${c.accounts}</div></div>
      <div class="li noicon"><div class="grow">${trh('nav.transactions')}<small>${esc(range)}</small></div><div class="end">${num(c.transactions)}</div></div>
      <div class="li noicon"><div class="grow">${trh('imp.cgr')}</div><div class="end">${c.categories} · ${c.goals} · ${c.bills}</div></div>
    </div>
    ${warn.length?`<div class="insight warn" style="margin:0 0 14px;border-radius:16px;background:var(--fill)"><div class="e">${icon('alert',20)}</div><div><b>${trh('imp.heads')}</b>${warn.map(w=>`<span style="display:block">${esc(w)}</span>`).join('')}</div></div>`:''}
    <div class="seg" id="im" style="margin-bottom:10px"><button class="on" data-m="replace">${trh('imp.replace')}</button><button data-m="merge">${trh('imp.merge')}</button></div>
    <p class="muted" id="imd" style="font-size:13.5px;margin:0"></p>
    <div class="fg" id="isw" style="margin-top:14px;display:none"><div class="fr"><label style="flex:1;min-width:0">${trh('imp.alsoSettings')}</label><label class="switch tog"><input type="checkbox" id="ist"><i></i></label></div></div>`,
  mount(s){
    const desc={replace:tr('imp.replaceD'),merge:tr('imp.mergeD')};
    const upd=()=>{$$('#im button',s).forEach(b=>b.classList.toggle('on',b.dataset.m===mode));$('#imd',s).textContent=desc[mode];$('#isw',s).style.display=mode==='merge'&&meta.settingsIncluded?'':'none';};
    $$('#im button',s).forEach(b=>b.onclick=()=>{mode=b.dataset.m;upd();});upd();
  },
  async onOk(s){
    const withSettings=$('#ist',s).checked;
    closeModal();
    if(mode==='replace'){
      if(!meta.settingsIncluded)data.settings=S.settings;
      if(!await replaceData(data))return;
      toast(tr('imp.done',{count:c.transactions}),{ms:4000});
    }else{
      if(hasNative){const sr=await native.snapshot('before-change');if(sr&&sr.ok===false&&sr.error!=='no-data'){toast(tr('err.noSafety'),{ms:6000});return;}}
      const r=mergeData(data);
      if(withSettings&&meta.settingsIncluded){const keepPin={pin:S.settings.pin,salt:S.settings.salt};S.settings={...data.settings,...keepPin};applySettings();}
      changed();
      toast(tr('imp.merged',{tx:num(r.transactions),acc:String(r.accounts)})+(r.skipped?' · '+tr('imp.skipped',{count:r.skipped}):''),{ms:5200});
    }
  }});
}
