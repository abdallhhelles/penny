'use strict';
/* =========================================================================
   Import wizard — CSV / TSV / OFX / QFX.  Parsing lives in importers.js (pure, tested); this file only
   draws the sheet and writes the result. Nothing leaves the PC. A safety backup is taken first and the
   whole import is one Undo.
   ========================================================================= */
async function importCSV(){
  const text=await pickFile([{name:tr('iw.fileType'),extensions:['csv','tsv','txt','ofx','qfx']}],'.csv,.tsv,.txt,.ofx,.qfx');
  if(!text)return;
  const ofx=Importers.parseOFX(text);
  let rows=null;
  if(!ofx){rows=Importers.parseDelimited(text).rows;}
  if(ofx?!ofx.rows.length:rows.length<2){toast(tr('import.empty'));return;}
  const ncols=ofx?0:Math.max(...rows.slice(0,50).map(r=>r.length));
  const hasHead0=ofx?false:Importers.looksLikeHeader(rows[0]);
  const guess=ofx?{}:Importers.guessColumns(rows[0]);
  const colName=i=>ofx?'':(hasHead0&&rows[0][i]?String(rows[0][i]).trim():'')||tr('iw.col',{n:i+1});
  const colOpts=(sel)=>`<option value="">${esc(tr('iw.none'))}</option>`+Array.from({length:ncols},(_,i)=>opt(String(i),colName(i),sel===i)).join('');
  const field=(id,label,sel)=>`<div class="fr"><label for="${id}">${esc(label)}</label><select id="${id}">${colOpts(sel)}</select></div>`;
  const accOf=id=>S.accounts.find(a=>a.id===id);
  openSheet({title:ofx?tr('iw.titleOfx'):tr('import.title'),ok:tr('import.btn'),
   body:`<p class="muted" style="text-align:center;margin-bottom:14px">${ofx?trh('iw.ofxFound',{count:ofx.rows.length,acct:esc(ofx.acctId||'—'),cur:esc(ofx.currency||'—')}):trh('import.rows',{count:rows.length-(hasHead0?1:0)})}</p>
   <div class="fg"><div class="fr"><label for="a">${trh('import.account')}</label><select id="a">${accOpts()}</select></div></div>
   ${ofx?'':`<div class="fg">
     <label class="iwchk"><input type="checkbox" id="hdr" ${hasHead0?'checked':''}> ${trh('iw.hasHeader')}</label>
     ${field('m_date',tr('iw.col.date'),guess.date)}${field('m_desc',tr('iw.col.desc'),guess.desc)}
     ${field('m_amount',tr('iw.col.amount'),guess.amount)}${field('m_debit',tr('iw.col.debit'),guess.debit)}${field('m_credit',tr('iw.col.credit'),guess.credit)}
     ${field('m_cat',tr('iw.col.category'),guess.category)}${field('m_type',tr('iw.col.type'),guess.type)}
   </div>
   <div class="fg"><div class="fr"><label for="dord">${trh('import.dateFormat')}</label><select id="dord"></select></div></div>
   <div class="muted sm" id="dnote" style="padding:2px 6px 8px"></div>
   <div class="fg"><label class="iwchk"><input type="checkbox" id="inv"> ${trh('iw.invert')}</label></div><div class="muted sm" id="snote" style="padding:2px 6px 8px"></div>`}
   <div class="fg"><label class="iwchk"><input type="checkbox" id="skipdup" checked> ${trh('iw.skipDup')}</label><label class="iwchk"><input type="checkbox" id="fut"> ${trh('iw.future')}</label></div>
   <div class="group" id="iws" style="padding:10px 14px;font-size:14px" aria-live="polite"></div>
   <div class="group" id="iwp" style="padding:6px 14px;font-size:14px"></div>
   <details id="iwk" style="margin:8px 6px"><summary class="muted sm">${trh('iw.skippedTitle')}</summary><div id="iwkl" class="muted sm" style="padding:6px 0"></div></details>`,
   mount(s){
     const g=id=>$('#'+id,s),cv=id=>{const x=g(id);return !x||x.value===''?null:+x.value;};
     let dateInit=false;
     const compute=()=>{
       const aid=g('a').value,acc=accOf(aid);
       let res,order='ymd';
       if(ofx)res=Importers.ofxToItems(ofx);
       else{
         const skipHeader=g('hdr').checked;
         const map={date:cv('m_date'),desc:cv('m_desc'),amount:cv('m_amount'),debit:cv('m_debit'),credit:cv('m_credit'),category:cv('m_cat'),type:cv('m_type')};
         const body=rows.slice(skipHeader?1:0);
         const det=Importers.csvDateOrder(body,map.date==null?0:map.date,formatLocaleBase());
         if(!dateInit){g('dord').innerHTML=opt('mdy',tr('import.order.mdy'),det.order==='mdy')+opt('dmy',tr('import.order.dmy'),det.order==='dmy');dateInit=true;g('dnote').textContent=tr('import.detected.'+det.kind);}
         order=g('dord').value;
         const amts=map.amount==null?[]:body.map(r=>Importers.parseAmount(r[map.amount])).filter(x=>!isNaN(x));
         const hint=Importers.signHint(amts);
         g('snote').textContent=hint==='allPositive'?tr('iw.allPositive'):hint==='allNegative'?tr('iw.allNegative'):'';
         if(map.date==null||(map.amount==null&&map.debit==null))return{res:{items:[],skipped:[]},items:[],dups:0,fut:0,aid,err:true};
         res=Importers.rowsToItems(rows,map,{order,invert:g('inv').checked,skipHeader});
       }
       let dups=0,fut=0;const keep=[];
       for(const it of res.items){
         it.accountId=aid;
         if(g('skipdup').checked&&Finance.findDuplicates(it,S.transactions).length){dups++;continue;}
         if(!g('fut').checked&&Finance.isFuture(it.date,today())){fut++;continue;}
         keep.push(it);
       }
       return{res,items:keep,dups,fut,aid,acc,order};
     };
     const draw=()=>{
       const c=compute();
       if(c.err){g('iws').textContent=tr('iw.needMap');g('iwp').innerHTML='';g('iwk').style.display='none';return;}
       const cur=c.acc?accCur(c.acc):baseCur();
       const warn=ofx&&ofx.currency&&ofx.currency!==cur?`<div style="color:var(--warn,#c80);padding-top:6px">${trh('iw.curMismatch',{file:esc(ofx.currency),acc:esc(cur)})}</div>`:'';
       g('iws').innerHTML=`<b>${trh('iw.ready',{count:c.items.length})}</b><div class="muted sm">${trh('iw.sumLine',{dups:c.dups,fut:c.fut,bad:c.res.skipped.length})}</div>${warn}`;
       g('iwp').innerHTML=c.items.slice(0,5).map(x=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0"><span class="muted" dir="ltr">${esc(dlong(x.date))}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.merchant||'—')}</span><b dir="ltr">${x.type==='expense'?'−':'+'}${esc(moneyIn(x.amount,cur))}</b></div>`).join('')||`<div class="muted" style="padding:8px 0">${trh('iw.nothing')}</div>`;
       g('iwk').style.display=c.res.skipped.length?'':'none';
       g('iwkl').innerHTML=c.res.skipped.slice(0,25).map(k=>`<div>${trh('iw.skipLine',{line:k.line,reason:tr('iw.reason.'+k.reason)})}${k.raw!=null&&k.raw!==''?` — <span dir="ltr">${esc(String(k.raw).slice(0,40))}</span>`:''}</div>`).join('')+(c.res.skipped.length>25?`<div>${trh('iw.more',{count:c.res.skipped.length-25})}</div>`:'');
     };
     s.addEventListener('change',draw);
     const syncInv=()=>{if(!ofx){const a=accOf(g('a').value);g('inv').checked=false;draw();const hint=g('snote').textContent;if(a&&a.type==='credit'&&hint===tr('iw.allPositive')){g('inv').checked=true;draw();}}};
     g('a').addEventListener('change',syncInv);syncInv();draw();s._compute=compute;
   },
   async onOk(s){
     const c=s._compute();if(c.err||!c.items.length){toast(tr('iw.nothing'));return;}
     const aid=c.aid,ctx=suggestCtx(),added=[];
     for(const it of c.items){
       const type=it.type,want=type==='income'?'income':'expense';
       const cat=it.categoryName?catByName(it.categoryName):null;
       const sug=RulesEngine.suggest(ctx,{merchant:it.merchant,type,amount:it.amount,accountId:aid});
       const cid=sug.source==='rule'?sug.id:(cat&&cat.type===want?cat.id:(sug.id||S.categories.find(x=>x.type===want&&/other/i.test(x.name))?.id||S.categories.find(x=>x.type===want).id));
       const tx={id:uid(),date:it.date,amount:it.amount,type,accountId:aid,category:cid,merchant:sug.merchant!==undefined?sug.merchant:it.merchant,note:it.note||tr('iw.imported')};
       if(it.fitid)tx.fitid=it.fitid;
       added.push(tx);
     }
     closeModal();
     if(hasNative){const sr=await native.snapshot('before-change');if(sr&&sr.ok===false&&sr.error!=='no-data'){toast(tr('tf.noBackup'),{ms:6000});return;}}
     undoable(tr('import.done',{count:added.length})+(c.dups?tr('import.dups',{count:c.dups}):'')+(c.fut?tr('iw.futSkipped',{count:c.fut}):'')+(c.res.skipped.length?tr('import.bad',{count:c.res.skipped.length}):''),()=>{S.transactions.push(...added);});
   }});
}
