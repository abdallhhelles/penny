#!/usr/bin/env python3
"""Translation audit: runs Penny in a pseudo-language where every message is wrapped in ⟦…⟧, opens every page, dialog,
the tour and the guide, and reports any visible English text that did not come from the translation files.
Usage: python3 tests/e2e_i18n_audit.py [--list]   (exit 1 when untranslated text is found)"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
en = json.load(open(os.path.join(ROOT, 'renderer', 'locales', 'en.json'), encoding='utf8'))
PH = re.compile(r'(\{[A-Za-z_][\w.]*\})')
def wrap(v):  # keep {placeholders} outside the brackets so values are not counted as translated text
    parts = PH.split(v); return ''.join(p if PH.fullmatch(p) else ('⟦' + p + '⟧' if p.strip() else p) for p in parts)
pseudo = {'meta': {'name': 'Pseudo', 'nativeName': 'Pseudo', 'dir': 'ltr', 'region': 'zh-CN', 'status': 'draft'}, 'strings': {k: wrap(v) for k, v in en['strings'].items()}}
# Brand names, technical tokens and sample merchants that are the same in every language
ALLOW = set('''Penny Pro PDF CSV OFX QIF JSON AES GCM USD EUR APR Ctrl Alt Shift Esc Tab Enter Space Home End Windows Discord GitHub Sora
Visa Rewards Whole Foods Aldi Carrefour Trader Joe Starbucks Chipotle Sushi Zen Pizza Hut Uber Shell Amazon Zara IKEA Cinema City Steam Audible Netflix Spotify
Akrot Electron rcedit MIT OFL SIL Open Font License XXXX PENNY Lee Morningstar Vanguard Fidelity OECD INFE Findex FinHealth CFPB Bengen Trinity McShane Gal JPMorgan HerMoney Tyagi Warren
Global Database World Bank Network Health Financial Institute Journal Marketing Research Pulse Score framework survey International Adult Literacy'''.split())
def leftovers(t):
    t = re.sub(r'⟦[^⟧]*⟧', ' ', t)
    words = re.findall(r"[A-Za-z][A-Za-z'’]{1,}", t)
    return [w for w in words if w.strip("'’") not in ALLOW and not re.fullmatch(r'[A-Z]{2,4}', w)]

JS_COLLECT = r'''(() => {
  const out = [], seen = new Set();
  const vis = e => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { const t = n.textContent.trim(); if (!t || !n.parentElement || ['SCRIPT','STYLE'].includes(n.parentElement.tagName)) continue; if (n.parentElement.closest('svg text, .amt, input, textarea, [data-noaudit]')) continue; if (!vis(n.parentElement)) continue; if (!seen.has(t)) { seen.add(t); out.push(t); } }
  for (const e of document.querySelectorAll('[placeholder],[title],[aria-label]')) { if (!vis(e)) continue; for (const a of ['placeholder','title','aria-label']) { const t = (e.getAttribute(a) || '').trim(); if (t && !seen.has(t)) { seen.add(t); out.push(t); } } }
  for (const o of document.querySelectorAll('select option')) { const t = o.textContent.trim(); if (t && !seen.has(t) && vis(o.parentElement)) { seen.add(t); out.push(t); } }
  return out; })()'''

def main():
    found = {}
    def scan(pg, where):
        for t in pg.evaluate(JS_COLLECT):
            bad = leftovers(t)
            if bad: found.setdefault(t[:140], set()).add(where)
    with sync_playwright() as pw:
        E.reset({'locales/xx.json': json.dumps(pseudo, ensure_ascii=False), 'system.json': json.dumps({'lang': 'xx'})}) if False else None
        E.reset(); os.makedirs(os.path.join(E.CFG, 'locales'), exist_ok=True)
        json.dump(pseudo, open(os.path.join(E.CFG, 'locales', 'xx.json'), 'w', encoding='utf8'), ensure_ascii=False)
        p, br, pg = E.session(pw)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.evaluate("setAppLanguage('xx',{reopen:true})"); pg.wait_for_timeout(1500)
        scan(pg, 'welcome')
        pg.wait_for_selector('#wn', timeout=10000); pg.fill('#wn', 'Lee'); pg.click('#wd'); pg.wait_for_timeout(1300)
        for i in range(12):
            if not pg.query_selector('.tour-root'): break
            scan(pg, f'tour {i}'); pg.evaluate("tourStep(1)"); pg.wait_for_timeout(250)
        pg.evaluate("tourEnd(true)"); pg.evaluate("replaceData(demoData('Lee'))"); pg.wait_for_timeout(1500)
        pg.evaluate("tourEnd(true);if(document.querySelector('#modal.on'))closeModal()")
        pg.set_viewport_size({'width': 1280, 'height': 900})
        pages = ['dashboard', 'transactions', 'accounts', 'budgets', 'goals', 'reminders', 'bills', 'calendar', 'insights', 'report', 'plan']
        for pgname in pages:
            pg.evaluate(f"go('{pgname}')"); pg.wait_for_timeout(600); scan(pg, pgname)
        pg.evaluate("go('report');document.querySelectorAll('details').forEach(d=>d.open=true)"); pg.wait_for_timeout(300); scan(pg, 'report (method open)')
        pg.evaluate("go('transactions');document.getElementById('fadv').hidden=false"); pg.wait_for_timeout(300); scan(pg, 'transactions filters')
        for c in ['you', 'look', 'region', 'notify', 'security', 'windows', 'data', 'cats', 'about']:
            pg.evaluate(f"SET_CAT='{c}';go('settings')"); pg.wait_for_timeout(400); scan(pg, f'settings/{c}')
        sheets = {
            'new transaction': "openTx()", 'edit transaction': "openTx(S.transactions[0])", 'new account': "openAcc()", 'edit debt account': "openAcc(S.accounts.find(a=>a.type==='credit'))",
            'new goal': "openGoal()", 'goal funds': "openFunds(S.goals[0])", 'new recurring': "openBill()", 'new category': "openCat()", 'edit budget': "editBudget(S.categories[0])",
            'new reminder': "openReminder()", 'reminder action': "openRemAction(S.reminders[0])", 'auto budgets': "S.categories.forEach(c=>c.budget=0);autoBudget()", 'export': "openExportSheet()",
            'pro': "openUpgrade()", 'help': "openDoc('help')", 'shortcuts': "openDoc('shortcuts')", 'privacy': "openDoc('privacy')", 'license': "openDoc('eula')", 'oss': "openDoc('oss')",
            'calendar day': f"openDay(today())", 'what changed': "go('insights');openWhatChanged(insRange())", 'updates': "openUpdateSheet()", 'passcode setup': "openPinSetup()",
        }
        for name, js in sheets.items():
            try:
                pg.evaluate(f"try{{{js}}}catch(e){{console.error(e)}}"); pg.wait_for_timeout(500); scan(pg, name)
            except Exception as e: found.setdefault(f'(could not open {name}: {e})'[:140], set()).add(name)
            pg.evaluate("if(document.querySelector('#modal.on'))closeModal()"); pg.wait_for_timeout(250)
        for i in range(8):
            pg.evaluate(f"if(!document.querySelector('.guide'))openGuide({i});else document.getElementById('gdn').click()"); pg.wait_for_timeout(350); scan(pg, f'guide {i}')
        pg.evaluate("if(document.querySelector('#modal.on'))closeModal()")
        pg.evaluate("openCmd('how much did I spend last month')"); pg.wait_for_timeout(500); scan(pg, 'ask penny')
        pg.evaluate("closeCmd()")
        for sel, name in [("#txbody .li", 'menu: transaction'), ("#view", 'menu: page')]:
            pg.evaluate("go('transactions')"); pg.wait_for_timeout(400)
            pg.evaluate(f"document.querySelector('{sel}').dispatchEvent(new MouseEvent('contextmenu',{{bubbles:true,clientX:600,clientY:300}}))"); pg.wait_for_timeout(300); scan(pg, name)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.evaluate("lockApp && lockApp()"); pg.wait_for_timeout(600); scan(pg, 'lock screen')
        E.kill(p)
    if errs: print('PAGE ERRORS:', errs[:5])
    for t, w in sorted(found.items()):
        print(f'UNTRANSLATED  {t!r}   @ {", ".join(sorted(w))[:80]}')
    print(f'{len(found)} untranslated text item(s)')
    sys.exit(1 if found or errs else 0)

if __name__ == '__main__':
    main()
