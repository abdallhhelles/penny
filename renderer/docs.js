'use strict';
/* About / Help / Shortcuts / legal sheets. Legal text comes from legal.js (+ publisher.js), help and shortcuts from the locale files. */
const isHttps=u=>{try{return new URL(u).protocol==='https:';}catch{return false;}};
const HELP_TOPICS=['start','accounts','tx','import','budgets','health','forecast','recurring','backup','privacy','trouble'];
const SHORTCUTS=[['Ctrl K','sc.search'],['N','sc.new'],['P','sc.privacy'],['Ctrl L','sc.lock'],['Alt 1–9','sc.pages'],['Esc','sc.esc'],['Tab','sc.tab'],['Enter · Space','sc.enter'],['Enter','sc.save'],['↑ ↓','sc.arrows'],['Ctrl Alt P','sc.global']];
function openDoc(kind){
  let title,body;
  if(kind==='help'){
    title=tr('help.title');
    body=`<div class="hlpwrap">${HELP_TOPICS.map((k,i)=>`<details class="hlp" ${i===0?'open':''}><summary>${trh('help.t.'+k)}</summary><p>${trh('help.b.'+k)}</p></details>`).join('')}</div>`;
  }else if(kind==='shortcuts'){
    title=tr('sc.title');
    body=`<div class="group scl">${SHORTCUTS.map(([k,d])=>`<div class="setrow plain"><div class="grow"><b>${trh(d)}</b></div><span class="kbd" dir="ltr">${esc(k)}</span></div>`).join('')}</div>`;
  }else{
    const map={eula:['about.eula',m=>LEGAL.eula(PUBLISHER,m),PUBLISHER.eulaVersion],privacy:['about.privacy',m=>LEGAL.privacy(PUBLISHER,m),PUBLISHER.privacyVersion],oss:['about.oss',m=>LEGAL.oss(m),null]};
    const m=map[kind];if(!m)return;
    title=tr(m[0]);
    const isEn=I18N.baseOf(I18N.lang)==='en',dirA=I18N.dir();
    const text=en=>esc(m[1](en?LEGAL.en():(k=>tr(k))));
    body=`<p class="muted sm" style="padding:0 6px 8px">${m[2]?trh('about.docVersion',{version:m[2],date:PUBLISHER.docsDate})+' · ':''}${trh('about.legalEn')}${isEn?'':` <button type="button" class="btn sm" id="lgsw" style="margin-inline-start:6px">${trh('about.showEnglish')}</button>`}</p><pre class="legal${isEn?'':' tx'}" id="lgtx" dir="${isEn?'ltr':dirA}" tabindex="0">${text(isEn)}</pre>`;
    setTimeout(()=>{const b=document.getElementById('lgsw'),p=document.getElementById('lgtx');if(!b||!p)return;let en=false;
      b.onclick=()=>{en=!en;p.innerHTML=text(en);p.dir=en?'ltr':dirA;p.classList.toggle('tx',!en);b.textContent=tr(en?'about.showTranslated':'about.showEnglish');};},0);
  }
  openSheet({title,ok:'',cancel:tr('about.close'),body});
}
/* the About group on the Settings page (markup only; wiring is in wireAbout) */
function aboutGroup(){
  const P=PUBLISHER,H=trh;
  const hasSupport=!!(P.supportUrl||P.supportEmail||P.supportDiscord);
  const row=(ic,color,t,d,btn)=>`<div class="setrow"><div class="sq ico sm" style="--c:${color}">${icon(ic,16)}</div><div class="grow"><b>${t}</b>${d?`<small>${d}</small>`:''}</div>${btn}</div>`;
  const doc=(k)=>`<button class="btn sm" data-doc="${k}">${H('about.view')}</button>`;
  return `<div class="group">
   <div class="setrow plain" style="padding:20px 16px"><div class="logo" style="width:56px;height:56px">${LOGO_SVG(56)}</div><div class="grow"><b style="font-size:18px">Penny</b><small>${H('set.version',{version:'⁨'+BRAND.version+'⁩',schema:SCHEMA})}</small><small>${H('about.by',{publisher:esc(P.name)})}</small></div></div>
   ${hasCommunity()?row('chat','var(--accent)',H('cm.title'),H('cm.long'),`<button class="btn sm pri" data-cm="join">${icon('external',14,2.2)} ${H('cm.joinBtn')}</button>`):''}
   ${hasSupport?row('lifebuoy','var(--blue)',H('about.support'),H('about.supportD')+(P.supportDiscord?`<br><span dir="ltr">Discord: ${esc(P.supportDiscord)}</span>`:'')+(P.supportEmail?`<br><span dir="ltr">${esc(P.supportEmail)}</span>`:''),`<span style="display:flex;gap:8px">${isHttps(P.supportUrl)?`<button class="btn sm" data-ext="${esc(P.supportUrl)}">${H('about.open')}</button>`:''}${(P.supportEmail||P.supportDiscord)?`<button class="btn sm" data-copy="${esc(P.supportEmail||P.supportDiscord)}">${H(P.supportEmail?'about.copy':'about.copyDiscord')}</button>`:''}</span>`):''}
   ${row('info','var(--blue)',H('about.help'),H('about.helpD'),doc('help'))}
   ${row('keyboard','var(--gray,#8E8E93)',H('about.shortcuts'),H('about.shortcutsD'),doc('shortcuts'))}
   ${row('lock','var(--green)',H('about.privacy'),H('set.privacyAboutD'),doc('privacy'))}
   ${row('list','var(--gray,#8E8E93)',H('about.eula'),'',doc('eula'))}
   ${row('grid','var(--gray,#8E8E93)',H('about.oss'),'',doc('oss'))}
   <div class="setrow plain"><div class="grow"><small>${H('about.copyright',{year:String(new Date().getFullYear()),publisher:esc(P.name)})}</small></div></div>
  </div>`;
}
function wireAbout(v){
  $$('[data-doc]',v).forEach(b=>b.onclick=()=>openDoc(b.dataset.doc));
  $$('[data-ext]',v).forEach(b=>b.onclick=()=>{if(isHttps(b.dataset.ext))window.open(b.dataset.ext,'_blank','noopener');});
  $$('[data-copy]',v).forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast(tr('about.copied'));}catch{}});
}
