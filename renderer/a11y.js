'use strict';
/* Keyboard + screen-reader layer. It adds no new behaviour of its own: it makes what is already clickable reachable and
   named for keyboards and assistive tech.
   - clickable cards/rows (divs) get role="button", tabindex="0" and respond to Enter / Space
   - inputs without a visible label are named from their placeholder
   - dialogs get role="dialog" + aria-modal + a name, keep Tab inside, and give focus back to where it was
   - toasts are announced politely */
(function(){
  const CLICKY='.litx,.wcardacc,.acardbud,.libud,.gcardgoal,.li[data-tx],[data-nav],[data-bud],[data-acc],[data-goal],[data-tx],[data-loan],[data-inv],[data-sug]';
  const NATIVE=new Set(['BUTTON','A','INPUT','SELECT','TEXTAREA','SUMMARY','LABEL']);
  const visible=e=>e.offsetParent!==null;
  function enhance(root){
    (root||document).querySelectorAll(CLICKY).forEach(e=>{
      if(NATIVE.has(e.tagName)||e.closest('[data-noa11y]'))return;
      if(!e.getAttribute('role'))e.setAttribute('role','button');
      if(!e.hasAttribute('tabindex'))e.tabIndex=0;
    });
    (root||document).querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select').forEach(e=>{
      if(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby'))return;
      if(e.id&&document.querySelector(`label[for="${CSS.escape(e.id)}"]`))return;
      if(e.closest('label'))return;
      const prev=e.closest('.fr')&&e.closest('.fr').querySelector('label');
      const n=(prev&&prev.textContent.trim())||e.getAttribute('placeholder')||e.getAttribute('title');
      if(n)e.setAttribute('aria-label',n);
    });
  }
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const t=e.target;if(!t||NATIVE.has(t.tagName)||t.getAttribute('role')!=='button'||t.isContentEditable)return;
    e.preventDefault();t.click();
  });
  /* dialogs */
  const FOCUSABLE='button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  let back=null;
  const _open=window.openModal,_close=window.closeModal;
  window.openModal=function(html,mount){
    const was=document.activeElement;const r=_open.call(this,html,mount);
    const m=document.getElementById('modal');
    if(was&&was!==document.body&&!m.contains(was))back=was;
    m.setAttribute('role',m.querySelector('.alert')?'alertdialog':'dialog');m.setAttribute('aria-modal','true');
    const t=m.querySelector('.sh b,.alert h3,h2,h3');if(t)m.setAttribute('aria-label',t.textContent.trim());
    return r;
  };
  window.closeModal=function(){
    _close.apply(this,arguments);
    const m=document.getElementById('modal');m.removeAttribute('role');m.removeAttribute('aria-modal');m.removeAttribute('aria-label');
    if(back&&document.contains(back)&&visible(back)){try{back.focus({preventScroll:true});}catch{}}back=null;
  };
  document.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const m=document.getElementById('modal');if(!m||!m.classList.contains('on'))return;
    const f=[...m.querySelectorAll(FOCUSABLE)].filter(x=>x.offsetParent!==null);if(!f.length)return;
    const first=f[0],last=f[f.length-1];
    if(!m.contains(document.activeElement)){e.preventDefault();first.focus();}
    else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  const tz=document.getElementById('toasts');if(tz){tz.setAttribute('role','status');tz.setAttribute('aria-live','polite');}
  const side=document.getElementById('side');if(side)side.setAttribute('role','navigation');
  enhance();
})();
