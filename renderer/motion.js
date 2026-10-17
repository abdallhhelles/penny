'use strict';
/* =========================================================================
   Motion & smoothness (1.9)
   - morph(): updates the page IN PLACE after a change (toggle, save, filter) instead of rebuilding it, so
     switches slide, focus and scroll stay put, open menus stay open and nothing flashes.
   - Sidebar pill that glides to the active page; each tab remembers where you scrolled.
   - Sheets and dialogs animate out as well as in.
   Respects Settings › Motion and the system "reduce motion" setting.
   ========================================================================= */
const motionOK=()=>{try{return(S&&S.settings.motion||'full')!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{return true;}};

/* ---------- in-place DOM update ---------- */
function morphChildren(from,to){
  const next=[...to.childNodes];
  for(let i=0;i<next.length;i++){
    const nb=next[i];let na=from.childNodes[i];
    // keep elements with an id even if they moved (lists re-ordering, rows inserted above)
    if(nb.nodeType===1&&nb.id&&(!na||na.id!==nb.id)){const m=from.querySelector(':scope > #'+CSS.escape(nb.id));if(m){from.insertBefore(m,na||null);na=m;}}
    if(!na){from.appendChild(nb);continue;}
    if(na.nodeType!==nb.nodeType||(nb.nodeType===1&&(na.tagName!==nb.tagName||(na.id||'')!==(nb.id||'')))){from.replaceChild(nb,na);continue;}
    if(nb.nodeType===1)morphEl(na,nb);
    else if(na.nodeValue!==nb.nodeValue)na.nodeValue=nb.nodeValue;
  }
  while(from.childNodes.length>next.length)from.removeChild(from.lastChild);
}
function morphEl(from,to){
  const keepOpen=from.tagName==='DETAILS'&&from.hasAttribute('open');
  for(const a of [...from.attributes])if(!to.hasAttribute(a.name)&&!(keepOpen&&a.name==='open'))from.removeAttribute(a.name);
  for(const a of [...to.attributes])if(from.getAttribute(a.name)!==a.value)from.setAttribute(a.name,a.value);
  const tag=from.tagName;
  if(tag==='INPUT'){
    if(from.type==='checkbox'||from.type==='radio'){if(from.checked!==to.checked)from.checked=to.checked;}
    else if(document.activeElement!==from&&from.value!==to.value)from.value=to.value;
    return;
  }
  if(tag==='TEXTAREA'){if(document.activeElement!==from&&from.value!==to.value)from.value=to.value;return;}
  morphChildren(from,to);
  if(tag==='SELECT'){const v=to.querySelector('option[selected]');const want=v?v.value:(to.options[0]&&to.options[0].value);if(want!=null&&from.value!==want)from.value=want;}
}
/* replace #view's content with html, keeping every element that is still there */
function morphView(v,html){
  const t=document.createElement('template');t.innerHTML=html;
  morphChildren(v,t.content);
}

/* ---------- sidebar pill ---------- */
function placeNavPill(instant){
  const side=$('#side'),on=side&&$('.nav.on',side);let pill=side&&$('.nav-pill',side);
  if(!side)return;
  if(!pill){pill=document.createElement('div');pill.className='nav-pill';pill.setAttribute('aria-hidden','true');side.prepend(pill);instant=true;}
  if(!on){pill.style.opacity='0';return;}
  const y=on.offsetTop,h=on.offsetHeight,x=on.offsetLeft,w=on.offsetWidth;
  if(instant||!motionOK())pill.classList.add('instant');
  pill.style.cssText=`opacity:1;transform:translate(${x}px,${y}px);width:${w}px;height:${h}px`;
  if(pill.classList.contains('instant'))requestAnimationFrame(()=>requestAnimationFrame(()=>pill.classList.remove('instant')));
}
window.addEventListener('resize',debounce(()=>placeNavPill(true),120));

/* ---------- per-tab scroll memory ---------- */
const SCROLL_MEM={};

/* ---------- dialogs close with a short animation ----------
   closeModal() empties #modal at once (code often opens the next sheet right after), so the exit plays on a
   static copy laid over the same spot. */
function modalExit(){
  const m=$('#modal');if(!m||!m.classList.contains('on')||!motionOK())return;
  const box=m.firstElementChild;if(!box)return;
  const r=box.getBoundingClientRect(),g=document.createElement('div');
  g.className='modal-ghost';g.setAttribute('aria-hidden','true');
  const c=box.cloneNode(true);c.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));c.removeAttribute('id');
  c.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;animation:none;max-height:none;overflow:hidden`;
  g.appendChild(c);document.body.appendChild(g);
  const bg=document.createElement('div');bg.className='modal-ghost-bg';g.prepend(bg);
  requestAnimationFrame(()=>g.classList.add('out'));
  setTimeout(()=>g.remove(),260);
}
