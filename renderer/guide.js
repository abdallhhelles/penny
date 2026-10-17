'use strict';
/* ============ Personal touches + illustrated guide + tips ============ */
const AVATARS=['🙂','😎','🦊','🐼','🐱','🐶','🦄','🌻','🚀','🎧','☕','🌈','🍀','⭐','🦋','🐙'];
function avatarHtml(size=36,fs){
  const s=S.settings,st=`width:${size}px;height:${size}px;font-size:${fs||Math.round(size*.52)}px`;
  if(s.photo)return`<div class="avatar photo" style="${st};background-image:url(${s.photo})"></div>`;
  return`<div class="avatar" style="${st}">${s.avatar||esc((s.name||'You')[0].toUpperCase())}</div>`;
}
const callName=()=>(S.settings.nick||S.settings.name||'').trim();
function greetText(){
  const n=callName(),h=new Date().getHours(),g=greet(),st=S.settings.greet,nm=n?', '+esc(n):'';
  if(st==='minimal')return n?esc(n):g;
  if(st==='pro')return g+nm;
  if(st==='playful'){const L=['Hey','Hi','Look who\'s here','Welcome back','Ready'];const w=L[(new Date().getDate()+h)%L.length];return`${w}${nm}!`;}
  return`${g}${nm}`;
}
function resizePhoto(file){
  return new Promise((res,rej)=>{const fr=new FileReader();fr.onerror=rej;fr.onload=()=>{const im=new Image();im.onerror=rej;im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=160;const g=c.getContext('2d');const m=Math.min(im.width,im.height),sx=(im.width-m)/2,sy=(im.height-m)/2;g.drawImage(im,sx,sy,m,m,0,0,160,160);res(c.toDataURL('image/jpeg',.82));};im.src=fr.result;};fr.readAsDataURL(file);});
}

/* ---------- tips ---------- */
const TIPS=[
 {e:'⌨️',t:'Type it like you say it',d:'Press N and write “coffee 4.50 at Starbucks yesterday”. Penny fills in the amount, place, category and date.'},
 {e:'💬',t:'Ask Penny anything',d:'Press Ctrl K and ask “how much did I spend on dining last month?” — answers appear instantly, on your PC.'},
 {e:'🔔',t:'Never miss rent day',d:'Open Reminders and type “pay rent on the 1st at 9am monthly”. You’ll get a Windows notification with a sound.',go:'reminders',cta:'Open Reminders'},
 {e:'🎯',t:'Let Penny suggest budgets',d:'In Budgets, tap Auto-suggest and Penny will propose limits from your last three months.',go:'budgets',cta:'Open Budgets'},
 {e:'👁️',t:'Hide the numbers',d:'Press P to blur every amount when someone is looking. Hover an amount to peek.'},
 {e:'🪟',t:'Quick-add from anywhere',d:'Press Ctrl+Alt+P in Windows to add an expense without opening Penny first. Change it in Settings → Windows.',go:'settings',cta:'Windows settings'},
 {e:'🔁',t:'Subscriptions in disguise',d:'Penny spots monthly charges you never set up. Look for “hidden subscriptions” in Insights.',go:'insights',cta:'See insights'},
 {e:'📅',t:'See the month at a glance',d:'The Calendar shows spending heat, bills and reminders. Tap any day for details.',go:'calendar',cta:'Open Calendar'},
 {e:'🛟',t:'How long could you last?',d:'Insights shows your runway: how many months your cash would cover. Aim for 3 to 6.',go:'insights',cta:'See insights'},
 {e:'🎨',t:'Make it yours',d:'Choose light or dark, an avatar and how Penny greets you in Settings.',go:'settings',cta:'Personalise'},
 {e:'💾',t:'Your data is yours',d:'Export everything to one file in Settings → Your data, and import it into any newer Penny.',go:'settings',cta:'Open settings'},
 {e:'↩️',t:'Oops? Undo it',d:'Deleted something by accident? Tap Undo in the toast that appears at the top.'}
];
DW.tip=()=>{
  if(S.settings.tipsOff)return'';
  const t=TIPS[(S.settings.tipIdx||0)%TIPS.length];
  return`<div class="card glass tipcard"><div class="tip-e">${gl(t.e,24)}</div><div class="grow"><small class="tip-l">Tip of the day</small><b>${esc(t.t)}</b><p>${esc(t.d)}</p><div class="tip-b">${t.go?`<button class="btn sm pri" data-go="${t.go}">${t.cta}</button>`:''}<button class="btn sm" data-act="nexttip">Next tip</button><button class="btn sm ghost" data-act="tipsoff">Hide tips</button></div></div></div>`;
};

/* ---------- illustrations (mini UI mockups built from Penny's own components) ---------- */
const IL={
 welcome:()=>`<div class="il il-w"><div class="orbit o1"><i>${gl('💵',26)}</i></div><div class="orbit o2"><i>${gl('🪙',22)}</i></div><div class="orbit o3"><i>${gl('✨',20)}</i></div><div class="logo il-logo">${LOGO_SVG(66,'#0A7F66')}</div></div>`,
 add:()=>`<div class="il il-add"><div class="il-input"><span class="typing">coffee 4.50 at Starbucks</span><i class="caret"></i></div><div class="il-chips"><span class="cc on" style="--d:.9s">☕ Dining</span><span class="cc on" style="--d:1.15s">$4.50</span><span class="cc on" style="--d:1.4s">Today</span><span class="cc on" style="--d:1.65s">Checking</span></div><div class="il-btn" style="--d:2s">Add</div></div>`,
 ask:()=>`<div class="il il-ask"><div class="il-box"><div class="il-q">${icon('search',16)}<span class="typing t2">spent on dining last month?</span></div><div class="il-ans"><small>${icon('sparkles',11,2.4)} ANSWER</small><b>🍽️ $340.50 on dining</b><span>14 transactions · $11.35 a day</span></div></div><kbd class="il-k">Ctrl K</kbd></div>`,
 budget:()=>`<div class="il il-bud"><div class="il-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,.18)" stroke-width="11" fill="none"/><circle class="arc" cx="50" cy="50" r="40" stroke="#FF9F0A" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="251" stroke-dashoffset="251" transform="rotate(-90 50 50)"/></svg><b>$48</b><small>safe today</small></div><div class="il-bars">${[['🛒','Groceries',.72,'#30D158'],['🍽️','Dining',.9,'#FF9F0A'],['🚗','Transport',.38,'#0A7F66']].map(([e,n,p,c],i)=>`<div><span class="lic">${gl(e,15)}</span><span>${n}</span><div class="bar"><i style="--w:${p*100}%;--d:${.5+i*.2}s;background:${c}"></i></div></div>`).join('')}</div></div>`,
 remind:()=>`<div class="il il-rem"><div class="il-list">${[['🏠','Pay rent','1st · 9:00 AM',1],['🦷','Dentist','Thu · 3:30 PM',0],['💊','Vitamins','Every day',0]].map(([e,n,s,b],i)=>`<div class="li rem" style="--d:${.3+i*.18}s"><button class="chk ${b?'on':''}"><i>${icon('check',13,3)}</i></button><div class="sq sm">${gl(e,16)}</div><div class="grow"><b>${n}</b><small>${s}</small></div></div>`).join('')}</div><div class="il-notif"><div class="logo" style="width:30px;height:30px;border-radius:9px">${LOGO_SVG(18)}</div><div><b>🏠 Pay rent</b><small>Tomorrow · 9:00 AM · $1,250</small></div><span class="wave"><i></i><i></i><i></i></span></div></div>`,
 cal:()=>`<div class="il il-cal">${Array.from({length:28},(_,i)=>{const h=[3,7,12,18,24].includes(i)?'<i style="background:#FF9F0A"></i>':i===9?'<i style="background:#BF5AF2"></i>':'';const heat=(i*37%11)/22;return`<div class="d ${i===16?'today':''}" style="--h:${heat};--d:${i*18}ms"><span>${i+1}</span>${h}</div>`;}).join('')}</div>`,
 style:()=>`<div class="il il-sty"><div class="sw-row">${['#0A7F66','#BF5AF2','#FF375F','#FF9F0A','#30D158'].map((c,i)=>`<i style="background:${c};--d:${i*.1}s"></i>`).join('')}</div><div class="bgs"><b style="background:linear-gradient(135deg,#0A7F66,#5E5CE6)"></b><b style="background:linear-gradient(135deg,#FF7A45,#F0457C)"></b><b style="background:linear-gradient(135deg,#0A7F66,#30D5C8)"></b><b style="background:linear-gradient(135deg,#30D158,#A3D95B)"></b></div><div class="av-row">${['🦊','🐼','🚀','🌻'].map(e=>`<span>${e}</span>`).join('')}</div></div>`,
 safe:()=>`<div class="il il-safe"><div class="shield">${icon('lock',34,2)}</div><div class="il-tags"><span>${gl('🔒',14)}Passcode</span><span>${gl('👁️',14)}Hide amounts</span><span>${gl('🪟',14)}Hide from screen capture</span><span>${gl('💾',14)}Encrypted export</span></div></div>`
};
const GUIDE=[
 {k:'welcome',c:['#10201D','#1F3A34'],t:'Welcome to Penny',d:'A calm, private home for your money. Everything stays on this PC — no account, no cloud. Here’s a 60-second tour.'},
 {k:'add',c:['#0A7F66','#5E5CE6'],t:'Add things in one line',d:'Press N (or the + New button) and just type how you’d say it. Penny picks the amount, place, category and date for you.'},
 {k:'ask',c:['#5E5CE6','#BF5AF2'],t:'Ask Penny anything',d:'Press Ctrl K to search, jump to a page, or ask a question like “how much did I spend on dining last month?”.'},
 {k:'budget',c:['#FF9F0A','#FF453A'],t:'Know what’s safe to spend',d:'Set budgets (Penny can suggest them) and see how much you can spend today after bills — with rings that fill as you go.'},
 {k:'remind',c:['#FF453A','#FF375F'],t:'Reminders that actually ping you',d:'Rent, bills, appointments, medicine. Pick a time and a sound — Penny sends a Windows notification even when it’s in the tray.'},
 {k:'cal',c:['#32ADE6','#0A7F66'],t:'See the whole month',d:'The Calendar shows heat for spending days plus bills and reminders. Tap a day to see or add things.'},
 {k:'style',c:['#BF5AF2','#FF375F'],t:'Make it yours',d:'Light or dark, your avatar, your nickname and how Penny greets you. Make it feel like yours.'},
 {k:'safe',c:['#30D158','#0A7F66'],t:'Private and in your control',d:'Lock with a passcode, hide amounts with P, launch at startup, quick-add with a hotkey, and export your data any time.'}
];
let gi=0;
function openGuide(start=0){
  gi=start;
  const s=openModal(`<div class="sheet guide" data-noclose><div class="gd-art" id="gda"></div><div class="gd-body"><h2 id="gdt"></h2><p id="gdd"></p><div class="gd-dots" id="gdp"></div><div class="gd-btns"><button class="btn" id="gds">Skip</button><span style="flex:1"></span><button class="btn" id="gdb">Back</button><button class="btn pri" id="gdn">Next</button></div></div></div>`);
  const box=$('.sheet',s)||$('.sheet');
  const draw=(dir=1)=>{
    const g=GUIDE[gi];
    $('#gda').style.background=`linear-gradient(140deg,${g.c[0]},${g.c[1]})`;
    $('#gda').innerHTML=`<div class="gd-in" style="animation-name:${dir>0?'gdR':'gdL'}">${IL[g.k]()}</div>`;
    $('#gdt').textContent=g.t;$('#gdd').textContent=g.d;
    $('#gdp').innerHTML=GUIDE.map((_,i)=>`<i class="${i===gi?'on':''}" data-i="${i}"></i>`).join('');
    $('#gdb').style.visibility=gi?'visible':'hidden';$('#gdn').textContent=gi===GUIDE.length-1?'Get started':'Next';$('#gds').style.display=gi===GUIDE.length-1?'none':'';
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
