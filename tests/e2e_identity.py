#!/usr/bin/env python3
"""E2E: Akrot identity + official pages in the real app: About shows publisher and version, every document sheet opens,
no placeholder text, keyboard reachability, tray menu/appId in main process, data folder name."""
import os, sys, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright
check = E.check
ROOT = E.ROOT

def main():
    with sync_playwright() as pw:
        E.reset(); p, br, pg = E.session(pw)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        E.finish_onboarding(pg)
        pkg = json.load(open(os.path.join(ROOT, 'package.json')))
        pg.evaluate("SET_CAT='about';go('settings')"); pg.wait_for_timeout(600)
        txt = pg.evaluate("document.getElementById('view').innerText")
        check('I1 About shows the package version and publisher Akrot', pkg['version'] in txt and 'Akrot' in txt and 'by Akrot' in txt, txt[:200])
        check('I2 package.json author/appId/version are Akrot / current version', pkg['author'] == 'Akrot' and pkg['build']['appId'] == 'com.akrot.penny' and pkg['version'].startswith('1.'))
        check('I3 BRAND version in the renderer matches package.json', pg.evaluate("BRAND.version") == pkg['version'])
        for kind, needle in (('help', 'Getting started'), ('shortcuts', 'Ctrl K'), ('eula', 'END-USER LICENSE AGREEMENT'), ('privacy', 'PRIVACY NOTICE'), ('oss', 'Electron')):
            pg.evaluate(f"openDoc('{kind}')"); pg.wait_for_timeout(300)
            body = pg.evaluate("document.querySelector('#modal.on')?document.querySelector('#modal').innerText:''")
            check(f'I4 {kind} sheet opens', needle.lower() in body.lower(), body[:80])
            if kind in ('eula', 'privacy'):
                check(f'I5 {kind} names Akrot, has no template/placeholder wording', 'Akrot' in body and not re.search(r'NOTE TO (THE )?PUBLISHER|TEMPLATE|\[\[|TODO|lorem', body, re.I))
            pg.evaluate("closeModal()"); pg.wait_for_timeout(150)
        check('I6 privacy notice states controller, retention and deletion', all(w in pg.evaluate("LEGAL.privacy(PUBLISHER)") for w in ('Who is responsible', 'How long we keep it', 'Deleting your data')))
        # keyboard: Tab reaches the About buttons; Enter opens
        pg.evaluate("SET_CAT='about';go('settings')"); pg.wait_for_timeout(500)
        pg.focus('[data-doc=help]'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        check('I7 keyboard Enter opens Help from the focused button', pg.evaluate("!!document.querySelector('#modal.on')"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('I8 Escape closes the sheet', pg.evaluate("!document.querySelector('#modal.on')"))
        # main process facts
        aid = E.mev("E.app.getName()+'|'+E.app.getPath('userData').split('/').pop()")
        check('I9 data folder name is still Penny', isinstance(aid, str) and aid.endswith('|Penny'), aid)
        ico = os.path.getsize(os.path.join(ROOT, 'assets', 'icon.ico'))
        check('I10 icon assets exist (ico, png, tray light/dark @1x/@2x)', ico > 5000 and all(os.path.exists(os.path.join(ROOT, 'assets', f)) for f in ('icon.png', 'tray-light.png', 'tray-dark.png', 'tray-light@2x.png', 'tray-dark@2x.png')))
        check('I11 no page errors', not errs, errs[:3])
        br.close(); E.kill(p)
    bad = [n for n, ok in E.RESULTS if not ok]
    print(f'\n{len(E.RESULTS) - len(bad)}/{len(E.RESULTS)} checks passed')
    if bad: print('FAILED:', bad); sys.exit(1)
if __name__ == '__main__': main()
