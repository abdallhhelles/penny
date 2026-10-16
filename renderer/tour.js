'use strict';
/* =========================================================================
   Interactive tour (1.9): spotlights the real controls one by one, with a short explanation next to each.
   Starts after first-time setup; can be replayed from Settings > Updates & help. Keyboard: → / Enter next, ← back,
   Esc closes. Works in right-to-left languages, follows "reduce motion", and never blocks the app if a target is missing.
   ========================================================================= */
const TOUR=[
  {k:'welcome'},
  {k:'overview',sel:'#side .nav[data-nav=dashboard]',page:'dashboard',ic:'home'},
  {k:'add',sel:'#top [data-act=add]',ic:'plus',kbd:1},
  {k:'ask',sel:'#srch',ic:'search',kbd:1},
  {k:'privacy',sel:'#privbtn',ic:'eye',kbd:1},
  {k:'import',sel:'#side .nav[data-nav=transactions]',ic:'list'},
  {k:'budgets',sel:'#side .nav[data-nav=budgets]',ic:'target'},
  {k:'reminders',sel:'#side .nav[data-nav=reminders]',ic:'bell'},
  {k:'report',sel:'#side .nav[data-nav=report]',ic:'shield'},
  {k:'security',sel:'#side .nav[data-nav=settings]',ic:'lock'},
  {k:'done'}
];
let _tour=null;
function startTour(at=0){
  tourEnd(true);closeCmd&&closeCmd();if($('#modal').classList.contains('on'))closeModal();
  if(cur!=='dashboard')go('dashboard');
  const root=document.createElement('div');root.className='tour-root';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','tr_t');
  root.innerHTML=`<div class="tour-veil"></div><div class="tour-spot" aria-hidden="true"></div><div class="tour-pop" tabindex="-1"><div class="tour-arrow"></div><div id="tr_c"></div></div>`;
  document.body.appendChild(root);
  _tour={i:at,root,prevFocus:document.activeElement};
  const kd=e=>{if(!_tour)return;if(e.key==='Escape'){e.preventDefault();tourEnd();}else if(e.key==='ArrowRight'||e.key==='Enter'&&!/BUTTON/.test(e.target.tagName)){e.preventDefault();tourStep(document.dir==='rtl'&&e.key==='ArrowRight'?-1:1);}else if(e.key==='ArrowLeft'){e.preventDefault();tourStep(document.dir==='rtl'?1:-1);}};
  const rs=debounce(()=>_tour&&tourDraw(),80);
  _tour.off=()=>{document.removeEventListener('keydown',kd,true);window.removeEventListener('resize',rs);};
  document.addEventListener('keydown',kd,true);window.addEventListener('resize',rs);
  $('.tour-veil',root).onclick=()=>{};  // clicks outside do nothing: Skip is explicit
  requestAnimationFrame(()=>{root.classList.add('on');tourDraw();});
}
function tourStep(d){if(!_tour)return;const n=_tour.i+d;if(n<0)return;if(n>=TOUR.length){tourEnd();return;}_tour.i=n;tourDraw();}
function tourEnd(silent){
  if(!_tour)return;const t=_tour;_tour=null;t.off();t.root.classList.remove('on');setTimeout(()=>t.root.remove(),260);
  if(!silent&&S){S.settings.tourDone=true;S.settings.tipsSeen=true;save();}
  try{t.prevFocus&&t.prevFocus.focus&&t.prevFocus.focus();}catch{}
}
function tourDraw(){
  const t=_tour;if(!t)return;const st=TOUR[t.i],root=t.root,pop=$('.tour-pop',root),spot=$('.tour-spot',root),arrow=$('.tour-arrow',root);
  if(st.page&&cur!==st.page)go(st.page);
  const el=st.sel?$(st.sel):null,r=el&&el.getClientRects().length?el.getBoundingClientRect():null;
  const n=TOUR.length-2,num=t.i,last=t.i===TOUR.length-1,first=t.i===0,name=callName();
  const head=first?`<div class="tour-hero">${LOGO_SVG(40)}</div>`:last?`<div class="tour-hero done">${icon('check',34,2.6)}</div>`:`<div class="tour-ic">${icon(st.ic,18,2.2)}</div>`;
  const title=first?tr('tour.welcome.t',{name:name?', '+name:''}):tr('tour.'+st.k+'.t');
  const body=tr('tour.'+st.k+(st.k==='security'&&!VAULT.encrypted?'.d2':'.d'));
  const kbd=st.kbd?`<kbd class="tour-kbd">${trh('tour.'+st.k+'.k')}</kbd>`:'';
  const dots=first||last?'':`<div class="tour-dots" aria-label="${esc(tr('tour.step',{n:String(num),total:String(n)}))}">${Array.from({length:n},(_,i)=>`<i class="${i+1===num?'on':i+1<num?'past':''}"></i>`).join('')}</div>`;
  const btns=first?`<button class="btn" id="tr_skip">${trh('tour.skip')}</button><button class="btn pri" id="tr_next">${trh('tour.start')}</button>`
    :last?`<div class="tour-quick"><button class="btn" data-q="add">${icon('plus',15,2.4)} ${trh('tour.q.add')}</button><button class="btn" data-q="import">${icon('download',15)} ${trh('tour.q.import')}</button><button class="btn" data-q="lock">${icon('lock',15)} ${trh('tour.q.lock')}</button></div><button class="btn pri wide" id="tr_next">${trh('tour.finish')}</button>`
    :`<button class="btn ghosty" id="tr_skip">${trh('tour.skip')}</button><span class="grow"></span><button class="btn" id="tr_back" ${num<=1?'disabled':''} aria-label="${trh('tour.back')}">${icon('chevleft',16,2.4)}</button><button class="btn pri" id="tr_next">${trh(t.i===TOUR.length-2?'tour.last':'tour.next')} ${icon('chevron',16,2.4)}</button>`;
  $('#tr_c',root).innerHTML=`${head}${dots}<h3 id="tr_t">${esc(title)}</h3><p>${esc(body)} ${kbd}</p><div class="tour-btns">${btns}</div>`;
  pop.classList.toggle('center',!r);pop.classList.toggle('tour-big',first||last);
  // spotlight + bubble placement
  const pad=6,vw=innerWidth,vh=innerHeight;
  if(r){
    spot.style.cssText=`opacity:1;left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px;border-radius:${Math.min(16,r.height/2+pad)}px`;
    const pw=Math.min(340,vw-32),ph=pop.offsetHeight||200,inSide=r.left<vw*.3&&r.top>60;
    let x,y,side;
    if(inSide){side=document.dir==='rtl'?'left':'right';x=document.dir==='rtl'?r.left-pw-18:r.right+18;y=r.top+r.height/2-ph/2;}
    else{side='below';x=r.left+r.width/2-pw/2;y=r.bottom+16;}
    x=Math.max(16,Math.min(vw-pw-16,x));y=Math.max(16,Math.min(vh-ph-16,y));
    pop.style.cssText=`width:${pw}px;left:${x}px;top:${y}px`;
    arrow.className='tour-arrow '+side;
    if(side==='below')arrow.style.cssText=`left:${Math.max(18,Math.min(pw-18,r.left+r.width/2-x))}px`;
    else arrow.style.cssText=`top:${Math.max(18,Math.min(ph-18,r.top+r.height/2-y))}px`;
  }else{spot.style.cssText='opacity:0';pop.style.cssText='';arrow.className='tour-arrow none';}
  // wire
  const on=(id,fn)=>{const e=$('#'+id,root);if(e)e.onclick=fn;};
  on('tr_next',()=>tourStep(1));on('tr_back',()=>tourStep(-1));on('tr_skip',()=>tourEnd());
  $$('[data-q]',root).forEach(b=>b.onclick=()=>{const q=b.dataset.q;tourEnd();setTimeout(()=>{if(q==='add')openTx();else if(q==='import'){go('transactions');importCSV();}else if(q==='lock'){SET_CAT='security';go('settings');setTimeout(()=>!S.settings.pin&&openPinSetup(),300);}},280);});
  setTimeout(()=>{const f=$('#tr_next',root);f&&f.focus({preventScroll:true});},60);
}
