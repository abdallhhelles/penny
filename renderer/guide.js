'use strict';
/* ============ Personal touches + illustrated guide + tips ============ */
const callName=()=>(S.settings.nick||S.settings.name||'').trim();
function greetText(){
  const n=callName(),h=new Date().getHours(),g=greet(),st=S.settings.greet,nm=n?', '+esc(n):'';
  if(st==='minimal')return n?esc(n):g;
  if(st==='pro')return g+nm;
  if(st==='playful'){const L=['hey','hi','look','back','ready'].map(k=>esc(tr('greet.p.'+k)));const w=L[(new Date().getDate()+h)%L.length];return`${w}${nm}!`;}
  return`${g}${nm}`;
}
/* ---------- tips ---------- */
const TIPS=[
 {e:'⌨️',k:'type'},
 {e:'💬',k:'ask'},
 {e:'🔔',k:'rent',go:'reminders'},
 {e:'🎯',k:'budgets',go:'budgets'},
 {e:'👁️',k:'hide'},
 {e:'🪟',k:'quick',go:'settings'},
 {e:'🔁',k:'subs',go:'insights'},
 {e:'📅',k:'cal',go:'calendar'},
 {e:'🛟',k:'runway',go:'insights'},
 {e:'🎨',k:'style',go:'settings'},
 {e:'💾',k:'data',go:'settings'},
 {e:'↩️',k:'undo'}
];
DW.tip=()=>{
  if(S.settings.tipsOff)return'';
  const t=TIPS[(S.settings.tipIdx||0)%TIPS.length];
  return`<div class="card glass tipcard"><div class="tip-e">${gl(t.e,24)}</div><div class="grow"><small class="tip-l">${trh('tip.label')}</small><b>${trh('tip.'+t.k+'.t')}</b><p>${trh('tip.'+t.k+'.d')}</p><div class="tip-b">${t.go?`<button class="btn sm pri" data-go="${t.go}">${trh('tip.'+t.k+'.cta')}</button>`:''}<button class="btn sm" data-act="nexttip">${trh('tip.next')}</button><button class="btn sm ghost" data-act="tipsoff">${trh('tip.hide')}</button></div></div></div>`;
};

/* ---------- illustrations (mini UI mockups built from Penny's own components) ---------- */
const IL={
 welcome:()=>`<div class="il il-w"><div class="orbit o1"><i>${gl('💵',26)}</i></div><div class="orbit o2"><i>${gl('🪙',22)}</i></div><div class="orbit o3"><i>${gl('✨',20)}</i></div><div class="logo il-logo">${LOGO_SVG(66,'#0A7F66')}</div></div>`,
 add:()=>`<div class="il il-add"><div class="il-input"><span class="typing">${trh('il.add.typed')}</span><i class="caret"></i></div><div class="il-chips"><span class="cc on" style="--d:.9s">☕ ${trh('cat.def.dining')}</span><span class="cc on" style="--d:1.15s">$4.50</span><span class="cc on" style="--d:1.4s">${trh('il.today')}</span><span class="cc on" style="--d:1.65s">${trh('acct.checking')}</span></div><div class="il-btn" style="--d:2s">${trh('common.add')}</div></div>`,
 ask:()=>`<div class="il il-ask"><div class="il-box"><div class="il-q">${icon('search',16)}<span class="typing t2">${trh('il.ask.typed')}</span></div><div class="il-ans"><small style="text-transform:uppercase">${icon('sparkles',11,2.4)} ${trh('il.ask.answer')}</small><b>🍽️ ${trh('il.ask.result')}</b><span>${trh('il.ask.detail')}</span></div></div><kbd class="il-k">Ctrl K</kbd></div>`,
 budget:()=>`<div class="il il-bud"><div class="il-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,.18)" stroke-width="11" fill="none"/><circle class="arc" cx="50" cy="50" r="40" stroke="#FF9F0A" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="251" stroke-dashoffset="251" transform="rotate(-90 50 50)"/></svg><b>$48</b><small>${trh('il.safeToday')}</small></div><div class="il-bars">${[['🛒',tr('cat.def.groceries'),.72,'#30D158'],['🍽️',tr('cat.def.dining'),.9,'#FF9F0A'],['🚗',tr('cat.def.transport'),.38,'#0A7F66']].map(([e,n,p,c],i)=>`<div><span class="lic">${gl(e,15)}</span><span>${n}</span><div class="bar"><i style="--w:${p*100}%;--d:${.5+i*.2}s;background:${c}"></i></div></div>`).join('')}</div></div>`,
 remind:()=>`<div class="il il-rem"><div class="il-list">${[['🏠',tr('demo.r.rent'),tr('il.rem.s1'),1],['🦷',tr('il.rem.dentist'),tr('il.rem.s2'),0],['💊',tr('il.rem.vitamins'),tr('il.rem.s3'),0]].map(([e,n,s,b],i)=>`<div class="li rem" style="--d:${.3+i*.18}s"><button class="chk ${b?'on':''}"><i>${icon('check',13,3)}</i></button><div class="sq sm">${gl(e,16)}</div><div class="grow"><b>${n}</b><small>${s}</small></div></div>`).join('')}</div><div class="il-notif"><div class="logo" style="width:30px;height:30px;border-radius:9px">${LOGO_SVG(18)}</div><div><b>🏠 ${trh('demo.r.rent')}</b><small>${trh('il.rem.notif')}</small></div><span class="wave"><i></i><i></i><i></i></span></div></div>`,
 cal:()=>`<div class="il il-cal">${Array.from({length:28},(_,i)=>{const h=[3,7,12,18,24].includes(i)?'<i style="background:#FF9F0A"></i>':i===9?'<i style="background:#BF5AF2"></i>':'';const heat=(i*37%11)/22;return`<div class="d ${i===16?'today':''}" style="--h:${heat};--d:${i*18}ms"><span>${i+1}</span>${h}</div>`;}).join('')}</div>`,
 style:()=>`<div class="il il-sty"><div class="sw-row">${['#0A7F66','#BF5AF2','#FF375F','#FF9F0A','#30D158'].map((c,i)=>`<i style="background:${c};--d:${i*.1}s"></i>`).join('')}</div><div class="bgs"><b style="background:linear-gradient(135deg,#0A7F66,#5E5CE6)"></b><b style="background:linear-gradient(135deg,#FF7A45,#F0457C)"></b><b style="background:linear-gradient(135deg,#0A7F66,#30D5C8)"></b><b style="background:linear-gradient(135deg,#30D158,#A3D95B)"></b></div><div class="av-row">${['🦊','🐼','🚀','🌻'].map(e=>`<span>${e}</span>`).join('')}</div></div>`,
 safe:()=>`<div class="il il-safe"><div class="shield">${icon('lock',34,2)}</div><div class="il-tags"><span>${gl('🔒',14)}${trh('il.safe.pass')}</span><span>${gl('👁️',14)}${trh('ctx.hideAmounts')}</span><span>${gl('🪟',14)}${trh('il.safe.capture')}</span><span>${gl('💾',14)}${trh('il.safe.export')}</span></div></div>`
};
const GUIDE=[
 {k:'welcome',c:['#10201D','#1F3A34']},
 {k:'add',c:['#0A7F66','#5E5CE6']},
 {k:'ask',c:['#5E5CE6','#BF5AF2']},
 {k:'budget',c:['#FF9F0A','#FF453A']},
 {k:'remind',c:['#FF453A','#FF375F']},
 {k:'cal',c:['#32ADE6','#0A7F66']},
 {k:'style',c:['#BF5AF2','#FF375F']},
 {k:'safe',c:['#30D158','#0A7F66']}
];
let gi=0;
function openGuide(start=0){
  gi=start;
  const s=openModal(`<div class="sheet guide" data-noclose><div class="gd-art" id="gda"></div><div class="gd-body"><h2 id="gdt"></h2><p id="gdd"></p><div class="gd-dots" id="gdp"></div><div class="gd-btns"><button class="btn" id="gds">${trh('tour.skip')}</button><span style="flex:1"></span><button class="btn" id="gdb">${trh('tour.back')}</button><button class="btn pri" id="gdn">${trh('tour.next')}</button></div></div></div>`);
  const box=$('.sheet',s)||$('.sheet');
  const draw=(dir=1)=>{
    const g=GUIDE[gi];
    $('#gda').style.background=`linear-gradient(140deg,${g.c[0]},${g.c[1]})`;
    $('#gda').innerHTML=`<div class="gd-in" style="animation-name:${dir>0?'gdR':'gdL'}">${IL[g.k]()}</div>`;
    $('#gdt').textContent=tr('guide.'+g.k+'.t');$('#gdd').textContent=tr('guide.'+g.k+'.d');
    $('#gdp').innerHTML=GUIDE.map((_,i)=>`<i class="${i===gi?'on':''}" data-i="${i}"></i>`).join('');
    $('#gdb').style.visibility=gi?'visible':'hidden';$('#gdn').textContent=tr(gi===GUIDE.length-1?'start.title':'tour.next');$('#gds').style.display=gi===GUIDE.length-1?'none':'';
  };
  const done=()=>{document.removeEventListener('keydown',kd);closeModal();S.settings.tourDone=true;S.settings.tipsSeen=true;save();};
  const next=()=>{if(gi>=GUIDE.length-1){done();return;}gi++;draw(1);};
  const back=()=>{if(gi>0){gi--;draw(-1);}};
  const kd=e=>{if(!$('#gdn'))return document.removeEventListener('keydown',kd);if(e.key==='ArrowRight'||e.key==='Enter'){e.preventDefault();next();}else if(e.key==='ArrowLeft')back();else if(e.key==='Escape')done();};
  document.addEventListener('keydown',kd);
  $('#gdn').onclick=next;$('#gdb').onclick=back;$('#gds').onclick=done;
  $('#gdp').onclick=e=>{const i=e.target.dataset.i;if(i!==undefined){const d=+i>gi?1:-1;gi=+i;draw(d);}};
  $('#modal').onmousedown=null;
  draw(1);
}
