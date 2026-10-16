#!/usr/bin/env python3
"""E2E for 1.9: interactive tour, translated/global report, update UI states, encryption status row."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright
check = E.check

def main():
    with sync_playwright() as pw:
        E.reset(); p, br, pg = E.session(pw)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.wait_for_selector('#wn', timeout=10000); pg.fill('#wn', 'Lee'); pg.click('#wd')
        # ---- tour ----
        pg.wait_for_selector('.tour-root.on #tr_next', timeout=10000)
        check('T1 tour starts after setup with a personal welcome', 'Lee' in pg.inner_text('.tour-pop'))
        pg.click('#tr_next'); pg.wait_for_timeout(600)
        spot = pg.evaluate("(()=>{const s=document.querySelector('.tour-spot').getBoundingClientRect(),n=document.querySelector('#side .nav[data-nav=dashboard]').getBoundingClientRect();return Math.abs(s.left-(n.left-6))<2&&Math.abs(s.top-(n.top-6))<2})()")
        check('T2 spotlight sits on the real control', spot)
        pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(500)
        check('T3 arrow key moves on, step shows the shortcut', 'N' in pg.inner_text('.tour-kbd'))
        pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(400)
        check('T4 back works', pg.evaluate("_tour.i") == 1)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
        check('T5 Esc closes and remembers it', pg.evaluate("!document.querySelector('.tour-root')&&S.settings.tourDone===true"))
        pg.evaluate("startTour(TOUR.length-1)"); pg.wait_for_timeout(500)
        check('T6 last step offers quick actions', pg.evaluate("document.querySelectorAll('.tour-quick [data-q]').length") == 3)
        pg.click('[data-q=add]'); pg.wait_for_timeout(900)
        check('T7 quick action opens the add sheet', pg.evaluate("!!document.querySelector('#modal.on')"))
        pg.evaluate("closeModal()")
        check('T8 tour is in the command palette', pg.evaluate("(openCmd(),document.querySelector('#cmd').innerText.includes('Take the tour'))"))
        pg.evaluate("closeCmd()")
        # ---- report, global + translated ----
        pg.evaluate("go('report')"); pg.wait_for_timeout(600)
        t = pg.evaluate("document.getElementById('view').innerText")
        check('R1 report has the glossary and PDF button', 'words used in this report' in t.lower() and pg.evaluate("!!document.getElementById('rp_pdf')"))
        check('R2 international sources are cited', 'Global Findex' in t and 'OECD' in t)
        pg.evaluate("S.settings.currency='EUR';S.settings.locale='de-DE';setupFmt();go('report')"); pg.wait_for_timeout(500)
        t = pg.evaluate("document.getElementById('view').innerText")
        check('R3 dollar-only threshold hidden for other currencies, DTI rule marked as country-dependent', 'Vanguard $2,000' not in t and 'depends on your country' in t)
        pg.evaluate("setAppLanguage('es')"); pg.wait_for_timeout(1500); pg.evaluate("go('report')"); pg.wait_for_timeout(600)
        t = pg.evaluate("document.getElementById('view').innerText")
        check('R4 report is translated (Spanish)', 'Informe de salud financiera' in t and 'prioridades' in t.lower() and 'priorities' not in t.lower(), t[:160])
        pg.evaluate("setAppLanguage('ar')"); pg.wait_for_timeout(1500); pg.evaluate("go('report')"); pg.wait_for_timeout(600)
        check('R5 report is translated (Arabic, right-to-left)', 'تقرير الصحة المالية' in pg.evaluate("document.getElementById('view').innerText") and pg.evaluate("document.documentElement.dir") == 'rtl')
        pg.evaluate("setAppLanguage('en')"); pg.wait_for_timeout(1500)
        pdf = E.mev("(async()=>{const w=__PENNY_ELECTRON.BrowserWindow.getAllWindows()[0];return (await w.webContents.printToPDF({printBackground:true})).length})()")
        check('R6 the window renders to PDF', isinstance(pdf, int) and pdf > 10000, str(pdf))
        # ---- updates ----
        st = pg.evaluate("native.updGet()")
        check('U1 update source is the GitHub repo', st.get('source') == 'github' and st.get('repo') == 'abdallhhelles/penny', str(st)[:200])
        pg.evaluate("onUpdate({...UPD,status:'downloading',available:'9.9.9',progress:.5})"); pg.wait_for_timeout(300)
        check('U2 top bar shows download progress', '50%' in pg.inner_text('#updbtn'))
        pg.evaluate("onUpdate({...UPD,status:'ready',available:'9.9.9',progress:1,notes:'- one\\n- two'})"); pg.wait_for_timeout(300)
        pg.click('#updbtn'); pg.wait_for_timeout(500)
        check('U3 update sheet: ready state with notes and restart button', pg.evaluate("!!document.getElementById('us_go')") and pg.evaluate("document.querySelectorAll('.upd-notes li').length") == 2)
        pg.evaluate("onUpdate({...UPD,status:'offline'})"); pg.wait_for_timeout(300)
        check('U4 sheet updates live (offline state)', 'offline' in pg.inner_text('.upd-sheet').lower())
        pg.evaluate("closeModal()")
        pg.evaluate("SET_CAT='about';go('settings')"); pg.wait_for_timeout(500)
        check('U5 Settings shows the update card with source', 'abdallhhelles/penny' in pg.inner_text('.upd-card'))
        pg.evaluate("SET_CAT='security';go('settings')"); pg.wait_for_timeout(500)
        check('S1 Security shows the encryption row', 'Encryption' in pg.evaluate("document.getElementById('view').innerText"))
        check('Z no page errors', not errs, str(errs[:3]))
        E.kill(p)
    ok = all(r for _, r in E.RESULTS)
    print(f"{sum(1 for _, r in E.RESULTS if r)}/{len(E.RESULTS)} checks passed")
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
