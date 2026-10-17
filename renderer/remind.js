'use strict';
/* ============ Reminders — a planner for bills, rent, appointments and anything else ============ */
const REM_KINDS={
  bill:{e:'💳',c:'#FF9F0A',pay:true,get n(){return tr('rem.k.bill')}},rent:{e:'🏠',c:'#5E5CE6',pay:true,get n(){return tr('rem.k.rent')}},
  appt:{e:'🗓️',c:'#0A84FF',get n(){return tr('rem.k.appt')}},med:{e:'💊',c:'#FF375F',get n(){return tr('rem.k.med')}},
  bday:{e:'🎂',c:'#BF5AF2',get n(){return tr('rem.k.bday')}},task:{e:'✅',c:'#30D158',get n(){return tr('rem.k.task')}},custom:{e:'🔔',c:'#8E8E93',get n(){return tr('rem.k.custom')}}
};
const REM_REPEAT={get none(){return tr('freq.never')},get daily(){return tr('rem.rep.daily')},get weekly(){return tr('rem.rep.weekly')},get biweekly(){return tr('freq.biweekly')},get monthly(){return tr('rem.rep.monthly')},get yearly(){return tr('rem.rep.yearly')}};
const REM_LEAD=[0,10,60,1440,2880,10080].map(m=>({0:m,get 1(){return tr('lead.'+m)},length:2,[Symbol.iterator]:function*(){yield this[0];yield this[1];}}));
const REM_SOUNDS=[['default','Notification.Default'],['chime','Notification.Reminder'],['bell','Notification.IM'],['sms','Notification.SMS'],['mail','Notification.Mail'],['alarm','Notification.Looping.Alarm2'],['none','']].map(([k,w])=>({0:k,get 1(){return tr('sound.'+k)},2:w,length:3,[Symbol.iterator]:function*(){yield this[0];yield this[1];yield this[2];}}));
const stepRem=(d,rep,anchor)=>rep==='daily'?addDays(d,1):rep==='weekly'?addDays(d,7):rep==='biweekly'?addDays(d,14):rep==='monthly'?addMonths(d,1,anchor):rep==='yearly'?addMonths(d,12,anchor):null;
const remKind=r=>REM_KINDS[r.kind]||REM_KINDS.custom;
const fmtTime=x=>x?(FMT.time(x)||x):'';
const remAt=r=>{const [h,m]=(r.time||`${pad(S.settings.remindHour||9)}:00`).split(':').map(Number);const d=pd(r.next||r.date);d.setHours(h,m,0,0);return d;};
const remActive=()=>S.reminders.filter(r=>!r.done);
/* a reminder the scheduler can safely use; anything else is skipped (and logged once), never deleted */
const remOk=r=>!!r&&typeof r==='object'&&/^\d{4}-\d{2}-\d{2}$/.test(r.next||'');
const _badRem=new Set();
function badRem(r){const k=r&&r.id||'?';if(_badRem.has(k))return;_badRem.add(k);logErr('reminder skipped: invalid date',{id:k,title:r&&String(r.title||'').length});}

/* ---- sounds: small synthesized tones (no files) ---- */
let _ac=null;
function playSound(name){
  if(!name||name==='none')return;
  try{
    _ac=_ac||new (window.AudioContext||window.webkitAudioContext)();if(_ac.state==='suspended')_ac.resume();
    const t0=_ac.currentTime;
    const tone=(f,st,d,v=.18,type='sine')=>{const o=_ac.createOscillator(),g=_ac.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(0,t0+st);g.gain.linearRampToValueAtTime(v,t0+st+.015);g.gain.exponentialRampToValueAtTime(.0001,t0+st+d);o.connect(g).connect(_ac.destination);o.start(t0+st);o.stop(t0+st+d+.05);};
    const seq={default:[[784,0,.5],[1047,.12,.6]],chime:[[659,0,.5],[880,.14,.5],[1319,.28,.8]],bell:[[1175,0,1.2,.16],[1760,0,1,.07]],sms:[[880,0,.12],[1175,.13,.25]],mail:[[523,0,.25],[659,.18,.25],[784,.36,.5]],alarm:[[880,0,.18,.2,'square'],[880,.3,.18,.2,'square'],[880,.6,.18,.2,'square']],tick:[[1200,0,.06,.1]],done:[[880,0,.1,.12],[1319,.08,.22,.12]]}[name]||[];
    seq.forEach(([f,s,d,v,ty])=>tone(f,s,d,v,ty));
  }catch{}
}
const inQuiet=()=>{const s=S.settings;if(!s.quietOn)return false;const n=new Date(),m=n.getHours()*60+n.getMinutes(),f=s.quietFrom.split(':'),t=s.quietTo.split(':'),a=+f[0]*60+ +f[1],b=+t[0]*60+ +t[1];return a<=b?(m>=a&&m<b):(m>=a||m<b);};

/* ---- quick natural-language add:  "pay rent on the 1st at 9am monthly" ---- */
/* phrases in Spanish, Arabic, Chinese and Hindi are mapped onto the English forms the parser below reads */
const h24=(h,m,pm,am)=>{h=+h;m=+(m||0);if(pm&&h<12)h+=12;if(am&&h===12)h=0;return h<24?` at ${pad(h)}:${pad(m)} `:' ';};
const REM_SYN=[
 // times
 [/(上午|早上|凌晨|中午|下午|晚上)?\s*(\d{1,2})\s*[点點時时](?:\s*(\d{1,2})\s*分?|(半))?/g,(x,p,h,m,half)=>h24(h,half?30:m,/下午|晚上/.test(p||'')||(p==='中午'&&+h<6),false)],
 [/(सुबह|दोपहर|शाम|रात)?\s*(\d{1,2})(?::(\d{2}))?\s*बजे/g,(x,p,h,m)=>h24(h,m,/शाम|रात/.test(p||'')||(p==='दोपहर'&&+h<6),p==='सुबह')],
 [/a las (\d{1,2})(?::(\d{2}))?(?:\s*(?:de la|por la)\s*(mañana|tarde|noche))?/gi,(x,h,m,p)=>h24(h,m,/tarde|noche/i.test(p||''),false)],
 [/(?:الساعة\s*)?(\d{1,2})(?::(\d{2}))?\s*(صباحاً|صباحا|مساءً|مساء)/g,(x,h,m,p)=>h24(h,m,/مساء/.test(p),/صباح/.test(p))],
 [/الساعة\s*(\d{1,2})(?::(\d{2}))?/g,(x,h,m)=>h24(h,m,false,false)],
 // repeats
 [/每天|每日|हर दिन|रोज़?|रोजाना|cada día|todos los días|diario|diariamente|كل يوم|يومياً|يوميا/gi,' daily '],
 [/每两周|每隔一周|हर दो हफ्ते|cada dos semanas|quincenal|كل أسبوعين/gi,' biweekly '],
 [/每周|每星期|每个星期|हर हफ्ते|हर सप्ताह|cada semana|semanal(?:mente)?|كل أسبوع|أسبوعياً|أسبوعيا/gi,' weekly '],
 [/每个?月|हर महीने|cada mes|mensual(?:mente)?|كل شهر|شهرياً|شهريا/gi,' monthly '],
 [/每年|हर साल|cada año|anual(?:mente)?|كل سنة|كل عام|سنوياً|سنويا/gi,' yearly '],
 // relative days
 [/后天|परसों|pasado mañana|بعد غد/gi,' in 2 days '],
 [/(\d+)\s*天后|(\d+)\s*दिन (?:में|बाद)|en (\d+) días|بعد (\d+) (?:أيام|يوم)/gi,(x,a,b,c,d)=>` in ${a||b||c||d} days `],
 [/明天|कल|mañana|غداً|غدا|بكرة/gi,' tomorrow '],[/今天|आज|hoy|اليوم/gi,' today '],
 // day of month
 [/(\d{1,2})\s*[号號日]|(\d{1,2})\s*तारीख|el (?:día )?(\d{1,2})\b|يوم\s*(\d{1,2})/gi,(x,a,b,c,d)=>` the ${a||b||c||d}th `],
 // weekdays
 [/(?:周|星期|礼拜)([一二三四五六日天])/g,(x,d)=>' '+['sun','mon','tue','wed','thu','fri','sat'][' 一二三四五六'.indexOf(d)>0?' 一二三四五六'.indexOf(d):0]+' '],
 [/सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार/g,x=>' '+{सोमवार:'mon',मंगलवार:'tue',बुधवार:'wed',गुरुवार:'thu',शुक्रवार:'fri',शनिवार:'sat',रविवार:'sun'}[x]+' '],
 [/\b(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/gi,x=>' '+{lunes:'mon',martes:'tue','miércoles':'wed',miercoles:'wed',jueves:'thu',viernes:'fri','sábado':'sat',sabado:'sat',domingo:'sun'}[x.toLowerCase()]+' '],
 [/الاثنين|الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد/g,x=>' '+{'الاثنين':'mon','الإثنين':'mon','الثلاثاء':'tue','الأربعاء':'wed','الخميس':'thu','الجمعة':'fri','السبت':'sat','الأحد':'sun'}[x]+' '],
 // filler words
 [/提醒我|提醒|मुझे याद दिलाएं|याद दिलाना|याद दिलाओ|recuérdame|recordarme|ذكرني|ذكّرني/gi,' ']
];
const REM_KIND_WORDS={rent:/房租|租金|किराया|alquiler|إيجار|ايجار/,bill:/账单|缴费|付款|电费|水费|话费|बिल|भुगतान|factura|pagar|فاتورة|دفع|سداد/,appt:/医生|牙医|预约|会议|面试|डॉक्टर|अपॉइंटमेंट|मीटिंग|médico|dentista|cita|reunión|طبيب|موعد|اجتماع/,med:/药|维生素|दवा|विटामिन|medicina|pastilla|vitamina|دواء|فيتامين/,bday:/生日|जन्मदिन|cumpleaños|عيد ميلاد/,task:/预算|储蓄|转账|बजट|बचत|presupuesto|ahorrar|ميزانية|ادخار/};
function parseReminder(str){
  const raw=String(str||'');str=REM_SYN.reduce((t,[re,to])=>t.replace(re,to),raw);
  let s=' '+str.trim()+' ';if(!str.trim())return null;const r={kind:'custom',repeat:'none',date:today(),time:''};
  const rep=s.match(/\b(?:every\s+)?(daily|every day|weekly|every week|biweekly|every 2 weeks|monthly|every month|yearly|annually|every year)\b/i);
  if(rep){const k=rep[1].toLowerCase();r.repeat=/dai|day/.test(k)?'daily':/2|bi/.test(k)?'biweekly':/week/.test(k)?'weekly':/month/.test(k)?'monthly':'yearly';s=s.replace(rep[0],' ');}
  const tm=s.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)||s.match(/\bat\s+(\d{1,2}):(\d{2})\b/i);
  if(tm){let h=+tm[1];const mi=+(tm[2]||0),ap=(tm[3]||'').toLowerCase();if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;if(h<24){r.time=`${pad(h)}:${pad(mi)}`;s=s.replace(tm[0],' ');}}
  let dm;
  if(dm=s.match(/\b(\d{4}-\d{2}-\d{2})\b/)){r.date=dm[1];s=s.replace(dm[0],' ');}
  else if(/\btomorrow\b/i.test(s)){r.date=addDays(today(),1);s=s.replace(/\btomorrow\b/i,' ');}
  else if(/\btoday\b/i.test(s)){s=s.replace(/\btoday\b/i,' ');}
  else if(dm=s.match(/\bin\s+(\d+)\s*(day|week|month)s?\b/i)){const n=+dm[1];r.date=/day/i.test(dm[2])?addDays(today(),n):/week/i.test(dm[2])?addDays(today(),n*7):addMonths(today(),n);s=s.replace(dm[0],' ');}
  else if(dm=s.match(/\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i)){const day=Math.min(31,+dm[1]);let d=new Date();let c=new Date(d.getFullYear(),d.getMonth(),Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));if(ymd(c)<today())c=new Date(d.getFullYear(),d.getMonth()+1,Math.min(day,new Date(d.getFullYear(),d.getMonth()+2,0).getDate()));r.date=ymd(c);if(r.repeat==='none'&&/\bevery\b|\bmonthly\b/i.test(str))r.repeat='monthly';s=s.replace(dm[0],' ');}
  else if(dm=s.match(/\b(?:next\s+|on\s+)?(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i)){const idx=['sun','mon','tue','wed','thu','fri','sat'].indexOf(dm[1].toLowerCase());const fw=(idx-new Date().getDay()+7)%7||7;r.date=addDays(today(),fw);s=s.replace(dm[0],' ');}
  s=s.replace(/\b(remind me to|remind me|reminder|on|at|every)\b/ig,' ').replace(/\s+/g,' ').trim();
  r.title=s.replace(/^\w/,c=>c.toUpperCase())||tr('rem.default');
  const L=r.title.toLowerCase();
  r.kind=Object.keys(REM_KIND_WORDS).find(k=>REM_KIND_WORDS[k].test(raw))||(/rent|landlord/.test(L)?'rent':/pay|bill|invoice|electric|water|internet|phone|insurance|tax|card|loan/.test(L)?'bill':/doctor|dentist|appointment|meeting|call|interview|visit|clinic|haircut/.test(L)?'appt':/pill|medic|vitamin/.test(L)?'med':/birthday|bday|anniversary/.test(L)?'bday':/budget|review|save|transfer|invest|check/.test(L)?'task':'custom');
  return r;
}

/* ---- model helpers ---- */
function addReminder(o){
  const r={id:uid(),title:o.title,kind:o.kind||'custom',date:o.date,next:o.date,time:o.time||'',repeat:o.repeat||'none',lead:o.lead??S.settings.remLead??0,sound:o.sound||S.settings.remSound||'chime',notes:o.notes||'',amount:+o.amount||0,accountId:o.accountId||'',category:o.category||'',done:false,firedFor:'',snooze:0,anchor:pd(o.date).getDate()};
  S.reminders.push(r);return r;
}
function advanceReminder(r){ // finish the current occurrence
  if(r.repeat==='none'){r.done=true;r.doneAt=Date.now();return;}
  let n=stepRem(r.next,r.repeat,r.anchor),g=0;while(n<=today()&&g++<800&&r.repeat!=='daily')n=stepRem(n,r.repeat,r.anchor);
  if(r.repeat==='daily'&&n<=today())n=addDays(today(),r.time&&remAt({...r,next:today()})>new Date()?0:1);
  r.next=n;r.firedFor='';r.snooze=0;
}
function autoAdvance(){ // past occurrences of non-payment repeating reminders roll forward on their own
  let ch=false;
  for(const r of S.reminders){if(!remOk(r)){badRem(r);continue;}if(r.done||r.repeat==='none'||remKind(r).pay)continue;let g=0;while(g++<800&&diffDays(r.next,today())>=1){const n=stepRem(r.next,r.repeat,r.anchor);if(!n)break;r.next=n;r.firedFor='';ch=true;}}
  return ch;
}
function remGroups(){
  const t=today(),tm=addDays(t,1),wk=addDays(t,7),g={over:[],today:[],tomorrow:[],week:[],later:[],done:[]};
  for(const r of S.reminders){
    if(!remOk(r)){badRem(r);continue;}
    if(r.done){g.done.push(r);continue;}
    const d=r.next;
    (d<t?g.over:d===t?g.today:d===tm?g.tomorrow:d<=wk?g.week:g.later).push(r);
  }
  const bills=dueSoon(7).filter(x=>!x.overdue).map(x=>({auto:true,id:'b_'+x.b.id,billId:x.b.id,title:x.b.name,kind:'bill',next:x.d,time:'',amount:x.b.amount,repeat:x.b.freq,sound:'none'}));
  for(const b of bills)(b.next===t?g.today:b.next===tm?g.tomorrow:g.week).push(b);
  const key=r=>r.next+(r.time||'99:99');
  for(const k of ['over','today','tomorrow','week','later'])g[k].sort((a,b)=>key(a)<key(b)?-1:1);
  g.done.sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  return g;
}

/* ---- notifications ---- */
function fireReminder(r,silent){
  const k=remKind(r),when=r.time?`${relDate(r.next)} · ${fmtTime(r.time)}`:relDate(r.next);
  const hide=S.settings.privacy||$('#lock').classList.contains('on');
  const title=hide?tr('rem.hiddenT'):r.title,body=hide?tr('rem.hiddenD'):`${when}${r.amount?` · ${money(r.amount)}`:''}${r.notes?` · ${r.notes}`:''}`;
  const sound=silent||inQuiet()?'none':r.sound;
  const visible=document.hasFocus()&&!document.hidden;
  if(visible){playSound(sound==='none'?'':sound==='default'?'chime':sound);toast(`${r.title} · ${when}`,{action:tr('common.open'),fn:()=>{go('reminders');openRemAction(r);},ms:7000});}
  else if(hasNative)native.notify({title,body,sound:REM_SOUNDS.find(x=>x[0]===sound)?.[2]??'',silent:sound==='none',go:'reminders',id:r.id});
}
function tickReminders(){
  if(!S||!S.reminders)return;
  const now=Date.now();let ch=false;
  if(autoAdvance())ch=true;
  for(const r of S.reminders){
    try{ // one bad reminder must never stop the others
      if(!remOk(r)){badRem(r);continue;}
      if(r.done)continue;
      const at=remAt(r).getTime(),due=at-(r.lead||0)*60000,tag=r.next+' '+(r.time||'')+' '+(r.lead||0);
      if(r.snooze&&now>=r.snooze){r.snooze=0;fireReminder(r);ch=true;continue;}
      if(r.snooze)continue;
      if(r.firedFor!==tag&&now>=due){
        r.firedFor=tag;ch=true;
        if(now-at<36*3600e3)fireReminder(r);
      }
    }catch(e){logErr('reminder tick failed',e);}
  }
  if(ch){saveNow();if(cur==='reminders'||cur==='dashboard'||cur==='calendar')refresh();updateBadge();}
}
function snoozeReminder(r,mins){r.snooze=Date.now()+mins*60000;saveNow();toast(mins>=1440?tr('rem.snTomorrow'):mins>=60?tr('rem.snHours',{count:mins/60}):tr('rem.snMin',{n:String(mins)}));refresh();}
function completeReminder(r,quiet){
  if(r.auto){const b=S.bills.find(x=>x.id===r.billId);if(b){postBill(b,b.next);b.next=stepBill(b.next,b.freq,b.anchor);changed();toast(tr('bill.recorded',{name:b.name}));}return;}
  const k=remKind(r),pay=r.amount>0&&r.accountId&&acc(r.accountId);
  advanceReminder(r);playSound('done');changed();
  if(!quiet){
    if(pay)toast(tr('rem.done',{title:r.title}),{action:tr('rem.record',{amount:money(r.amount)}),fn:()=>{S.transactions.push({id:uid(),date:today(),type:'expense',amount:r.amount,merchant:r.title,category:r.category||S.categories.find(c=>c.type==='expense')?.id,accountId:r.accountId,note:''});changed();toast(tr('rem.recorded'));},ms:6000});
    else toast(tr('rem.done',{title:r.title}),{action:tr('common.undo'),fn:()=>{S.reminders.find(x=>x.id===r.id)&&Object.assign(r,{done:false});changed();},ms:4000});
  }
}
function openRemAction(r){
  if(!r)return;
  openSheet({title:r.title,ok:tr('rem.doneBtn'),cancel:tr('common.close'),body:`<div style="text-align:center;margin:-4px 0 14px"><div class="bigic">${gl(remKind(r).e,40)}</div><div class="muted">${dlong(r.next)}${r.time?' · '+fmtTime(r.time):''}${r.amount?' · '+money(r.amount):''}</div></div>
   <div class="sec-h" style="margin-top:0">${trh('rem.snooze')}</div><div class="chips" id="sn">${[[10,tr('rem.sn10')],[60,tr('rem.sn60')],[180,tr('rem.sn180')],[1440,tr('rem.snTom')]].map(([m,l])=>`<button class="cc" data-m="${m}">${esc(l)}</button>`).join('')}</div>`,
   mount(s){$$('[data-m]',s).forEach(b=>b.onclick=()=>{closeModal();snoozeReminder(r,+b.dataset.m);});},onOk(){closeModal();completeReminder(r);}});
}

/* ---- sheet: create / edit ---- */
function openReminder(r,preset){
  const edit=!!r;const v=r||{title:'',kind:'custom',date:today(),time:'',repeat:'none',lead:S.settings.remLead||0,sound:S.settings.remSound||'chime',notes:'',amount:'',accountId:S.accounts[0]?.id||'',category:'',...(preset||{})};
  let kind=v.kind;
  openSheet({title:tr(edit?'rem.edit':'rem.new'),ok:tr(edit?'common.save':'common.add'),
   body:`<div class="kindrow" id="kr">${Object.entries(REM_KINDS).map(([k,o])=>`<button class="kd ${k===kind?'on':''}" data-k="${k}" style="--c:${o.c}"><span>${gl(o.e,22)}</span><small>${esc(o.n)}</small></button>`).join('')}</div>
   <div class="fg"><div class="fr"><label>${trh('rem.title')}</label><input id="rt" value="${esc(v.title)}" placeholder="${trh('rem.titlePh')}"></div>
    <div class="fr"><label>${trh('common.date')}</label><input id="rd" type="date" value="${v.next||v.date}"></div>
    <div class="fr"><label>${trh('rem.time')}</label><input id="rtm" type="time" value="${v.time}"></div>
    <div class="fr"><label>${trh('tx.repeat')}</label><select id="rr">${Object.entries(REM_REPEAT).map(([k,l])=>opt(k,l,v.repeat===k)).join('')}</select></div></div>
   <div class="fg" id="payf" style="display:none"><div class="fr"><label>${trh('tx.amount')}</label><input id="ra" type="number" step="0.01" value="${v.amount||''}" placeholder="${trh('common.optional')}"></div>
    <div class="fr"><label>${trh('tx.payFrom')}</label><select id="rac">${S.accounts.map(a=>opt(a.id,a.name,a.id===v.accountId)).join('')}</select></div>
    <div class="fr"><label>${trh('tx.category')}</label><select id="rcat">${S.categories.filter(c=>c.type==='expense').map(c=>opt(c.id,c.name,c.id===v.category)).join('')}</select></div></div>
   <div class="fg"><div class="fr"><label>${trh('rem.alert')}</label><select id="rl">${REM_LEAD.map(([m,l])=>opt(m,l,(v.lead||0)===m)).join('')}</select></div>
    <div class="fr"><label>${trh('rem.sound')}</label><select id="rs">${REM_SOUNDS.map(([k,l])=>opt(k,l,v.sound===k)).join('')}</select><button class="btn sm" id="rsp" type="button" style="margin-inline-start:8px">${trh('rem.play')}</button></div></div>
   <div class="fg"><div class="fr"><label>${trh('rem.notes')}</label><input id="rn" value="${esc(v.notes||'')}" placeholder="${trh('common.optional')}"></div></div>
   ${edit?`<div class="fg" style="margin-top:16px"><div class="fr dest" id="del">${trh('rem.delete')}</div></div>`:''}`,
   mount(s){
    const sync=()=>{$('#payf',s).style.display=REM_KINDS[kind].pay?'':'none';$$('.kd',s).forEach(b=>b.classList.toggle('on',b.dataset.k===kind));};
    $('#kr',s).onclick=e=>{const b=e.target.closest('.kd');if(!b)return;kind=b.dataset.k;sync();if(!$('#rt',s).value){$('#rt',s).placeholder=REM_KINDS[kind].n+'…';}};
    $('#rsp',s).onclick=()=>{const k=$('#rs',s).value;playSound(k==='default'?'chime':k);};
    sync();
    if(edit)$('#del',s).onclick=()=>{closeModal();undoable(tr('rem.deleted'),()=>{S.reminders=S.reminders.filter(x=>x.id!==r.id);});};
   },
   onOk(s){
    const title=$('#rt',s).value.trim();if(!title){toast(tr('rem.err'));return;}
    const o={title,kind,date:$('#rd',s).value||today(),time:$('#rtm',s).value,repeat:$('#rr',s).value,lead:+$('#rl',s).value,sound:$('#rs',s).value,notes:$('#rn',s).value.trim(),amount:REM_KINDS[kind].pay?(parseFloat($('#ra',s).value)||0):0,accountId:$('#rac',s).value,category:$('#rcat',s).value};
    if(edit){Object.assign(r,o,{next:o.date,anchor:pd(o.date).getDate(),firedFor:'',snooze:0,done:false});}else addReminder(o);
    closeModal();changed();tickReminders();
   }});
}

/* ================= PAGE ================= */
let remFilter='all';
const remRow=r=>{
  const k=remKind(r),over=!r.auto&&!r.done&&r.next<today();
  const sub=[r.auto?tr('rem.recurringBill'):null,r.time?fmtTime(r.time):null,r.repeat&&r.repeat!=='none'&&!r.auto?REM_REPEAT[r.repeat]:null,r.amount?money(r.amount):null,r.snooze?tr('rem.snoozed'):null].filter(Boolean).join(' · ');
  return`<div class="li rem ${r.done?'is-done':''}" data-rid="${r.id}"><button class="chk ${r.done?'on':''}" data-rc="${r.id}" aria-label="${trh('bill.markDone')}"><i>${icon('check',13,3)}</i></button><div class="sq sm" style="--c-bg:${k.c}2e">${gl(k.e,16)}</div><div class="grow"><b>${esc(r.title)}</b><small class="${over?'bad':''}">${over?trh('rem.overdue')+' · ':''}${r.done?trh('rem.completed'):dshort(r.next)}${sub?' · '+esc(sub):''}</small></div>${r.auto?'':`<div class="rem-act"><button class="icon-btn" data-rs="${r.id}" title="${trh('rem.snooze')}" aria-label="${trh('rem.snooze')}">${icon('clock',17)}</button></div>`}</div>`;
};
PAGES.reminders={title:'Reminders',
 render(){
  const g=remGroups(),n={all:g.over.length+g.today.length+g.tomorrow.length+g.week.length+g.later.length,today:g.today.length,over:g.over.length,done:g.done.length};
  const tile=(k,label,ic,c,cnt)=>`<div class="rtile ${remFilter===k?'on':''}" data-rf="${k}" style="--c:${c}"><div class="rt-top"><span class="rt-ic">${icon(ic,18,2.3)}</span><b>${cnt}</b></div><small>${label}</small></div>`;
  const sec=(t,list,cls='')=>list.length?`<div class="sec-h ${cls}">${t}</div><div class="group">${list.map(remRow).join('')}</div>`:'';
  let body='';
  const T=k=>trh('rem.g.'+k);
  if(remFilter==='done')body=sec(T('done'),g.done.slice(0,40));
  else if(remFilter==='over')body=sec(T('over'),g.over,'bad');
  else if(remFilter==='today')body=sec(T('today'),g.today);
  else body=sec(T('over'),g.over,'bad')+sec(T('today'),g.today)+sec(T('tomorrow'),g.tomorrow)+sec(T('week'),g.week)+sec(T('later'),g.later);
  if(!body)body=`<div class="group">${emptyBox('🔔',trh(remFilter==='done'?'rem.noneDone':'rem.caughtUp'),`<div>${trh('rem.emptyD')}</div>`,btn('plus',trh('rem.newBtn'),'data-act="addrem"','pri'))}</div>`;
  return`<div class="page wrap" style="max-width:900px">${lt(trh('nav.reminders'),trh('rem.sub'),btn('plus',trh('shell.new'),'data-act="addrem"','pri'))}
  <div class="rtiles">${tile('today',trh('rem.g.today'),'calendar','#0A84FF',n.today)}${tile('all',trh('rem.t.all'),'list','#FF9F0A',n.all)}${tile('over',trh('rem.g.over'),'bell','#FF453A',n.over)}${tile('done',trh('rem.t.done'),'check','#8E8E93',n.done)}</div>
  <div class="remq glass"><span>${icon('sparkles',18,2.2)}</span><input id="rq" placeholder="${trh('rem.quickPh')}" autocomplete="off"><button class="btn sm pri" id="rqa">${trh('common.add')}</button></div>
  <div class="chips" style="margin:10px 4px 2px">${[[tr('demo.r.rent'),'rent'],[tr('rem.k.bill'),'bill'],[tr('rem.k.appt'),'appt'],[tr('rem.k.med'),'med'],[tr('rem.k.bday'),'bday']].map(([l,k])=>`<button class="cc" data-tpl="${k}">${REM_KINDS[k].e} ${esc(l)}</button>`).join('')}</div>
  ${body}</div>`;
 },
 after(v){
  $$('[data-rf]',v).forEach(t=>t.onclick=()=>{remFilter=t.dataset.rf;refresh();});
  $$('[data-rc]',v).forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.rc;const r=S.reminders.find(x=>x.id===id)||remGroups().today.concat(remGroups().tomorrow,remGroups().week).find(x=>x.id===id);if(!r)return;
    if(r.done){r.done=false;changed();return;}
    b.classList.add('on');setTimeout(()=>completeReminder(r),260);});
  $$('[data-rs]',v).forEach(b=>b.onclick=e=>{e.stopPropagation();openRemAction(S.reminders.find(x=>x.id===b.dataset.rs));});
  $$('[data-rid]',v).forEach(row=>row.onclick=()=>{const id=row.dataset.rid;const r=S.reminders.find(x=>x.id===id);if(r)openReminder(r);else if(id.startsWith('b_'))openBill(S.bills.find(b=>'b_'+b.id===id));});
  $$('[data-tpl]',v).forEach(b=>b.onclick=()=>openReminder(null,{kind:b.dataset.tpl,title:b.dataset.tpl==='rent'?tr('demo.r.rent'):b.dataset.tpl==='bill'?tr('rem.tpl.bill'):b.dataset.tpl==='med'?tr('rem.tpl.med'):b.dataset.tpl==='bday'?tr('rem.tpl.bday'):'',repeat:b.dataset.tpl==='rent'?'monthly':'none'}));
  const add=()=>{const o=parseReminder($('#rq',v).value);if(!o)return;const r=addReminder(o);$('#rq',v).value='';playSound('done');changed();toast(tr('rem.set',{title:r.title,when:relDate(r.next)+(r.time?' '+fmtTime(r.time):'')}),{action:tr('common.edit'),fn:()=>openReminder(r)});};
  $('#rqa',v).onclick=add;$('#rq',v).onkeydown=e=>{if(e.key==='Enter')add();};
 }};
DW.reminders=()=>{const g=remGroups(),list=[...g.over,...g.today,...g.tomorrow,...g.week].slice(0,5);
  return`<div class="card glass">${ch('bell','var(--red)',trh('nav.reminders'),more('reminders',trh('common.open')))}${list.length?`<div class="list-tight">${list.map(remRow).join('')}</div>`:emptyBox('🔔',trh('rem.noneUp'),`<div>${trh('rem.noneUpD')}</div>`,`<button class="btn pri sm" data-act="addrem">${trh('rem.newBtn')}</button>`)}</div>`;};
