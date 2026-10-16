#!/usr/bin/env python3
"""E2E: keyboard + accessibility + empty states in the real app."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright
check = E.check

def main():
    with sync_playwright() as pw:
        E.reset(); p, br, pg = E.session(pw)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        E.finish_onboarding(pg)
        # ---- empty states: a brand-new (nearly empty) file renders every page, lists say what to do next
        empty_pages = {'transactions': '.empty', 'goals': '.empty', 'bills': '.empty', 'reminders': '.empty'}
        pg.evaluate("S.transactions.length=0;S.goals.length=0;S.bills.length=0;S.reminders.length=0;save()")
        for page in ['dashboard', 'transactions', 'accounts', 'budgets', 'goals', 'reminders', 'bills', 'calendar', 'insights', 'plan', 'settings']:
            pg.evaluate(f"go('{page}')"); pg.wait_for_timeout(300)
            if page in empty_pages:
                check(f'A1 empty state on {page}', pg.evaluate(f"!!document.querySelector('#view {empty_pages[page]}')"))
        check('A2 empty file renders every page without errors', not errs, errs[:2])
        # ---- demo data for the rest
        pg.evaluate("replaceData(demoData('T'))"); pg.wait_for_timeout(700); pg.evaluate("document.querySelector('#modal.on')&&closeModal()")
        pg.evaluate("go('accounts')"); pg.wait_for_timeout(500)
        check('A3 account cards are keyboard buttons', pg.evaluate("[...document.querySelectorAll('.wcard[data-acc]')].every(e=>e.getAttribute('role')==='button'&&e.tabIndex===0)") and pg.evaluate("document.querySelectorAll('.wcard[data-acc]').length")>0)
        pg.focus('.wcard[data-acc]'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
        check('A4 Enter on a card opens the sheet, as a labelled dialog', pg.evaluate("(m=>m.classList.contains('on')&&m.getAttribute('role')==='dialog'&&m.getAttribute('aria-modal')==='true'&&!!m.getAttribute('aria-label'))(document.getElementById('modal'))"))
        inside = True
        for _ in range(40):
            pg.keyboard.press('Tab'); inside = inside and pg.evaluate("document.getElementById('modal').contains(document.activeElement)")
        check('A5 Tab stays inside the open dialog', inside)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('A6 Escape closes it and focus returns to the card', pg.evaluate("!document.querySelector('#modal.on')") and pg.evaluate("document.activeElement&&document.activeElement.hasAttribute('data-acc')"))
        pg.evaluate("go('budgets')"); pg.wait_for_timeout(400)
        check('A7 budget cards are keyboard buttons', pg.evaluate("[...document.querySelectorAll('.acardbud')].every(e=>e.tabIndex===0)"))
        pg.evaluate("go('transactions')"); pg.wait_for_timeout(400)
        check('A8 search box has an accessible name', pg.evaluate("!!document.getElementById('fq').getAttribute('aria-label')"))
        pg.evaluate("toast('hello')")
        check('A9 toasts live in a polite status region', pg.evaluate("document.getElementById('toasts').getAttribute('aria-live')")=='polite')
        # focus ring is visible on keyboard focus
        pg.evaluate("go('dashboard')"); pg.wait_for_timeout(300); pg.keyboard.press('Tab'); pg.wait_for_timeout(100)
        ring = pg.evaluate("(e=>{if(!e)return '';const s=getComputedStyle(e);return s.outlineStyle+' '+s.outlineWidth+' '+s.boxShadow})(document.activeElement)")
        check('A10 keyboard focus shows a ring', ('solid' in ring) or ('rgba' in ring), ring)
        # shortcuts still work
        pg.evaluate("document.activeElement&&document.activeElement.blur()"); pg.keyboard.press('n'); pg.wait_for_timeout(400)
        check('A11 N opens New Transaction', pg.evaluate("!!document.querySelector('#modal.on #amt')"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        pg.keyboard.press('Control+k'); pg.wait_for_timeout(300)
        check('A12 Ctrl+K opens search', pg.evaluate("document.getElementById('cmd').classList.contains('on')"))
        pg.keyboard.press('Escape')
        check('A13 no page errors', not errs, errs[:3])
        br.close(); E.kill(p)
    bad = [n for n, ok in E.RESULTS if not ok]
    print(f'\n{len(E.RESULTS) - len(bad)}/{len(E.RESULTS)} checks passed')
    if bad: print('FAILED:', bad); sys.exit(1)
if __name__ == '__main__': main()
