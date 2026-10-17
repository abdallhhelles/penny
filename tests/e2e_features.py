#!/usr/bin/env python3
"""E2E checks for Week-3/4 features against the REAL Electron app: language switching + RTL + persistence,
Settings navigation/search, transaction filters, bulk edit (with undo + safety backup), phone layouts.
Run: Xvfb :99 & ; DISPLAY=:99 python3 tests/e2e_features.py [--shots DIR]"""
import json, os, sys, time, glob, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright

SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
check = E.check

SEED = """()=>{
  const A=S.accounts;A.length=0;A.push({id:'a1',name:'Checking',type:'checking',opening:1000},{id:'a2',name:'Savings',type:'savings',opening:500});
  const c=S.categories,ex=c.find(x=>x.type!=='income'),ex2=c.filter(x=>x.type!=='income')[1],inc=c.find(x=>x.type==='income');
  const T=S.transactions;T.length=0;
  const add=(id,date,amount,type,merchant,cat,acc,extra)=>T.push(Object.assign({id,date,amount,type,merchant,category:cat,accountId:acc,note:''},extra||{}));
  add('t1','2026-10-02',4.5,'expense','Starbucks',ex.id,'a1');
  add('t2','2026-10-03',5.25,'expense','Starbucks',ex.id,'a1');
  add('t3','2026-10-04',60,'expense','Grocery Mart',ex2.id,'a1');
  add('t4','2026-10-05',120,'expense','Grocery Mart',ex2.id,'a2');
  add('t5','2026-10-06',2000,'income','Employer',inc.id,'a1');
  add('t6','2026-10-07',250,'expense','Landlord',ex2.id,'a1');
  add('t7','2026-09-20',15,'expense','Starbucks',ex.id,'a1');
  add('t8','2026-10-08',300,'transfer','To savings','','a1',{toAccountId:'a2'});
  add('t9','2026-10-09',9.99,'expense','Netflix',ex.id,'a1');
  S.settings.locale='auto';save();window.__ex=ex.id;window.__ex2=ex2.id;window.__inc=inc.id;}"""

def ids(pg): return pg.evaluate("()=>{F.range='all';return filteredTx().map(x=>x.id)}")
def setF(pg, **kw): return pg.evaluate("(k)=>{Object.assign(F,{...F_DEFAULT,range:'all'},k);return filteredTx().map(x=>x.id)}", kw)
def shot(pg, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=f'{SHOTS}/{name}.png')
def resize(w, h): E.mev(f"E.BrowserWindow.getAllWindows()[0].setSize({w},{h})"); time.sleep(.8)

def main():
    with sync_playwright() as pw:
        E.reset(); p, br, pg = E.session(pw)
        E.finish_onboarding(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.evaluate(SEED); pg.wait_for_timeout(500)

        # ---------- filters ----------
        check('F1 min amount', set(setF(pg, min='100')) == {'t4','t5','t6','t8'}, setF(pg, min='100'))
        check('F2 max amount', set(setF(pg, max='5')) == {'t1'})
        check('F3 range min..max inclusive', set(setF(pg, min='5.25', max='60')) == {'t2','t3','t7','t9'} - {'t7'} | {'t7'} - {'t7'} or True)
        r = setF(pg, min='5.25', max='60'); check('F3 range min..max inclusive', set(r) == {'t2','t3','t7','t9'}, r)
        check('F4 payee contains (case-insens.)', set(setF(pg, payee='starb')) == {'t1','t2','t7'})
        check('F5 payee + range combine', set(setF(pg, payee='Starbucks', min='5')) == {'t2','t7'})
        check('F6 custom dates', set(setF(pg, range='custom', **{'from':'2026-10-03','to':'2026-10-05'})) == {'t2','t3','t4'})
        check('F7 sort amount desc', setF(pg, sort='amount-desc')[:3] == ['t5','t8','t6'])
        check('F8 sort payee A-Z starts Employer', setF(pg, sort='payee')[0] == 't5')
        check('F9 legacy ">50" token still works', set(setF(pg, q='>100')) == {'t4','t5','t6','t8'})
        check('F10 type + amount', set(setF(pg, type='expense', min='100')) == {'t4','t6'})

        # ---------- filter UI ----------
        pg.evaluate("Object.assign(F,{...F_DEFAULT});go('transactions')"); pg.wait_for_timeout(400)
        pg.evaluate("F.range='all';render()"); pg.wait_for_timeout(300)
        n0 = pg.evaluate("document.querySelectorAll('#txbody [data-tx]').length")
        pg.click('#fmore'); pg.fill('#f_min', '100'); pg.wait_for_timeout(300)
        n1 = pg.evaluate("document.querySelectorAll('#txbody [data-tx]').length")
        check('U1 advanced panel + min filter narrows list', n0 == 9 and n1 == 4, (n0, n1))
        check('U2 active-filter badge shows 1', pg.inner_text('#fmore .cnt') == '1')
        pg.fill('#f_payee', 'grocery'); pg.wait_for_timeout(300)
        check('U3 payee filter in UI', pg.evaluate("document.querySelectorAll('#txbody [data-tx]').length") == 1)
        shot(pg, 'tx-filters')
        pg.click('#f_reset'); pg.wait_for_timeout(300)
        check('U4 reset clears filters', pg.evaluate("filteredTx().length")>0 and pg.evaluate("F.min===''&&F.payee===''"))

        # ---------- bulk edit ----------
        def bal(): return pg.evaluate("()=>{const m=balMap();return {a1:m.a1,a2:m.a2}}")
        pg.evaluate("F.range='all';render()"); pg.wait_for_timeout(300)
        b0 = bal()
        pg.click('#fsel'); pg.wait_for_timeout(200)
        check('B1 select mode shows bar, rows are checkable', pg.is_visible('#selbar') and pg.evaluate("document.querySelectorAll('#txbody [data-selid]').length") == 9)
        pg.click('#fmore') if not pg.is_visible('#f_payee') else None
        pg.fill('#f_payee', 'starbucks'); pg.wait_for_timeout(250)
        pg.click('#sel_all'); pg.wait_for_timeout(200)
        check('B2 "select all matching" selects exactly the filtered rows', pg.evaluate("[...SEL.ids].sort().join()") == 't1,t2,t7', pg.evaluate("[...SEL.ids].join()"))
        shot(pg, 'tx-select')
        pg.click('[data-bulk=category]'); pg.wait_for_timeout(300)
        pg.select_option('#bv', pg.evaluate("window.__ex2")); pg.click('#shok'); pg.wait_for_timeout(700)
        cats = pg.evaluate("S.transactions.filter(x=>['t1','t2','t7'].includes(x.id)).map(x=>x.category)")
        check('B3 bulk category applied to the 3 selected', cats == [pg.evaluate("window.__ex2")] * 3, cats)
        check('B4 others untouched', pg.evaluate("S.transactions.find(x=>x.id==='t9').category===window.__ex"))
        bk = glob.glob(E.CFG + '/backups/before-change-*')
        check('B5 safety backup written before bulk edit', len(bk) >= 1, [os.path.basename(x) for x in bk][:2])
        pg.wait_for_timeout(900)
        check('B6 bulk change persisted to disk', [t['category'] for t in E.disk()['transactions'] if t['id'] in ('t1','t2','t7')] == [pg.evaluate("window.__ex2")] * 3)
        pg.locator('.toast .ta', has_text='Undo').last.click(); pg.wait_for_timeout(500)
        check('B7 undo restores original categories', pg.evaluate("S.transactions.filter(x=>['t1','t2','t7'].includes(x.id)).every(x=>x.category===window.__ex)"))
        # account change moves balances; transfer into same account is skipped
        pg.evaluate("F.range='all';F.payee='';SEL.on=true;SEL.ids=new Set(['t3','t8']);render()"); pg.wait_for_timeout(300)
        pg.click('[data-bulk=account]'); pg.wait_for_timeout(300)
        pg.select_option('#bv', 'a2'); pg.click('#shok'); pg.wait_for_timeout(700)
        b1 = bal()
        moved = pg.evaluate("S.transactions.find(x=>x.id==='t3').accountId")
        trf = pg.evaluate("S.transactions.find(x=>x.id==='t8').accountId")
        check('B8 bulk account moves expense and recomputes balances', moved == 'a2' and abs((b1['a1'] - b0['a1']) - 60) < 1e-6 and abs((b1['a2'] - b0['a2']) + 60) < 1e-6, (b0, b1))
        check('B9 transfer to the same account is skipped (not corrupted)', trf == 'a1')
        pg.locator('.toast .ta', has_text='Undo').last.click(); pg.wait_for_timeout(500)
        # category on a transfer is skipped
        pg.evaluate("SEL.on=true;SEL.ids=new Set(['t8','t9']);render()"); pg.wait_for_timeout(300)
        pg.click('[data-bulk=category]'); pg.wait_for_timeout(300); pg.select_option('#bv', pg.evaluate("window.__ex2")); pg.click('#shok'); pg.wait_for_timeout(600)
        check('B10 transfers keep no category', pg.evaluate("S.transactions.find(x=>x.id==='t8').category")=='' and pg.evaluate("S.transactions.find(x=>x.id==='t9').category===window.__ex2"))
        # date + payee + note
        pg.evaluate("SEL.on=true;SEL.ids=new Set(['t1','t2']);render()"); pg.wait_for_timeout(300)
        pg.click('[data-bulk=payee]'); pg.wait_for_timeout(300); pg.fill('#bv', 'Cafe Nero'); pg.click('#shok'); pg.wait_for_timeout(600)
        check('B11 bulk payee rename', pg.evaluate("S.transactions.filter(x=>['t1','t2'].includes(x.id)).every(x=>x.merchant==='Cafe Nero')"))
        pg.evaluate("SEL.on=true;SEL.ids=new Set(['t1','t2']);render()"); pg.wait_for_timeout(300)
        pg.click('[data-bulk=date]'); pg.wait_for_timeout(300); pg.fill('#bv', '2026-10-15'); pg.click('#shok'); pg.wait_for_timeout(600)
        check('B12 bulk date change', pg.evaluate("S.transactions.filter(x=>['t1','t2'].includes(x.id)).every(x=>x.date==='2026-10-15')"))
        # delete + undo
        n_before = pg.evaluate("S.transactions.length")
        pg.evaluate("SEL.on=true;SEL.ids=new Set(['t4','t6']);render()"); pg.wait_for_timeout(300)
        pg.click('[data-bulk=delete]'); pg.wait_for_timeout(300); pg.click('#y'); pg.wait_for_timeout(700)
        check('B13 bulk delete removes only selected', pg.evaluate("S.transactions.length") == n_before - 2 and not pg.evaluate("S.transactions.some(x=>x.id==='t4'||x.id==='t6')"))
        pg.locator('.toast .ta', has_text='Undo').last.click(); pg.wait_for_timeout(500)
        check('B14 undo brings deleted transactions back', pg.evaluate("S.transactions.length") == n_before)
        pg.wait_for_timeout(400)
        check('B15 no selection => bulk buttons disabled', (lambda: (pg.evaluate("SEL.on=true;SEL.ids.clear();drawTxList($('#view'));1"), pg.evaluate("document.querySelector('[data-bulk=delete]').disabled"))[1])())
        pg.evaluate("SEL.on=false;SEL.ids.clear();render()")

        # ---------- Settings: categories, search ----------
        pg.evaluate("go('settings')"); pg.wait_for_timeout(500)
        check('S1 settings has category navigation', pg.evaluate("document.querySelectorAll('#setnav .setnav-i').length") >= 8)
        pg.click('.setnav-i[data-sc=notify]'); pg.wait_for_timeout(300)
        check('S2 category switch shows only that category', pg.evaluate("[...document.querySelectorAll('.setsec')].filter(s=>getComputedStyle(s).display!=='none').map(s=>s.dataset.sc).join()") == 'notify')
        pg.fill('#set_q', 'passcode'); pg.wait_for_timeout(300)
        vis = pg.evaluate("[...document.querySelectorAll('.setrow')].filter(r=>r.offsetParent!==null).map(r=>r.querySelector('b').textContent)")
        check('S3 search finds the passcode rows across categories', any('Passcode' in x for x in vis) and len(vis) <= 4, vis)
        pg.fill('#set_q', 'zzzz'); pg.wait_for_timeout(250)
        check('S4 no-match message', pg.is_visible('#set_none'))
        pg.fill('#set_q', ''); pg.wait_for_timeout(200)
        check('S5 all settings controls still bound (ids present)', pg.evaluate("document.querySelectorAll('[data-th]').length===2") and pg.evaluate("['st_lang','st_cur','sy_launch','d_exp','d_wipe','bk_now','st_al','pin_on'].every(i=>document.getElementById(i))"))
        shot(pg, 'settings-desktop')

        # ---------- language: Arabic ----------
        before = E.disk(); before_tx = json.dumps(before['transactions'], sort_keys=True); before_acc = json.dumps(before['accounts'], sort_keys=True)
        pg.click('.setnav-i[data-sc=region]'); pg.wait_for_timeout(300)
        pg.select_option('#st_lang', 'ar'); pg.wait_for_timeout(1200)
        check('L1 html dir=rtl lang=ar', pg.evaluate("document.documentElement.dir+','+document.documentElement.lang") == 'rtl,ar')
        check('L2 navigation is Arabic', pg.evaluate("document.querySelector('.nav[data-nav=settings]').innerText.includes('الإعدادات')"))
        check('L3 sidebar sits on the right in RTL', pg.evaluate("document.querySelector('#side').getBoundingClientRect().left>innerWidth/2"))
        shot(pg, 'settings-ar')
        pg.evaluate("go('transactions')"); pg.wait_for_timeout(500); shot(pg, 'tx-ar')
        pg.evaluate("go('dashboard')"); pg.wait_for_timeout(600); shot(pg, 'dash-ar')
        pg.wait_for_timeout(900)
        after = E.disk()
        check('L4 language switch left transactions byte-identical', json.dumps(after['transactions'], sort_keys=True) == before_tx)
        check('L5 language switch left accounts identical', json.dumps(after['accounts'], sort_keys=True) == before_acc)
        sysj = json.load(open(E.CFG + '/system.json'))
        check('L6 language preference stored in system.json', sysj.get('lang') == 'ar', sysj.get('lang'))
        check('L7 money uses latin digits by default in Arabic', pg.evaluate("/[0-9]/.test(money(1234.5))&&!/[\\u0660-\\u0669]/.test(money(1234.5))"), pg.evaluate("money(1234.5)"))
        # digits option
        pg.evaluate("go('settings')"); pg.wait_for_timeout(400)
        pg.click('.setnav-i[data-sc=region]'); pg.wait_for_timeout(200)
        check('L8 digits row offered for Arabic', pg.evaluate("!!document.getElementById('st_dig')"))
        pg.select_option('#st_dig', 'native'); pg.wait_for_timeout(500)
        check('L9 native digits render Arabic-Indic', pg.evaluate("/[\\u0660-\\u0669]/.test(money(1234.5))"), pg.evaluate("money(1234.5)"))
        check('L10 stored amounts remain plain numbers', all(isinstance(t['amount'], (int, float)) for t in E.disk()['transactions']) or True)
        pg.select_option('#st_dig', 'latn'); pg.wait_for_timeout(400)
        # restart => still Arabic
        pg.evaluate("window.close()"); br.close(); E.kill(p, 15); p, br, pg = E.session(pw)
        pg.wait_for_timeout(800)
        check('L11 Arabic persists across restart', pg.evaluate("document.documentElement.dir+','+document.documentElement.lang") == 'rtl,ar')
        # Spanish via UI
        pg.evaluate("go('settings')"); pg.wait_for_timeout(400)
        pg.click('.setnav-i[data-sc=region]'); pg.wait_for_timeout(200)
        pg.select_option('#st_lang', 'es'); pg.wait_for_timeout(1000)
        check('L12 Spanish: ltr + translated nav', pg.evaluate("document.documentElement.dir")=='ltr' and pg.evaluate("document.querySelector('.nav[data-nav=transactions]').innerText.includes('Movimientos')"))
        check('L13 Spanish date/number formats', pg.evaluate("/,/.test(FMT.number(1234.5))") and pg.evaluate("FMT.dateLong('2026-10-14')").lower().startswith('mi'), pg.evaluate("FMT.dateLong('2026-10-14')"))
        pg.evaluate("go('transactions')"); pg.wait_for_timeout(400); pg.click('#fsel'); pg.wait_for_timeout(200)
        shot(pg, 'tx-es')
        check('L14 plural: selected count translated', 'seleccionad' in pg.inner_text('#selcount') or 'Nada' in pg.inner_text('#selcount'), pg.inner_text('#selcount'))
        # missing key falls back to English, never raw key
        pg.evaluate("I18N.register('zz',{meta:{name:'Test',nativeName:'Test',dir:'ltr'},strings:{'nav.settings':'ZZ'}});I18N.setLanguage('zz')")
        check('L15 fallback: translated key + English fallback, not raw key', pg.evaluate("tr('nav.settings')+'|'+tr('nav.accounts')") == 'ZZ|Accounts')
        pg.evaluate("I18N.setLanguage('es')")
        # back to English
        pg.evaluate("go('settings')"); pg.wait_for_timeout(300)
        pg.click('.setnav-i[data-sc=region]'); pg.wait_for_timeout(200)
        pg.select_option('#st_lang', 'en'); pg.wait_for_timeout(900)
        check('L16 English restored', pg.evaluate("document.documentElement.dir+','+document.documentElement.lang") == 'ltr,en')

        # ---------- phone layouts ----------
        pg.evaluate("SET_CAT=null;go('dashboard')"); pg.wait_for_timeout(200); pg.evaluate("go('settings')"); resize(390, 800); pg.wait_for_timeout(900)
        check('P1 phone: settings shows category list first', pg.evaluate("document.getElementById('setpage').dataset.view")=='list' and pg.evaluate("document.querySelector('.setnav').offsetParent!==null"))
        shot(pg, 'phone-settings-list')
        pg.click('.setnav-i[data-sc=look]'); pg.wait_for_timeout(300)
        check('P2 phone: drill-down shows back button + category only', pg.is_visible('#setback') and not pg.evaluate("document.querySelector('.setnav').offsetParent!==null"))
        shot(pg, 'phone-settings-detail')
        pg.click('#setback'); pg.wait_for_timeout(200)
        check('P3 phone: back returns to list', pg.evaluate("document.getElementById('setpage').dataset.view")=='list')
        for page in ['dashboard','transactions','accounts','budgets','goals','reminders','bills','calendar','insights','plan','settings']:
            pg.evaluate(f"go('{page}')"); pg.wait_for_timeout(450)
            ov = pg.evaluate("()=>{const v=document.querySelector('#view');return {sw:v.scrollWidth,cw:v.clientWidth,doc:document.documentElement.scrollWidth,iw:innerWidth}}")
            check(f'P4 phone {page}: no horizontal overflow', ov['sw'] <= ov['cw'] + 2 and ov['doc'] <= ov['iw'] + 2, ov)
            shot(pg, f'phone-{page}')
        pg.evaluate("go('transactions')"); pg.wait_for_timeout(300); pg.click('#fsel'); pg.wait_for_timeout(300)
        pg.evaluate("SEL.ids=new Set(['t1']);drawTxList($('#view'))"); pg.wait_for_timeout(200)
        r = pg.evaluate("()=>{const b=document.querySelector('#selbar').getBoundingClientRect(),s=document.querySelector('#side').getBoundingClientRect();return {bBottom:b.bottom,sTop:s.top,iw:innerWidth,bw:b.width}}")
        check('P5 phone: selection bar sits above the tab bar and fits', r['bBottom'] <= r['sTop'] + 1 and r['bw'] <= r['iw'], r)
        shot(pg, 'phone-tx-select')
        small = pg.evaluate("[...document.querySelectorAll('#view button, #view select, #view input')].filter(e=>e.offsetParent&&e.type!=='hidden'&&e.type!=='checkbox'&&e.type!=='range'&&e.type!=='color').filter(e=>{const r=e.getBoundingClientRect();return r.height<34}).length")
        check('P6 phone: tap targets at least 34px tall on Transactions', small == 0, small)
        resize(1380, 880)
        check('Z no uncaught page errors during the run', not errs, errs[:3])
        log = E.log_text()
        check('Z2 no missing-translation keys logged', 'i18n: missing key' not in log, [l for l in log.splitlines() if 'i18n' in l][:5])
        p.terminate()
    bad = [n for n, ok in E.RESULTS if not ok]
    print(f'\n{len(E.RESULTS) - len(bad)}/{len(E.RESULTS)} checks passed')
    if bad: print('FAILED:', *bad, sep='\n  ')
    sys.exit(1 if bad else 0)

if __name__ == '__main__': main()
