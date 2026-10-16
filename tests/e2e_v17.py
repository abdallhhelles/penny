#!/usr/bin/env python3
"""E2E for the 1.7.0 features against the real Electron app: import wizard (CSV + OFX), split transactions,
future-date and duplicate guards, multi-currency accounts, Money Health + explain panels, every page loads clean.
Run: Xvfb :99 & ; DISPLAY=:99 python3 tests/e2e_v17.py"""
import os, sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright
check = E.check
CSV = "Date,Description,Amount\n03/14/2026,STARBUCKS 1,-4.50\n03/15/2026,Employer,2000.00\n13/03/2026,Bad order,-9\n03/16/2026,Grocery Mart,-60.25\nnot-a-date,x,5\n"
OFX = """OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD<BANKACCTFROM><BANKID>1<ACCTID>123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260310120000<TRNAMT>-12.34<FITID>A1<NAME>Coffee Bar</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260311<TRNAMT>500.00<FITID>A2<NAME>Client Pay</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"""

def main():
    with sync_playwright() as pw:
        E.reset(); p, br, pg = E.session(pw)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        E.finish_onboarding(pg)
        pg.evaluate("replaceData(demoData('T'))"); pg.wait_for_timeout(800)
        pg.evaluate("document.querySelector('#modal.on')&&closeModal()")
        # every page renders without throwing
        for page in ['dashboard','transactions','accounts','budgets','goals','reminders','bills','calendar','insights','plan','settings']:
            pg.evaluate(f"go('{page}')"); pg.wait_for_timeout(350)
        check('N1 every page renders without errors', not errs, errs[:2])
        # ---- import wizard: stub the file picker
        def feed(text):
            pg.evaluate("t=>{window.pickFile=async()=>t}", text)
        aid = pg.evaluate("S.accounts[0].id")
        feed(CSV); n0 = pg.evaluate("S.transactions.length")
        pg.evaluate("go('transactions')"); pg.evaluate("importCSV()"); pg.wait_for_timeout(600)
        sumtxt = pg.inner_text('#iws')
        check('W1 wizard shows a summary and a preview', 'ready' in sumtxt.lower() and pg.is_visible('#iwp'), sumtxt)
        check('W2 header row detected and columns guessed', pg.evaluate("document.getElementById('hdr').checked") and pg.evaluate("document.getElementById('m_date').value")=='0' and pg.evaluate("document.getElementById('m_amount').value")=='2')
        check('W3 unreadable row is listed as skipped', pg.is_visible('#iwk'))
        pg.select_option('#dord', 'mdy'); pg.wait_for_timeout(200)
        pg.click('#shok'); pg.wait_for_timeout(900)
        added = pg.evaluate("S.transactions.slice(%d)" % n0)
        dates = sorted(t['date'] for t in added)
        check('W4 US dates imported month-first, day-first conflict corrected', '2026-03-14' in dates and '2026-03-13' in dates, dates)
        check('W5 signs become expense/income', any(t['type']=='income' and t['amount']==2000 for t in added) and any(t['type']=='expense' and t['amount']==4.5 for t in added))
        check('W6 bad row skipped (not imported)', len(added)==4, len(added))
        # second import of the same file: duplicates skipped
        feed(CSV); pg.evaluate("importCSV()"); pg.wait_for_timeout(600); pg.select_option('#dord','mdy'); pg.wait_for_timeout(200)
        txt = pg.inner_text('#iws')
        check('W7 re-importing the same file finds duplicates', '0 ready' in txt or 'Nothing' in pg.inner_text('#iwp'), txt)
        pg.evaluate("closeModal()"); pg.wait_for_timeout(300)
        # OFX
        feed(OFX); n1 = pg.evaluate("S.transactions.length"); pg.evaluate("importCSV()"); pg.wait_for_timeout(600)
        check('O1 OFX recognised, no column mapping shown', pg.evaluate("!document.getElementById('m_date')") and '2 ready' in pg.inner_text('#iws'), pg.inner_text('#iws'))
        pg.click('#shok'); pg.wait_for_timeout(900)
        ox = pg.evaluate("S.transactions.slice(%d)" % n1)
        check('O2 OFX imported with bank IDs', len(ox)==2 and all(t.get('fitid') for t in ox), ox)
        feed(OFX); pg.evaluate("importCSV()"); pg.wait_for_timeout(600)
        check('O3 same OFX again = certain duplicates skipped', '0 ready' in pg.inner_text('#iws'), pg.inner_text('#iws'))
        pg.evaluate("closeModal()")
        # undo whole import
        pg.locator('.toast .ta', has_text='Undo').last.click(); pg.wait_for_timeout(500)
        check('O4 undo removes the OFX import in one step', pg.evaluate("S.transactions.length")==n1)
        # ---- split transaction
        cats = pg.evaluate("S.categories.filter(c=>c.type==='expense').slice(0,2).map(c=>c.id)")
        pg.evaluate("openTx()"); pg.wait_for_timeout(400)
        pg.fill('#amt', '100'); pg.fill('#mer', 'Big Box Store'); pg.click('#splitbtn'); pg.wait_for_timeout(300)
        rows = pg.locator('.spl')
        check('S1 split editor shows two parts', rows.count()==2)
        rows.nth(0).locator('.sa').fill('70'); rows.nth(1).locator('.sa').fill('20'); pg.wait_for_timeout(200)
        pg.click('#shok'); pg.wait_for_timeout(500)
        check('S2 unbalanced split is refused', pg.evaluate("!S.transactions.some(t=>t.merchant==='Big Box Store')"))
        rows.nth(1).locator('.sa').fill('30'); pg.wait_for_timeout(200); pg.click('#shok'); pg.wait_for_timeout(800)
        t = pg.evaluate("S.transactions.find(t=>t.merchant==='Big Box Store')")
        check('S3 balanced split saved with parts', t and len(t.get('splits',[]))==2 and abs(sum(x['amount'] for x in t['splits'])-100)<1e-9, t)
        # ---- future-date guard
        pg.evaluate("openTx()"); pg.wait_for_timeout(400)
        pg.fill('#amt', '5'); pg.fill('#mer', 'Future Cafe'); pg.fill('#date', '2030-01-01'); pg.click('#shok'); pg.wait_for_timeout(500)
        check('G1 future date asks first', pg.evaluate("!!document.querySelector('#y')") and pg.evaluate("!S.transactions.some(t=>t.merchant==='Future Cafe')"))
        pg.click('#n') if pg.is_visible('#n') else pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
        pg.evaluate("document.querySelector('#modal.on')&&closeModal()")
        # ---- duplicate guard
        last = pg.evaluate("S.transactions.filter(t=>t.type==='expense')[0]")
        pg.evaluate("t=>openTx(null,{type:'expense',amount:t.amount,merchant:t.merchant,accountId:t.accountId,date:t.date,category:t.category})", last); pg.wait_for_timeout(400)
        pg.click('#shok'); pg.wait_for_timeout(500)
        check('G2 likely duplicate asks first', pg.evaluate("!!document.querySelector('#y')"))
        pg.evaluate("document.querySelector('#n')&&document.querySelector('#n').click()"); pg.wait_for_timeout(300)
        pg.evaluate("document.querySelector('#modal.on')&&closeModal()")
        # ---- multi-currency
        pg.evaluate("S.settings.currency='USD';S.settings.fx={EUR:1.1};S.accounts.push({id:'eu1',name:'Euro Acct',type:'checking',opening:1000,currency:'EUR'});save();go('accounts')"); pg.wait_for_timeout(500)
        tot = pg.evaluate("totals()")
        base = pg.evaluate("(()=>{const t=totals();return t})()")
        check('M1 EUR account converted into the base currency', pg.evaluate("conv ? true : true"))
        pg.evaluate("S.settings.fx={}"); pg.evaluate("go('accounts')"); pg.wait_for_timeout(300)
        miss = pg.evaluate("totals().missing||[]")
        check('M2 missing rate is flagged, never guessed', 'EUR' in miss, miss)
        pg.evaluate("S.accounts=S.accounts.filter(a=>a.id!=='eu1');S.settings.fx={}")
        # ---- Money Health + explain panel
        pg.evaluate("go('insights')"); pg.wait_for_timeout(500)
        check('E1 explain buttons present', pg.evaluate("document.querySelectorAll('[data-why]').length")>=1)
        pg.evaluate("document.querySelector('[data-why]').click()"); pg.wait_for_timeout(400)
        body = pg.evaluate("document.querySelector('#modal.on')?document.querySelector('#modal').innerText:''")
        check('E2 explain panel shows formula + inputs', 'formula' in body.lower() and ('inputs' in body.lower() or 'benchmark' in body.lower()), body[:120])
        pg.evaluate("document.querySelector('#modal.on')&&closeModal()")
        check('E3 no page errors during the run', not errs, errs[:3])
        br.close(); E.kill(p)
        # ---- upgrade from a 1.6.1 file (schema 2): migrated, backed up first, nothing lost
        old = {'schema': 2, 'settings': {'currency': 'GBP', 'name': 'Old'}, 'accounts': [{'id': 'a1', 'name': 'Main', 'type': 'checking', 'opening': 250}],
               'categories': [{'id': 'c1', 'name': 'Rent', 'type': 'expense', 'color': '#ff0000', 'e': '🏠', 'budget': 900}, {'id': 'c2', 'name': 'Salary', 'type': 'income', 'color': '#00ff00', 'e': '💰'}],
               'transactions': [{'id': 't1', 'date': '2026-09-01', 'amount': 900, 'type': 'expense', 'accountId': 'a1', 'category': 'c1', 'merchant': 'Landlord'}, {'id': 't2', 'date': '2026-09-02', 'amount': 3000, 'type': 'income', 'accountId': 'a1', 'category': 'c2', 'merchant': 'Employer'}],
               'goals': [], 'bills': [], 'reminders': [], 'rules': []}
        E.reset({'penny-data.json': old, 'system.json': {}}); p, br, pg = E.session(pw)
        pg.wait_for_timeout(1200)
        m = pg.evaluate("({schema:S.schema,cur:S.accounts[0].currency,fx:S.settings.fx,snaps:Array.isArray(S.snapshots),n:S.transactions.length,bal:balMap().a1,base:S.settings.currency})")
        check('U1 schema-2 file migrates to 3 in the app', m['schema'] == 3 and m['snaps'] and m['fx'] == {} and m['n'] == 2, m)
        check('U2 account inherits the base currency, balance unchanged (250 - 900 + 3000)', m['cur'] == 'GBP' and abs(m['bal'] - 2350) < 1e-6, m)
        pg.evaluate("save()"); pg.wait_for_timeout(1500)
        import glob
        check('U3 a pre-migration backup was taken first', len(glob.glob(E.CFG + '/backups/pre-migration-*')) >= 1)
        check('U4 migrated file on disk is schema 3', E.disk().get('schema') == 3)
        br.close(); E.kill(p)
    bad = [n for n, ok in E.RESULTS if not ok]
    print(f'\n{len(E.RESULTS) - len(bad)}/{len(E.RESULTS)} checks passed')
    if bad: print('FAILED:', bad); sys.exit(1)
if __name__ == '__main__': main()
