'use strict';
/* =========================================================================
   Language runtime (renderer). Depends on i18n.js (t / th / I18N) and fmt.js (Fmt).

   - initI18n():        at boot, before anything renders: pick the language, load message files
   - setAppLanguage():  user changes language: persist, load, set <html lang dir>, rebuild the shell and current page
   - formatLocaleBase(): which regional locale drives number/date formats ('auto' follows the language)
   Persistence: the preference lives in the main process (system.json -> `lang`), NOT in the financial data file,
   so it is available before the data loads (error screens, first run) and is never touched by import/export/restore.
   ========================================================================= */
let LANGS=[];
const LANG_KEY='penny-lang';

async function loadLangList(){
  if(hasNative&&native.i18nList){try{const l=await native.i18nList();if(Array.isArray(l)&&l.length)return l;}catch(e){logErr('language list failed',e);}}
  return [{code:'en',name:'English',nativeName:'English',dir:'ltr',region:'en-US'}];
}
async function loadLangBundle(code){
  try{
    const txt=hasNative&&native.i18nGet?await native.i18nGet(code):await (await fetch('locales/'+code+'.json')).text();
    if(!txt)return false;
    return I18N.register(code,JSON.parse(txt));
  }catch(e){logErr('language file failed: '+code,e);return false;}
}
const readLangPref=()=>{
  if(hasNative)return SYS.lang||'auto';
  try{return localStorage.getItem(LANG_KEY)||'auto';}catch{return 'auto';}
};
async function selectLanguage(pref){
  const code=I18N.resolve(pref,(typeof SYS!=='undefined'&&SYS.systemLocale)||navigator.language,LANGS.map(l=>l.code));
  I18N.setLanguage(code);
  for(const c of I18N.chain.reverse()){if(!I18N.has(c)&&LANGS.some(l=>I18N.canon(l.code)===c))await loadLangBundle(c);}
  return code;
}
/* regional locale for numbers/dates: the stored setting, or (when 'auto') the language's own region */
function formatLocaleBase(){
  const l=(typeof S!=='undefined'&&S&&S.settings&&S.settings.locale)||'auto';
  return l==='auto'?(I18N.meta(I18N.lang).region||I18N.lang):l;
}
const formatDigits=()=>((typeof S!=='undefined'&&S&&S.settings&&S.settings.digits)||'latn');
function applyLanguageEnv(){
  const r=document.documentElement;
  r.lang=I18N.lang;r.dir=I18N.dir();
  I18N.setNumberLocale(Fmt.tag(formatLocaleBase(),{digits:formatDigits()}));
}
async function initI18n(){
  I18N.setMissingHandler(key=>{logErr('i18n: missing key '+key);}); // only fires when the key is missing even in English
  LANGS=await loadLangList();
  await loadLangBundle('en');
  await selectLanguage(readLangPref());
  applyLanguageEnv();
}
/* pref: 'auto' or a language code. Returns the language actually used. */
async function setAppLanguage(pref,{reopen=false}={}){
  if(hasNative&&native.sysSet){try{const r=await native.sysSet({lang:pref});SYS.lang=r&&r.lang?r.lang:pref;}catch(e){logErr('could not save language',e);SYS.lang=pref;}}
  else{try{localStorage.setItem(LANG_KEY,pref);}catch{}}
  const code=await selectLanguage(pref);
  applyLanguageEnv();
  if(typeof S!=='undefined'&&S){
    setupFmt();
    if($('#side')&&$('#side').children.length){closeCmd();buildShell();applySettings();go(cur);}
  }
  if(reopen){closeModal();onboarding();}
  return code;
}
function langOptions(pref){
  const autoName=(()=>{try{const c=I18N.resolve('auto',(typeof SYS!=='undefined'&&SYS.systemLocale)||navigator.language,LANGS.map(l=>l.code));const x=LANGS.find(l=>I18N.canon(l.code)===c);return x?x.nativeName:'';}catch{return '';}})();
  return opt('auto',tr('lang.auto',{language:autoName}),pref==='auto')+LANGS.map(l=>opt(l.code,l.nativeName+(l.nativeName!==l.name?` · ${l.name}`:'')+(l.source==='user'?' ★':''),pref!=='auto'&&I18N.canon(l.code)===I18N.canon(pref)||pref===l.code)).join('');
}
/* Which regional formats exist for the active language (used by the Settings selector). */
function regionOptions(selected){
  const own=I18N.meta(I18N.lang).region;
  const list=LOCALES.slice();
  return opt('auto',tr('set.formatAuto',{format:own?(LOCALES.find(l=>l[0]===own)||[own,own])[1]:I18N.lang}),selected==='auto')+list.map(([k,l])=>opt(k,l,selected===k)).join('');
}
/* Does this regional locale normally use non-Western digits? (decides whether the Digits row is shown) */
function nativeDigitsDiffer(){
  try{return new Intl.NumberFormat(formatLocaleBase()+'-u-ca-gregory').resolvedOptions().numberingSystem!=='latn';}catch{return false;}
}

/* Number fields accept only ASCII digits. If someone types Arabic-Indic / Persian digits or the Arabic
   decimal mark, convert them as they are typed so the amount is stored as an ordinary number. */
document.addEventListener('beforeinput',e=>{
  const el=e.target;
  if(!(el instanceof HTMLInputElement)||el.type!=='number'||typeof e.data!=='string')return;
  const a=Fmt.toAscii(e.data);
  if(a===e.data)return;
  e.preventDefault();
  try{document.execCommand('insertText',false,a);}catch{}
});
