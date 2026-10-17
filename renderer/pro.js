'use strict';
/* ============ Penny Pro — plans, entitlements & license (monetization scaffolding) ============
   MONETIZATION.enabled = false  → everything is unlocked ("Early access"). Flip to true when you launch paid plans:
   the gates below (limits + Pro features) start enforcing, and the upgrade sheet appears. Licenses are verified
   OFFLINE (Ed25519) in the main process — issue keys with tools/make-license.js. No server needed to start selling. */
const MONETIZATION={
  enabled:false,                       // ← the master switch
  purchaseUrl:'',                      // e.g. 'https://penny.app/pro' (opens in the browser). Empty = button hidden
  price:{monthly:'$3.99',yearly:'$29',lifetime:'$59'}, // display only — set to your real pricing
  freeLimits:{accounts:3,goals:2}
};
const PRO_FEATURES=[
  {id:'accounts',icon:'card',color:'#BF5AF2',n:'Unlimited accounts & goals',d:'Free includes 3 accounts and 2 goals'},
  {id:'plan',icon:'bolt',color:'#FF9F0A',n:'Projections: debt payoff & what-if',d:'Avalanche vs snowball, future net worth, goal ETAs'},
  {id:'encrypt',icon:'lock',color:'#5E5CE6',n:'Encrypted exports',d:'AES-256 password-protected backups'},
  {id:'backgrounds',icon:'palette',color:'#FF375F',n:'Premium backgrounds',d:'Sunset, Ocean, Forest, Graphite, Mono and more'},
  {id:'insightsPlus',icon:'sparkles',color:'#30D158',n:'Deep insights',d:'Price-hike alerts, double-charge detection, anomalies'},
  {id:'support',icon:'star',color:'#FFD60A',n:'Priority support & early features',d:'Help first, and a say in what we build next'}
];
let LIC={plan:'free',ok:false};
const isPro=()=>!MONETIZATION.enabled||(LIC.ok&&LIC.plan==='pro');
const can=id=>isPro();
const limitOf=k=>isPro()?Infinity:MONETIZATION.freeLimits[k];
async function loadLicense(){
  if(typeof hasNative!=='undefined'&&hasNative&&native.licenseGet){try{const r=await native.licenseGet();if(r.ok)LIC={ok:true,plan:r.payload.plan,name:r.payload.name,email:r.payload.email,expires:r.payload.expires,id:r.payload.id,issued:r.payload.issued};else LIC={ok:false,plan:'free',reason:r.reason};}catch{}}
  return LIC;
}
/* Run fn if the feature is available, otherwise show the upgrade sheet. */
function gate(id,fn){if(can(id)){fn&&fn();return true;}openUpgrade(id);return false;}
const proSoon=()=>!MONETIZATION.enabled;   // no paid plan yet: Pro is shown as "coming soon" and everything stays free
function planBadge(){return proSoon()?`<span class="pill pro soon">${trh('pro.soonBadge')}</span>`:isPro()?'<span class="pill pro">PRO</span>':'<span class="pill">FREE</span>';}
const PRO_SOON=[['bolt','pro.f.plan'],['sparkles','pro.f.insights'],['lock','pro.f.exports'],['calendar','pro.f.wrapped'],['star','pro.f.support']];
function openProSoon(){
  openSheet({title:tr('pro.title'),ok:null,cancel:tr('about.close'),body:`
   <div style="text-align:center;margin:2px 0 18px"><div class="logo" style="margin:0 auto 12px;width:64px;height:64px">${LOGO_SVG(64)}</div>
    <span class="pill pro soon">${trh('pro.soonBadge')}</span>
    <h2 style="font-size:24px;letter-spacing:-.5px;margin:10px 0 0">${trh('pro.soonTitle')}</h2><p class="muted" style="margin:6px auto 0;max-width:380px">${trh('pro.soonSub')}</p></div>
   <div class="sec-h" style="margin-top:0">${trh('pro.soonPlanned')}</div>
   <div class="group" style="margin-bottom:14px">${PRO_SOON.map(([ic,k])=>`<div class="li noicon" style="min-height:54px"><div class="sq ico sm">${icon(ic,16)}</div><div class="grow"><b>${trh(k)}</b><small>${trh(k+'D')}</small></div></div>`).join('')}</div>
   ${typeof hasCommunity==='function'&&hasCommunity()?`<button class="btn pri" id="pro_notify" style="width:100%;height:48px">${icon('chat',16,2.2)} ${trh('pro.notify')}</button>`:''}
   <p class="faint sm" style="text-align:center;margin:12px 0 0">${trh('pro.soonNote')}</p>`,
   mount(s){const b=$('#pro_notify',s);if(b)b.onclick=()=>{closeModal();joinCommunity();};}});
}

function openUpgrade(focus){
  if(proSoon())return openProSoon();
  openSheet({title:'Penny Pro',ok:null,cancel:'Close',body:`
   <div style="text-align:center;margin:2px 0 18px"><div class="logo" style="margin:0 auto 12px;width:64px;height:64px;border-radius:20px">${LOGO_SVG(64)}</div>
    <h2 style="font-size:26px;letter-spacing:-.6px;margin:0">Penny Pro</h2><p class="muted" style="margin:6px 0 0">Everything in Penny, with no limits.</p></div>
   <div class="group" style="margin-bottom:14px">${PRO_FEATURES.map(f=>`<div class="li noicon ${f.id===focus?'hl':''}" style="min-height:54px"><div class="sq ico sm" style="--c:${f.color}">${icon(f.icon,16)}</div><div class="grow"><b>${f.n}</b><small>${f.d}</small></div>${icon('check',16,2.6)}</div>`).join('')}</div>
   ${MONETIZATION.purchaseUrl?`<div class="plans">${[['monthly','Monthly'],['yearly','Yearly'],['lifetime','Lifetime']].map(([k,l])=>`<div class="plan ${k==='yearly'?'on':''}" data-plan="${k}"><small>${l}</small><b>${MONETIZATION.price[k]}</b></div>`).join('')}</div><button class="btn pri" id="buy" style="width:100%;height:50px;font-size:16px;margin-top:12px">Get Penny Pro</button>`:`<div class="sec-f" style="text-align:center;margin-top:0">Paid plans aren't available yet.</div>`}
   <div class="sec-h" style="margin-top:20px">Have a license key?</div>
   <div class="fg"><div class="fr"><input id="lk" placeholder="PENNY-…" autocomplete="off" spellcheck="false"></div></div>
   <button class="btn" id="act" style="width:100%;margin-top:10px">Activate</button>`,
   mount(s){
    $$('.plan',s).forEach(p=>p.onclick=()=>{$$('.plan',s).forEach(x=>x.classList.toggle('on',x===p));});
    const buy=$('#buy',s);if(buy)buy.onclick=()=>window.open(MONETIZATION.purchaseUrl+'?plan='+($('.plan.on',s)?.dataset.plan||'yearly'));
    $('#act',s).onclick=()=>activateKey($('#lk',s).value,true);
   }});
}
async function activateKey(key,close){
  key=String(key||'').trim();if(!key){toast('Paste your license key first');return false;}
  if(!(typeof hasNative!=='undefined'&&hasNative&&native.licenseActivate)){toast('Activation works in the installed app');return false;}
  const r=await native.licenseActivate(key);
  if(!r.ok){toast({format:'That key is not valid',signature:'That key is not valid',expired:'That license has expired'}[r.reason]||'That key is not valid');return false;}
  await loadLicense();if(close)closeModal();toast('Penny Pro activated — thank you!');if(typeof refresh==='function')refresh();return true;
}
async function removeLicense(){if(hasNative&&native.licenseRemove)await native.licenseRemove();await loadLicense();toast('License removed from this PC');if(typeof refresh==='function')refresh();}
