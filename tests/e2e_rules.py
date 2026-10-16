#!/usr/bin/env python3
"""E2E for rules & automation in the REAL app: rule creation, auto-categorise on add / import, clean-up, apply-to-existing, suggestions,
persistence, export, undo, safety backup, translations. Run: DISPLAY=:99 python3 tests/e2e_rules.py [--shots DIR]"""
import json, os, sys, time, glob, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright
check = E.check
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
def shot(pg, n):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=f'{SHOTS}/{n}.png')
def cid(pg, name): return pg.evaluate("(n)=>S.categories.find(c=>c.name===n).id", name)
def goset(pg, sc='cats'):
    pg.evaluate("SET_CAT=null;go('dashboard');go('settings')"); pg.wait_for_timeout(300)
    pg.evaluate(f"document.querySelector('.setnav-i[data-sc={sc}]').click()"); pg.wait_for_timeout(300)

def main():
    subprocess.run(['pkill', '-9', '-x', 'electron']); time.sleep(1)
    with sync_playwright() as pw:
        E.reset(); p, br, pg = E.session(pw)
        E.finish_onboarding(pg); pg.evaluate("document.querySelector('#modal')&&closeModal()"); pg.wait_for_timeout(400)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.evaluate("""()=>{S.accounts.length=0;S.accounts.push({id:'a1',name:'Checking',type:'checking',opening:1000},{id:'a2',name:'Savings',type:'savings',opening:0});S.transactions.length=0;S.rules=[];save();}""")
        dining, other, shopping, subs = cid(pg, 'Dining'), pg.evaluate("S.categories.find(c=>c.type==='expense'&&/other/i.test(c.name)).id"), cid(pg, 'Shopping'), cid(pg, 'Subscriptions')

        # R1 create a rule through the UI
        goset(pg); pg.click('#rl_new'); pg.wait_for_timeout(300)
        pg.fill('#rt', 'starbucks'); pg.select_option('#rcat', dining); pg.fill('#rrn', 'Starbucks'); shot(pg, 'rule-sheet'); pg.click('#shok'); pg.wait_for_timeout(700)
        check('R1 rule created via Settings and listed', pg.evaluate("S.rules.length")==1 and pg.evaluate("document.querySelectorAll('[data-rl-row]').length")==1)
        pg.wait_for_timeout(800); check('R1b rule written to disk', len(E.disk().get('rules', []))==1 and E.disk()['rules'][0]['text']=='starbucks')
        check('R1c empty rule rejected', (lambda: (pg.click('#rl_new'), pg.wait_for_timeout(250), pg.click('#shok'), pg.wait_for_timeout(250), pg.evaluate("S.rules.length"))[-1])()==1)
        pg.evaluate("closeModal()"); pg.wait_for_timeout(200)

        # R2 manual add applies the rule (payee cleaned, category filled)
        pg.evaluate("go('transactions')"); pg.evaluate("openTx()"); pg.wait_for_timeout(400)
        pg.fill('#amt', '4.5'); pg.fill('#mer', 'STARBUCKS #1234 NYC'); pg.wait_for_timeout(200); pg.click('#shok'); pg.wait_for_timeout(700)
        t = pg.evaluate("S.transactions[S.transactions.length-1]")
        check('R2 add form: rule sets category and cleans payee', t['category']==dining and t['merchant']=='Starbucks', (t['merchant'], t['category']))
        check('R2b amount untouched by rules', t['amount']==4.5)

        # R3 import: rule > keyword > Other
        csv = "Date,Amount,Description\n2026-10-01,-3.20,STARBUCKS #99\n2026-10-02,-15,Uber trip\n2026-10-03,-40,Mystery Co\n2026-10-04,-41,Mystery Co\n"
        pg.evaluate("(c)=>{window.pickFile=async()=>c;}", csv); pg.evaluate("importCSV()"); pg.wait_for_timeout(500); pg.select_option('#a', 'a1'); pg.click('#shok'); pg.wait_for_timeout(900)
        imp = pg.evaluate("Object.fromEntries(S.transactions.filter(x=>x.note==='Imported').map(x=>[x.merchant+':'+x.amount,x.category]))")
        check('R3a import: your rule wins (and renames the payee)', imp.get('Starbucks:3.2')==dining, imp)
        check('R3b import: built-in keyword (Uber -> Transport)', imp.get('Uber trip:15')==cid(pg,'Transport'))
        check('R3c import: unknown payee lands in Other (to be reviewed)', imp.get('Mystery Co:40')==other)

        # R4 clean-up: group by payee, file both at once, remember as rule, undo
        goset(pg); check('R4a clean-up button enabled (payee stuck in Other)', not pg.evaluate("document.getElementById('rl_clean').disabled"))
        pg.click('#rl_clean'); pg.wait_for_timeout(400)
        check('R4b clean-up groups the two Mystery Co rows into one line', pg.evaluate("document.querySelectorAll('.clrow').length")==1 and '2' in pg.inner_text('.clrow'), pg.inner_text('.clrow')[:60])
        pg.select_option('.clrow [data-cs]', shopping); shot(pg, 'cleanup'); pg.click('#shok'); pg.wait_for_timeout(900)
        check('R4c both transactions filed, rule remembered', pg.evaluate("S.transactions.filter(x=>x.merchant==='Mystery Co').every(x=>x.category==='%s')" % shopping) and pg.evaluate("S.rules.some(r=>r.text==='Mystery Co'&&r.category==='%s')" % shopping))
        check('R4d clean-up took a safety backup', len(glob.glob(E.CFG+'/backups/before-change-*'))>=1)
        pg.locator('.toast .ta', has_text='Undo').last.click(); pg.wait_for_timeout(500)
        check('R4e undo restores Other and removes the new rule', pg.evaluate("S.transactions.filter(x=>x.merchant==='Mystery Co').every(x=>x.category==='%s')" % other) and not pg.evaluate("S.rules.some(r=>r.text==='Mystery Co')"))

        # R5 apply to existing (preview first; only 'Other' by default)
        pg.evaluate("""(o)=>{S.rules.push({id:'rx',on:true,op:'contains',text:'mystery',min:'',max:'',type:'expense',accountId:'',category:S.categories.find(c=>c.name==='Shopping').id,rename:''});
           S.transactions.push({id:'keep1',date:'2026-10-05',amount:9,type:'expense',accountId:'a1',category:S.categories.find(c=>c.name==='Health').id,merchant:'Mystery Co',note:''});save();}""", other)
        goset(pg); pg.click('#rl_apply'); pg.wait_for_timeout(400)
        check('R5a preview counts only Other-filed rows by default (2, not the Health one)', pg.evaluate("document.getElementById('rap').innerText").find('2')>=0 and pg.evaluate("document.getElementById('raf').checked"), pg.inner_text('#rap')[:70])
        pg.click('#shok'); pg.wait_for_timeout(800)
        check('R5b applied; manually-filed transaction left alone', pg.evaluate("S.transactions.filter(x=>x.merchant==='Mystery Co'&&x.id!=='keep1').every(x=>x.category==='%s')" % shopping) and pg.evaluate("S.transactions.find(x=>x.id==='keep1').category===S.categories.find(c=>c.name==='Health').id"))
        pg.locator('.toast .ta', has_text='Undo').last.click(); pg.wait_for_timeout(400)
        check('R5c undo', pg.evaluate("S.transactions.filter(x=>x.merchant==='Mystery Co'&&x.id!=='keep1').every(x=>x.category==='%s')" % other))

        # R6 suggested rules from history
        pg.evaluate("""()=>{const s=S.categories.find(c=>c.name==='Subscriptions').id;for(let i=0;i<4;i++)S.transactions.push({id:'nf'+i,date:'2026-0'+(i+1)+'-05',amount:15.49,type:'expense',accountId:'a1',category:s,merchant:'Netflix',note:''});S.rules=S.rules.filter(r=>r.id!=='rx');save();}""")
        goset(pg); pg.click('#rl_suggest'); pg.wait_for_timeout(400)
        check('R6a suggestions offered for a payee consistently filed (Netflix x4)', 'Netflix' in pg.inner_text('#modal'))
        shot(pg, 'suggest'); pg.click('#shok'); pg.wait_for_timeout(700)
        check('R6b chosen suggestion became a rule', pg.evaluate("S.rules.some(r=>/netflix/i.test(r.text)&&r.category==='%s')" % subs))

        # R7 transfers are never touched
        pg.evaluate("S.transactions.push({id:'tr1',date:'2026-10-06',amount:50,type:'transfer',accountId:'a1',toAccountId:'a2',merchant:'Starbucks savings',note:''});save()")
        pg.evaluate("closeModal&&0"); goset(pg); pg.click('#rl_apply'); pg.wait_for_timeout(300); pg.evaluate("document.getElementById('raf').checked=false;document.getElementById('raf').onchange()"); pg.wait_for_timeout(200)
        pg.evaluate("document.querySelector('#shok')&&document.querySelector('#shok').click()"); pg.wait_for_timeout(700)
        check('R7 transfer keeps no category and original name', pg.evaluate("(()=>{const t=S.transactions.find(x=>x.id==='tr1');return !t.category&&t.merchant==='Starbucks savings'})()"))
        pg.wait_for_timeout(400)

        # R8 persistence + export
        pg.wait_for_timeout(900); n_rules = pg.evaluate("S.rules.length")
        check('R8a disk has the same rules as memory', len(E.disk().get('rules', []))==n_rules, (n_rules, len(E.disk().get('rules', []))))
        ex = pg.evaluate("(async()=>{const r=await buildExport({settings:true,password:''});return typeof r==='string'?r:(r.text||r.content||JSON.stringify(r))})()")
        check('R8b export file contains the rules', '"rules"' in ex and 'starbucks' in ex.lower())
        pg.evaluate("window.close()"); br.close(); E.kill(p, 15); p, br, pg = E.session(pw); pg.wait_for_timeout(700)
        check('R8c rules survive restart', pg.evaluate("S.rules.length")==n_rules)
        # new tx after restart still uses the rule
        pg.evaluate("openTx()"); pg.wait_for_timeout(350); pg.fill('#amt', '2'); pg.fill('#mer', 'netflix.com'); pg.wait_for_timeout(200); pg.click('#shok'); pg.wait_for_timeout(600)
        check('R8d rule still applies after restart', pg.evaluate("S.transactions[S.transactions.length-1].category")==subs)

        # R9 translations
        for lang, pat in (('ar', 'القواعد|قاعدة'), ('es', 'regla')):
            pg.evaluate(f"setAppLanguage('{lang}')"); pg.wait_for_timeout(700); goset(pg)
            txt = pg.inner_text('#rulesgroup'); pg.click('#rl_new'); pg.wait_for_timeout(300); txt2 = pg.inner_text('#modal'); shot(pg, f'rule-sheet-{lang}'); pg.evaluate("closeModal()")
            import re
            raw = re.findall(r'\brules\.[a-zA-Z.]+', txt + txt2)
            check(f'R9 rules UI fully translated in {lang} (no raw keys)', not raw and re.search(pat, txt + txt2, re.I) is not None, raw[:3])
        pg.evaluate("setAppLanguage('en')"); pg.wait_for_timeout(500)
        check('Z no uncaught page errors', not errs, errs[:3])
        p.terminate()

        # R10 corrupt rules data does not crash the app
        E.kill(p); E.reset({'penny-data.json': {'schema': 2, 'settings': {}, 'accounts': [{'id': 'a1', 'name': 'A', 'type': 'checking', 'opening': 0}], 'categories': [], 'transactions': [], 'goals': [], 'bills': [], 'reminders': [], 'rules': [None, 5, 'x', {'id': 'r1'}, {'id': 'r2', 'text': 'a', 'category': 'zzz', 'op': 'weird', 'min': 'abc'}]}})
        p, br, pg = E.session(pw)
        ok = pg.evaluate("!!S&&Array.isArray(S.rules)&&S.rules.every(r=>typeof r.id==='string'&&['contains','equals','starts'].includes(r.op))")
        check('R10 corrupt rule entries are cleaned on load (no crash)', ok, pg.evaluate("JSON.stringify(S.rules)"))
        p.terminate()
    bad = [n for n, ok in E.RESULTS if not ok]
    print(f'\n{len(E.RESULTS) - len(bad)}/{len(E.RESULTS)} checks passed')
    if bad: print('FAILED:', *bad, sep='\n  ')
    sys.exit(1 if bad else 0)
if __name__ == '__main__': main()
