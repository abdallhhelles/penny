'use strict';
/* =========================================================================
   Navigation layer (1.10). Makes every tab easier to move around in, without changing what the pages do:
   - sidebar in three groups (Everyday / Plan ahead / Understand), Settings pinned at the bottom, live badges
   - "On this page" jump bar for long pages, with the current section highlighted while you scroll
   - a back-to-top button once you are far down a page
   - lists: Up / Down / Home / End move between rows on every tab, Enter opens; "/" jumps to the page's search box
   - the Penny community card (Discord) in the sidebar, hideable
   ========================================================================= */
const NAV_GROUPS=[['',['dashboard','transactions','accounts']],['plan',['budgets','goals','reminders','bills','calendar']],['learn',['insights','report','plan']]];

/* ---------- badges ---------- */
function setNavBadge(k,n,label,tone){
  const b=$(`[data-nav=${k}] .badge`);if(!b)return;
  b.textContent=n>99?'99+':String(n);b.style.display=n?'':'none';b.className='badge'+(tone?' '+tone:'');
  if(n){b.setAttribute('aria-label',label);b.title=label;}else{b.removeAttribute('aria-label');b.removeAttribute('title');}
}
const updateNavBadges=debounce(()=>{
  if(!S)return;
  try{const g=remGroups(),n=g.over.length+g.today.length;setNavBadge('reminders',n,tr('navb.reminders',{count:n}),g.over.length?'':'soft');}catch{}
  try{const n=insightList().filter(i=>i.g==='att'&&!isInsHidden(i.id)).length;setNavBadge('insights',n,tr('navb.insights',{count:n}),'soft');}catch{}
},350);

/* ---------- community (Discord) ---------- */
const hasCommunity=()=>typeof PUBLISHER!=='undefined'&&isHttps(PUBLISHER.discordInvite||'');
function joinCommunity(){
  if(!hasCommunity())return;
  window.open(PUBLISHER.discordInvite,'_blank','noopener');
  toast(tr('cm.opening'));
  if(S&&!S.settings.communityJoined){S.settings.communityJoined=true;save();const c=$('#side .community');if(c)c.remove();placeNavPill(true);}
}
function communityCard(){
  if(!hasCommunity()||(S&&S.settings&&(S.settings.communityHide||S.settings.communityJoined)))return'';
  return`<div class="community" role="group" aria-label="${trh('cm.title')}">
   <button class="cm-main" data-cm="join" title="${trh('cm.title')}"><span class="cm-ic">${icon('chat',17,2.1)}</span><span class="cm-t"><b>${trh('cm.side')}</b><small>${trh('cm.sub')}</small></span></button>
   <button class="cm-x" data-cm="hide" aria-label="${trh('cm.hide')}" title="${trh('cm.hide')}">${icon('x',13,2.4)}</button></div>`;
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-cm]');if(!b)return;e.preventDefault();e.stopPropagation();
  if(b.dataset.cm==='join')joinCommunity();
  else if(b.dataset.cm==='hide'){S.settings.communityHide=true;save();const c=b.closest('.community');if(c)c.remove();placeNavPill(true);toast(tr('cm.hidden'));}
},true);

/* ---------- jump bar ("On this page") ---------- */
const JUMP={heads:[],on:-1,raf:0};
function jumpLabel(el){
  if(el.classList.contains('ch')){const s=el.querySelector('span:not(.r)');return(s||el).textContent.trim();}
  return(el.firstChild&&el.firstChild.nodeType===3?el.firstChild.textContent:el.textContent).trim();
}
function buildJump(){
  const v=$('#view'),bar=$('#jump');if(!v||!bar)return;
  JUMP.heads=[];JUMP.on=-1;
  const page=$('.page',v);
  if(!page||['settings','transactions','calendar'].includes(cur)){bar.innerHTML='';bar.classList.remove('has');sync();return;}
  const seen=new Set();
  const heads=$$('.card > .ch, .sec-h, .page h2',v).filter(h=>h.offsetParent&&!h.closest('.lt,.modal,#modal,.advbox'));
  for(const h of heads){const t=jumpLabel(h).replace(/\s+/g,' ');if(!t||t.length>40||seen.has(t))continue;seen.add(t);JUMP.heads.push({el:h,t});if(JUMP.heads.length>=12)break;}
  const long=v.scrollHeight>v.clientHeight*1.7;
  if(JUMP.heads.length<3||!long){bar.innerHTML='';bar.classList.remove('has');sync();return;}
  bar.innerHTML=`<nav class="jump-in" aria-label="${trh('jump.aria')}"><span class="jump-l" aria-hidden="true">${trh('jump.label')}</span>${JUMP.heads.map((h,i)=>`<button data-j="${i}">${esc(h.t)}</button>`).join('')}</nav>`;
  bar.classList.add('has');
  $$('[data-j]',bar).forEach(b=>b.onclick=()=>jumpTo(+b.dataset.j));
  sync();
}
function headTop(el){const v=$('#view');return el.getBoundingClientRect().top-v.getBoundingClientRect().top+v.scrollTop;}
function jumpTo(i){
  const h=JUMP.heads[i];if(!h)return;const v=$('#view'),bar=$('#jump');
  const y=Math.max(0,headTop(h.el)-(bar.offsetHeight||0)-14);
  v.scrollTo({top:y,behavior:motionOK()?'smooth':'auto'});
  const card=h.el.closest('.card')||h.el.nextElementSibling;
  if(card&&card.focus){card.setAttribute('tabindex',card.getAttribute('tabindex')||'-1');setTimeout(()=>card.focus({preventScroll:true}),motionOK()?420:0);}
}
function sync(){
  const v=$('#view'),bar=$('#jump'),top=$('#totop');if(!v)return;
  const st=v.scrollTop;
  if(bar)bar.classList.toggle('on',bar.classList.contains('has')&&st>70);
  if(top)top.classList.toggle('on',st>v.clientHeight*1.5);
  if(!JUMP.heads.length||!bar)return;
  const off=(bar.offsetHeight||0)+40;let on=0;
  JUMP.heads.forEach((h,i)=>{if(headTop(h.el)-off<=st)on=i;});
  if(st+v.clientHeight>=v.scrollHeight-4)on=JUMP.heads.length-1;   // at the very bottom the last section is current
  if(on===JUMP.on)return;JUMP.on=on;
  $$('[data-j]',bar).forEach((b,i)=>{const a=i===on;b.classList.toggle('on',a);a?b.setAttribute('aria-current','true'):b.removeAttribute('aria-current');});
  const b=$(`[data-j="${on}"]`,bar),inner=$('.jump-in',bar);
  if(b&&inner){const bl=b.offsetLeft,br=bl+b.offsetWidth;if(bl<inner.scrollLeft+40||br>inner.scrollLeft+inner.clientWidth-40)inner.scrollTo({left:bl-inner.clientWidth/2+b.offsetWidth/2,behavior:motionOK()?'smooth':'auto'});}
}
function navOnScroll(){if(JUMP.raf)return;JUMP.raf=requestAnimationFrame(()=>{JUMP.raf=0;sync();});}

/* called after every render / in-place refresh */
function pageEnhance(){
  const v=$('#view');if(!v)return;
  // rows that open something are reachable from the keyboard (a11y.js covers most; these were missing)
  $$('.li[data-rid],.li[data-bill]',v).forEach(e=>{if(!e.hasAttribute('tabindex'))e.tabIndex=0;if(!e.getAttribute('role'))e.setAttribute('role','button');});
  clearTimeout(pageEnhance._t);pageEnhance._t=setTimeout(buildJump,60);   // after charts have laid out
}

/* ---------- shell pieces ---------- */
function mountNavShell(){
  const main=$('#main');if(!main)return;
  const tt=$('#totop');if(tt){tt.setAttribute('aria-label',tr('jump.top'));tt.title=tr('jump.top')+' (Home)';return;}   // shell rebuilt (language change): relabel only
  const bar=document.createElement('div');bar.id='jump';bar.className='jump';main.appendChild(bar);
  const t=document.createElement('button');t.id='totop';t.className='totop';t.setAttribute('aria-label',tr('jump.top'));t.title=tr('jump.top')+' (Home)';t.innerHTML=icon('chevron',18,2.4);
  t.onclick=()=>{const v=$('#view');v.scrollTo({top:0,behavior:motionOK()?'smooth':'auto'});const h=$('.lt h1',v);if(h){h.tabIndex=-1;h.focus({preventScroll:true});}};
  main.appendChild(t);
  $('#view').addEventListener('scroll',navOnScroll,{passive:true});
  window.addEventListener('resize',debounce(()=>{buildJump();},200));
}

/* ---------- keyboard: move through lists, "/" to search ---------- */
const ROW_SEL='.li[tabindex],.gcard[tabindex],[data-acc][tabindex],[data-bud][tabindex],[data-goal][tabindex],.rtile[tabindex],.selrow,.ins-item[tabindex],.wcard[tabindex]';
function visibleRows(){return $$('#view '+ROW_SEL.split(',').join(',#view ')).filter(e=>e.offsetParent&&e.getAttribute('tabindex')!=='-1'&&!e.closest('[hidden]'));}
document.addEventListener('keydown',e=>{
  if(!S||e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
  if($('#modal').classList.contains('on')||$('#cmd').classList.contains('on')||$('#lock').classList.contains('on')||$('.ctx-menu')||$('.tour-root'))return;
  const a=document.activeElement,typing=a&&(/INPUT|TEXTAREA|SELECT/.test(a.tagName)||a.isContentEditable);
  if(e.key==='/'&&!typing){
    const f=$$('#view .searchfield input,#view input[type=search]').find(x=>x.offsetParent);
    e.preventDefault();if(f){f.focus();f.select();}else openCmd();return;
  }
  if(typing)return;
  const v=$('#view');
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  const inView=a&&v.contains(a);
  const rows=visibleRows();
  if(!rows.length)return;
  let i=inView?rows.indexOf(a):-1;
  if(i<0){
    if(!inView&&a!==document.body&&a!==v)return;   // keys stay with the sidebar, top bar, etc.
    if(e.key==='Home'){v.scrollTo({top:0,behavior:motionOK()?'smooth':'auto'});e.preventDefault();}
    else if(e.key==='End'){v.scrollTo({top:v.scrollHeight,behavior:motionOK()?'smooth':'auto'});e.preventDefault();}
    return;                                        // arrows scroll the page as usual
  }
  e.preventDefault();
  const n=e.key==='ArrowDown'?Math.min(rows.length-1,i+1):e.key==='ArrowUp'?Math.max(0,i-1):e.key==='Home'?0:rows.length-1;
  const el=rows[n];el.focus({preventScroll:true});
  const r=el.getBoundingClientRect(),vr=v.getBoundingClientRect(),pad=($('#jump.on')||{}).offsetHeight||0;
  if(r.top<vr.top+pad+8)v.scrollBy({top:r.top-vr.top-pad-60});else if(r.bottom>vr.bottom-8)v.scrollBy({top:r.bottom-vr.bottom+60});
});
