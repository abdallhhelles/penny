#!/usr/bin/env python3
"""E2E for 1.10 navigation: grouped sidebar + badges, jump bar, back to top, list keyboard, filter chips,
right-click menu, Discord community card, and attachments on transactions."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright
check = E.check
PNG = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a80000000049454e44ae426082'

def main():
    with sync_playwright() as pw:
        E.reset(); p, br, pg = E.session(pw)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.wait_for_selector('#wn', timeout=10000); pg.fill('#wn', 'Lee'); pg.click('#wd'); pg.wait_for_timeout(1500)
        pg.evaluate("tourEnd(true)"); pg.evaluate("replaceData(demoData('Lee'))"); pg.wait_for_timeout(1500)
        pg.evaluate("tourEnd(true);if(document.querySelector('#modal.on'))closeModal();S.settings.theme='light';applySettings();go('dashboard')")
        pg.set_viewport_size({'width': 1280, 'height': 820}); pg.wait_for_timeout(800)
        # ---- sidebar ----
        check('N1 sidebar is grouped, Settings pinned at the bottom', pg.evaluate("[...document.querySelectorAll('#side .nav-label')].length===2&&!!document.querySelector('#side .nav-bottom [data-nav=settings]')"))
        check('N2 Alt shortcuts still follow the old order', pg.evaluate("(()=>{go('dashboard');document.dispatchEvent(new KeyboardEvent('keydown',{key:'4',altKey:true}));return cur==='budgets'})()"))
        pg.evaluate("go('dashboard')"); pg.wait_for_timeout(500)
        b = pg.evaluate("(()=>{const b=document.querySelector('[data-nav=reminders] .badge');return [b.style.display,b.textContent,b.getAttribute('aria-label')]})()")
        check('N3 reminders badge shows a count with a spoken label', b[0] == '' and b[1].isdigit() and 'due' in (b[2] or ''), str(b))
        # ---- jump bar + top ----
        pg.evaluate("document.getElementById('view').scrollTop=1400"); pg.wait_for_timeout(500)
        n = pg.evaluate("document.querySelectorAll('#jump [data-j]').length")
        check('N4 long pages get an "On this page" bar once you scroll', n >= 3 and pg.evaluate("document.getElementById('jump').classList.contains('on')"), str(n))
        pg.evaluate("document.querySelectorAll('#jump [data-j]')[%d].click()" % (n - 2)); pg.wait_for_timeout(900)
        check('N5 a chip jumps to its section and is marked current', pg.evaluate(f"document.querySelectorAll('#jump [data-j]')[{n-2}].classList.contains('on')||document.querySelectorAll('#jump [data-j]')[{n-1}].classList.contains('on')"))
        check('N6 back-to-top appears far down the page', pg.evaluate("document.getElementById('totop').classList.contains('on')"))
        pg.click('#totop'); pg.wait_for_timeout(900)
        check('N7 back-to-top returns to the top', pg.evaluate("document.getElementById('view').scrollTop") < 5)
        # ---- transactions ----
        pg.evaluate("go('transactions')"); pg.wait_for_timeout(500)
        check('N8 filter bar stays visible while scrolling', pg.evaluate("getComputedStyle(document.querySelector('.txbar')).position")=='sticky')
        pg.keyboard.press('/'); pg.wait_for_timeout(200)
        check('N9 "/" jumps to the search box', pg.evaluate("document.activeElement.id")=='fq')
        pg.keyboard.type('trader'); pg.wait_for_timeout(600)
        check('N10 active filters show as chips', 'trader' in pg.inner_text('#fchips'))
        pg.click('#fchips [data-fx=q]'); pg.wait_for_timeout(500)
        check('N11 removing a chip clears that filter', pg.evaluate("F.q===''&&document.getElementById('fchips').hidden"))
        pg.evaluate("document.querySelector('#txbody .li').focus()"); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(150)
        check('N12 arrow keys move between rows', pg.evaluate("document.activeElement===document.querySelectorAll('#txbody .li')[1]"))
        pg.keyboard.press('End'); pg.wait_for_timeout(150)
        check('N13 End goes to the last row', pg.evaluate("(()=>{const r=[...document.querySelectorAll('#txbody .li')];return document.activeElement===r[r.length-1]})()"))
        # ---- right-click menu ----
        pg.evaluate("document.getElementById('view').scrollTop=0"); pg.wait_for_timeout(300)
        pg.locator('#txbody .li').first.click(button='right', position={'x': 200, 'y': 20}); pg.wait_for_timeout(300)
        t = pg.inner_text('.ctx-menu')
        check('C1 right-click a transaction offers edit, duplicate, attach and delete', all(k in t for k in ['Open and edit', 'Duplicate', 'Attach', 'Delete']), t)
        cnt = pg.evaluate("S.transactions.length")
        pg.click('.ctx-menu .ctx-i.danger'); pg.wait_for_timeout(500)
        check('C2 delete from the menu works and offers Undo', pg.evaluate("S.transactions.length") == cnt - 1 and 'Undo' in pg.inner_text('#toasts'))
        pg.click('#toasts .ta'); pg.wait_for_timeout(400)
        check('C3 undo brings it back', pg.evaluate("S.transactions.length") == cnt)
        pg.locator('#fq').click(button='right'); pg.wait_for_timeout(300)
        t = pg.inner_text('.ctx-menu')
        check('C4 text fields get cut / copy / paste / select all', all(k in t for k in ['Cut', 'Copy', 'Paste', 'Select all']), t)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        check('C5 Esc closes the menu', not pg.query_selector('.ctx-menu.on'))
        pg.evaluate("go('budgets')"); pg.wait_for_timeout(400)
        light = None
        pg.mouse.click(700, 760, button='right'); pg.wait_for_timeout(300)
        light = pg.evaluate("getComputedStyle(document.querySelector('.ctx-menu')).backgroundColor"); pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        pg.evaluate("S.settings.theme='dark';applySettings()"); pg.wait_for_timeout(300)
        pg.evaluate("document.getElementById('view').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:200}))"); pg.wait_for_timeout(300)
        dark = pg.evaluate("getComputedStyle(document.querySelector('.ctx-menu')).backgroundColor")
        check('C6 the menu follows the theme', light != dark and dark == 'rgb(27, 48, 44)', f'{light} {dark}')
        priv = pg.evaluate("S.settings.privacy")
        pg.keyboard.press('h'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        check('C7 keyboard: type a letter to pick, Enter runs it', pg.evaluate("S.settings.privacy") != priv)
        pg.evaluate("S.settings.privacy=false;applySettings()")
        # ---- Discord ----
        check('D1 community card in the sidebar', pg.evaluate("!!document.querySelector('#side .community [data-cm=join]')"))
        pg.evaluate("SET_CAT='about';go('settings')"); pg.wait_for_timeout(400)
        check('D2 Settings › Updates & help has Join Discord', pg.evaluate("!!document.querySelector('#view [data-cm=join]')") and pg.evaluate("PUBLISHER.discordInvite").startswith('https://discord.gg/'))
        pg.click('#side .community [data-cm=hide]'); pg.wait_for_timeout(300)
        check('D3 the card can be hidden and stays hidden', pg.evaluate("!document.querySelector('#side .community')&&S.settings.communityHide===true"))
        # ---- attachments ----
        pg.evaluate("go('transactions')"); pg.wait_for_timeout(400)
        tid = pg.evaluate("document.querySelector('#txbody .li').dataset.tx")
        pg.evaluate(f"openTx(S.transactions.find(t=>t.id==='{tid}'))"); pg.wait_for_timeout(600)
        check('A1 the transaction sheet has a receipts & files section', pg.evaluate("!!document.getElementById('attadd')"))
        pg.evaluate(f"""(()=>{{const b=new Uint8Array('{PNG}'.match(/../g).map(h=>parseInt(h,16)));const dt=new DataTransfer();dt.items.add(new File([b],'receipt.png',{{type:'image/png'}}));
          document.querySelector('#modal .sheet').dispatchEvent(new DragEvent('drop',{{bubbles:true,cancelable:true,dataTransfer:dt}}))}})()""")
        pg.wait_for_timeout(1200)
        check('A2 dropping a photo attaches it, with a thumbnail', pg.evaluate("document.querySelectorAll('#attl .att').length")==1 and pg.evaluate("!!document.querySelector('#attl .att-th img')"))
        pg.evaluate("""(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([77,90])],'setup.exe',{type:'application/octet-stream'}));
          document.querySelector('#modal .sheet').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}))})()""")
        pg.wait_for_timeout(800)
        check('A3 programs are refused with a clear message', pg.evaluate("document.querySelectorAll('#attl .att').length")==1 and "can’t be attached" in pg.inner_text('#toasts'))
        pg.click('#modal .att-open'); pg.wait_for_timeout(500)
        check('A4 an image opens in the built-in viewer', pg.evaluate("!!document.querySelector('.att-view img')"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.click('#shok'); pg.wait_for_timeout(700)
        f = pg.evaluate(f"(S.transactions.find(t=>t.id==='{tid}').files||[])")
        check('A5 saving keeps the attachment on the transaction', len(f) == 1 and f[0]['ext'] == 'png', str(f))
        check('A6 the row shows a paperclip', pg.evaluate(f"!!document.querySelector('#txbody [data-tx=\"{tid}\"] .att-mark')"))
        disk = E.disk()
        check('A7 the data file keeps only a reference, the file is stored separately', 'data' not in str([t.get('files') for t in disk.get('transactions', []) if t.get('files')]) and os.path.exists(os.path.join(E.CFG, 'attachments', f[0]['id'] + '.att')) if isinstance(disk, dict) and 'transactions' in disk else os.path.exists(os.path.join(E.CFG, 'attachments', f[0]['id'] + '.att')))
        pg.evaluate("go('report')"); pg.wait_for_timeout(800)
        t = pg.evaluate("document.getElementById('view').innerText")
        check('R1 with history the report adds cash flow, spending by category and debts', all(k.lower() in t.lower() for k in ['Cash flow by month', 'Where your money goes', 'Debts and payoff']) and pg.evaluate("!!document.querySelector('#rp_cf svg rect')"), t[:300])
        check('R2 withdrawal rate shown exactly (3.9%, not rounded to 4%)', '3.9%' in t)
        check('Z no page errors', not errs, str(errs[:3]))
        E.kill(p)
    ok = all(r for _, r in E.RESULTS)
    print(f"{sum(1 for _, r in E.RESULTS if r)}/{len(E.RESULTS)} checks passed")
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
