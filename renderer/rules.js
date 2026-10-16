'use strict';
/* =========================================================================
   Rules & automation UI (Settings → Categories → Rules). The decision logic lives in rules-engine.js.
   - rules are stored in S.rules (saved, exported and backed up with everything else)
   - Clean-up: payees stuck in "Other", grouped, one tap to file them and remember the choice as a rule
   - Apply: run your rules over existing transactions (preview first, backup first, undo after)
   ========================================================================= */
const RE=RulesEngine;
const RULE_OPS=['contains','equals','starts'];
const catById=id=>S.categories.find(c=>c.id===id);
const fbIds=()=>new Set(S.categories.filter(RE.isFallbackCat).map(c=>c.id));
const catLabel=c=>c?c.name:'—';
const catOptionsFor=(type,sel,withNone)=>(withNone?opt('',tr('rules.keep'),!sel):'')+S.categories.filter(c=>type==='any'||c.type===(type==='income'?'income':'expense')).map(c=>opt(c.id,catLabel(c),c.id===sel)).join('');
function learnCtx(){return {rules:S.rules,categories:S.categories,learnIndex:RE.buildLearn(S.transactions,id=>RE.isFallbackCat(catById(id)))};}

function sanitizeRules(list){
  const num=v=>(v===''||v==null||!Number.isFinite(+v))?'':+v;
  return (Array.isArray(list)?list:[]).filter(r=>r&&typeof r==='object'&&!Array.isArray(r)&&typeof r.id==='string').map(r=>({
    id:r.id,on:r.on!==false,op:RULE_OPS.includes(r.op)?r.op:'contains',text:String(r.text||'').slice(0,120),min:num(r.min),max:num(r.max),
    type:['any','expense','income'].includes(r.type)?r.type:'any',accountId:typeof r.accountId==='string'?r.accountId:'',
    category:typeof r.category==='string'?r.category:'',rename:String(r.rename||'').slice(0,80)}));
}
function ruleConditions(r){
  const p=[];
  if(r.text)p.push(tr('rules.cond.'+r.op,{text:r.text}));
  const lo=r.min!==''&&r.min!=null,hi=r.max!==''&&r.max!=null;
  if(lo&&hi)p.push(tr('rules.cond.between',{min:money(r.min),max:money(r.max)}));else if(lo)p.push(tr('rules.cond.min',{amount:money(r.min)}));else if(hi)p.push(tr('rules.cond.max',{amount:money(r.max)}));
  if(r.type&&r.type!=='any')p.push(tr('rules.cond.type.'+r.type));
  if(r.accountId){const a=acc(r.accountId);p.push(tr('rules.cond.account',{account:a?a.name:'?'}));}
  return p.join(' · ')||'—';
}
function ruleAction(r){
  const p=[];const c=catById(r.category);
  if(c)p.push('→ '+catLabel(c));
  if(r.rename)p.push(tr('rules.act.rename',{name:r.rename}));
  return p.join(' · ')||'—';
}
/* ---- Settings block ---- */
function rulesSettingsHtml(){
  const H=trh,n=S.rules.length,fb=fbIds();
  const unc=RE.groupUncategorized(S.transactions,S.categories,learnCtx()).length;
  const sh=RE.shadowed(S.rules);
  const rows=S.rules.map((r,i)=>`<div class="setrow plain rulerow" data-rl-row="${esc(r.id)}"><div class="grow"><b dir="auto">${esc(ruleConditions(r))}</b><small dir="auto">${esc(ruleAction(r))}</small>${sh[r.id]?`<small class="rulewarn" data-rl-shadow="${esc(r.id)}" dir="auto">⚠ ${esc(tr('rules.shadowed',{rule:ruleConditions(S.rules.find(x=>x.id===sh[r.id])||{})}))}</small>`:''}</div><button class="btn sm" data-rl-edit="${esc(r.id)}">${H('rules.edit')}</button><label class="switch"><input type="checkbox" data-rl-on="${esc(r.id)}" ${r.on?'checked':''} aria-label="${H('rules.enabled')}"><i></i></label></div>`).join('');
  return `<div class="group" id="rulesgroup">${rows||`<div class="setrow plain"><div class="grow"><small>${H('rules.none')}</small></div></div>`}
   ${srow('plus','var(--blue)',H('rules.new'),H('rules.newD'),`<button class="btn sm pri" id="rl_new">${H('rules.newBtn')}</button>`)}
   ${srow('sparkles','var(--orange)',H('rules.cleanup'),H(unc?'rules.cleanupD':'rules.cleanupNone',{count:unc}),`<button class="btn sm" id="rl_clean" ${unc?'':'disabled'}>${H('rules.review')}</button>`)}
   ${srow('bolt','var(--purple)',H('rules.suggest'),H('rules.suggestD'),`<button class="btn sm" id="rl_suggest">${H('rules.find')}</button>`)}
   ${srow('repeat','var(--green)',H('rules.applyAll'),H('rules.applyAllD'),`<button class="btn sm" id="rl_apply" ${n?'':'disabled'}>${H('rules.preview')}</button>`)}
  </div>`;
}
function bindRulesUI(v){
  const on=(id,fn)=>{const e=$(id,v);if(e)e.onclick=fn;};
  on('#rl_new',()=>openRule());on('#rl_clean',openCleanup);on('#rl_suggest',openSuggestRules);on('#rl_apply',()=>openApplyRules());
  $$('[data-rl-edit]',v).forEach(b=>b.onclick=()=>openRule(S.rules.find(r=>r.id===b.dataset.rlEdit)));
  $$('[data-rl-on]',v).forEach(c=>c.onchange=()=>{const r=S.rules.find(r=>r.id===c.dataset.rlOn);if(r){r.on=c.checked;save();}});
}
/* ---- create / edit ---- */
function openRule(rule,seed){
  const edit=!!rule;const r=rule||{id:uid(),on:true,op:'contains',text:'',min:'',max:'',type:'any',accountId:'',category:'',rename:'',...(seed||{})};
  openSheet({title:tr(edit?'rules.editTitle':'rules.newTitle'),ok:tr(edit?'common.save':'common.add'),
   body:`<p class="muted sm" style="padding:0 4px 10px">${trh('rules.help')}</p>
   <div class="sg-t">${trh('rules.when')}</div>
   <div class="fg"><div class="fr"><label>${trh('rules.payee')}</label><div style="display:flex;gap:8px"><select id="ro" style="max-width:150px">${RULE_OPS.map(k=>opt(k,tr('rules.op.'+k),r.op===k)).join('')}</select><input id="rt" type="text" value="${esc(r.text)}" placeholder="${trh('tx.payeeExample')}" dir="auto"></div></div></div>
   <div class="fg"><div class="fr"><label>${trh('tf.min')}</label><input id="rmin" type="number" inputmode="decimal" min="0" step="any" value="${esc(r.min)}"></div><div class="fr"><label>${trh('tf.max')}</label><input id="rmax" type="number" inputmode="decimal" min="0" step="any" value="${esc(r.max)}"></div></div>
   <div class="fg"><div class="fr"><label>${trh('rules.appliesTo')}</label><select id="rty">${['any','expense','income'].map(k=>opt(k,tr('rules.type.'+k),r.type===k)).join('')}</select></div>
    <div class="fr"><label>${trh('tx.account')}</label><select id="rac">${opt('',tr('tf.allAccounts'),!r.accountId)}${accOpts(r.accountId)}</select></div></div>
   <div class="sg-t">${trh('rules.then')}</div>
   <div class="fg"><div class="fr"><label>${trh('tx.category')}</label><select id="rcat">${catOptionsFor(r.type,r.category,true)}</select></div>
    <div class="fr"><label>${trh('rules.rename')}</label><input id="rrn" type="text" value="${esc(r.rename)}" placeholder="${trh('rules.renamePh')}" dir="auto"></div></div>
   ${edit?`<div class="fg"><div class="fr dest" id="rdel">${trh('rules.delete')}</div></div><div class="fg"><div class="fr" style="display:flex;gap:8px"><button class="btn sm" id="rup">${trh('set.moveUp')}</button><button class="btn sm" id="rdn">${trh('set.moveDown')}</button></div></div>`:''}`,
   mount(s){
     const syncCats=()=>{const keep=$('#rcat',s).value;$('#rcat',s).innerHTML=catOptionsFor($('#rty',s).value,keep,true);};
     $('#rty',s).onchange=syncCats;
     if(edit){
       $('#rdel',s).onclick=()=>{closeModal();undoable(tr('rules.deleted'),()=>{S.rules=S.rules.filter(x=>x.id!==r.id);});};
       const mv=d=>()=>{const i=S.rules.findIndex(x=>x.id===r.id),j=i+d;if(j<0||j>=S.rules.length)return;[S.rules[i],S.rules[j]]=[S.rules[j],S.rules[i]];closeModal();changed();};
       $('#rup',s).onclick=mv(-1);$('#rdn',s).onclick=mv(1);
     }
   },
   onOk(s){
     const n={id:r.id,on:r.on!==false,op:$('#ro',s).value,text:$('#rt',s).value.trim(),min:$('#rmin',s).value,max:$('#rmax',s).value,type:$('#rty',s).value,accountId:$('#rac',s).value,category:$('#rcat',s).value,rename:$('#rrn',s).value.trim()};
     const clean=sanitizeRules([n])[0];
     if(!clean.text&&clean.min===''&&clean.max===''){toast(tr('rules.err.cond'));return;}
     if(!clean.category&&!clean.rename){toast(tr('rules.err.action'));return;}
     if(clean.min!==''&&clean.max!==''&&clean.min>clean.max){toast(tr('rules.err.range'));return;}
     closeModal();
     if(edit)S.rules=S.rules.map(x=>x.id===clean.id?clean:x);else S.rules.push(clean);
     changed();
     const cnt=planApply([clean],true).length;
     toast(tr('rules.saved'),cnt?{action:tr('rules.applyNow',{count:cnt}),fn:()=>openApplyRules([clean]),ms:7000}:{});
   }});
}
/* ---- apply rules to what is already there ---- */
function planApply(rules,onlyFallback){
  const fb=fbIds(),out=[];
  for(const x of S.transactions){
    if(x.type==='transfer')continue;
    const a=RE.apply(rules,S.categories,x);
    const catChange=a.category&&a.category!==x.category&&(!onlyFallback||!x.category||fb.has(x.category)||!catById(x.category));
    const renChange=a.merchant!==undefined&&a.merchant!==(x.merchant||'');
    if(catChange||renChange)out.push({id:x.id,cat:catChange?a.category:null,merchant:renChange?a.merchant:undefined,from:x});
  }
  return out;
}
function openApplyRules(rules){
  rules=rules||S.rules.filter(r=>r.on);
  const draw=s=>{
    const only=$('#raf',s).checked,plan=planApply(rules,only);
    $('#rap',s).innerHTML=plan.length?`<div class="muted sm" style="padding:2px 6px 8px">${trh('rules.willChange',{count:plan.length})}</div><div class="group" style="padding:4px 14px;font-size:14px">${plan.slice(0,6).map(p=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0"><span dir="auto">${esc(p.merchant!==undefined?p.merchant:p.from.merchant||'')}</span><b>${p.cat?esc(catLabel(catById(p.cat))):esc(catLabel(catById(p.from.category)))}</b></div>`).join('')}${plan.length>6?`<div class="muted sm" style="padding:6px 0">${trh('rules.andMore',{count:plan.length-6})}</div>`:''}</div>`:`<div class="muted" style="padding:12px 6px">${trh('rules.nothing')}</div>`;
    s._plan=plan;
  };
  openSheet({title:tr('rules.applyTitle'),ok:tr('rules.applyBtn'),
   body:`<label class="setrow plain" style="padding:8px 4px;gap:12px"><div class="grow"><b>${trh('rules.onlyOther')}</b><small>${trh('rules.onlyOtherD')}</small></div>${toggle('raf',true)}</label><div id="rap"></div>`,
   mount(s){$('#raf',s).onchange=()=>draw(s);draw(s);},
   async onOk(s){
     const plan=s._plan||[];if(!plan.length){closeModal();return;}
     closeModal();if(!await bulkSafe())return;
     undoable(tr('rules.applied',{count:plan.length}),()=>{const m=new Map(S.transactions.map(x=>[x.id,x]));for(const p of plan){const x=m.get(p.id);if(!x)continue;if(p.cat)x.category=p.cat;if(p.merchant!==undefined)x.merchant=p.merchant;}});
   }});
}
/* ---- clean-up: payees stuck in "Other" ---- */
function openCleanup(){
  const groups=RE.groupUncategorized(S.transactions,S.categories,learnCtx()).slice(0,40);
  if(!groups.length){toast(tr('rules.cleanupNone',{count:0}));return;}
  openSheet({title:tr('rules.cleanup'),ok:tr('rules.cleanupApply'),
   body:`<p class="muted sm" style="padding:0 4px 10px">${trh('rules.cleanupHelp')}</p><div id="cl">${groups.map((g,i)=>`<div class="setrow plain clrow" data-i="${i}" style="flex-wrap:wrap"><div class="grow"><b dir="auto">${esc(g.label)}</b><small>${trh('rules.cleanupCount',{count:g.count,total:money(g.total)})}${g.source?' · '+trh('rules.src.'+g.source):''}</small></div>
      <select data-cs style="max-width:210px">${catOptionsFor(g.type,g.suggest,true)}</select><label class="muted sm" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-rm checked>${trh('rules.remember')}</label></div>`).join('')}</div>`,
   async onOk(s){
     const picks=$$('.clrow',s).map(r=>({g:groups[+r.dataset.i],cat:$('[data-cs]',r).value,remember:$('[data-rm]',r).checked})).filter(p=>p.cat);
     if(!picks.length){closeModal();return;}
     closeModal();if(!await bulkSafe())return;
     const byId=new Map(S.transactions.map(x=>[x.id,x]));
     const total=picks.reduce((n,p)=>n+p.g.ids.filter(id=>byId.get(id)&&byId.get(id).category!==p.cat).length,0);
     const newRules=picks.filter(p=>p.remember&&!S.rules.some(r=>r.op==='contains'&&RE.fold(r.text)===RE.fold(p.g.label)&&r.category===p.cat));
     undoable(tr('rules.cleanupDone',{count:total})+(newRules.length?' · '+tr('rules.rulesAdded',{count:newRules.length}):''),()=>{
       for(const p of picks){for(const id of p.g.ids){const x=byId.get(id);if(x)x.category=p.cat;}}
       for(const p of newRules)S.rules.push({id:uid(),on:true,op:'contains',text:p.g.label,min:'',max:'',type:p.g.type==='income'?'income':'expense',accountId:'',category:p.cat,rename:''});
     });
   }});
}
/* ---- suggest rules from history ---- */
function openSuggestRules(){
  const list=RE.proposeRules(S.transactions,S.categories,S.rules).slice(0,40);
  if(!list.length){toast(tr('rules.suggestNone'));return;}
  openSheet({title:tr('rules.suggest'),ok:tr('rules.suggestApply'),
   body:`<p class="muted sm" style="padding:0 4px 10px">${trh('rules.suggestHelp')}</p>${list.map((p,i)=>`<label class="setrow plain" style="gap:12px"><input type="checkbox" data-sp="${i}" checked><div class="grow"><b dir="auto">${esc(p.text)}</b><small>${trh('rules.suggestRow',{count:p.count,category:catLabel(catById(p.category))})}</small></div></label>`).join('')}`,
   onOk(s){
     const chosen=$$('[data-sp]',s).filter(c=>c.checked).map(c=>list[+c.dataset.sp]);if(!chosen.length){closeModal();return;}
     closeModal();
     undoable(tr('rules.rulesAdded',{count:chosen.length}),()=>{for(const p of chosen)S.rules.push({id:uid(),on:true,op:'contains',text:p.text,min:'',max:'',type:p.type==='income'?'income':'expense',accountId:'',category:p.category,rename:''});});
   }});
}
/* offer to remember a manual re-categorisation as a rule */
function offerRule(merchant,categoryId,type){
  if(!merchant||!categoryId)return null;
  const probe={merchant,type,amount:0};
  if(RE.apply(S.rules,S.categories,probe).category===categoryId)return null;
  return {action:tr('rules.make'),fn:()=>openRule(null,{text:merchant,category:categoryId,type:type==='income'?'income':'expense'}),ms:7000};
}
