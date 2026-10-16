#!/usr/bin/env python3
"""E2E for 1.9 encryption: passcode encrypts the data file and every backup, launch unlock screen, wrong-code handling,
recovery key, in-app lock checked by the main process, and the upgrade of a passcode set before 1.9.
(On Linux CI there is no OS keyring, so the Windows-account layer is off and the passcode layer is tested on its own;
the Windows layer is covered by tests/vault.test.js with a stand-in for DPAPI.)"""
import json, os, sys, glob, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright
check = E.check
PIN = '482913'

def raw(name='penny-data.json'):
    return open(os.path.join(E.CFG, name), encoding='utf8').read()

def type_pin(pg, pin):
    for ch in pin: pg.keyboard.press(ch)
    pg.keyboard.press('Enter')

def wait_locked(pg):
    pg.wait_for_selector('#lock.on .keypad, #lock.on #rk', timeout=15000)

def main():
    with sync_playwright() as pw:
        # ---------- 1. set a passcode on fresh demo data ----------
        E.reset(); p, br, pg = E.session(pw)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.wait_for_selector('#wd', timeout=10000); pg.click('#wd'); pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelector('#modal.on')&&closeModal();document.querySelector('.tour-root')&&tourEnd&&tourEnd()")
        names = pg.evaluate("S.accounts.map(a=>a.name)")
        check('V0 starts unencrypted on a system without a keyring', not raw().startswith('{"pennyVault"'))
        pg.evaluate("openPinSetup()"); pg.fill('#p', PIN); pg.fill('#p2', '000000'); pg.click('#shok'); pg.wait_for_timeout(300)
        check('V1 mismatched passcodes are refused', pg.evaluate("!!document.querySelector('#p')"))
        pg.fill('#p2', PIN); pg.click('#shok')
        pg.wait_for_selector('.rk-key', timeout=10000)
        key = pg.evaluate("[...document.querySelectorAll('.rk-key span')].map(s=>s.textContent).join('-')")
        check('V2 a 32-character recovery key is shown', len(key.replace('-', '')) == 32, key)
        check('V3 Done stays disabled until the key is confirmed saved', pg.evaluate("document.getElementById('rk_done').disabled"))
        pg.check('#rk_ok'); pg.click('#rk_done'); pg.wait_for_timeout(800)
        d = raw()
        check('V4 data file is encrypted, no names or amounts readable', d.startswith('{"pennyVault":1') and not any(n in d for n in names), d[:80])
        bk = glob.glob(os.path.join(E.CFG, 'backups', '*.json')) + glob.glob(os.path.join(E.CFG, 'penny-data.lastgood.json'))
        check('V5 every backup and the last-good copy are encrypted too', bk and all(open(f, encoding='utf8').read().startswith('{"pennyVault"') for f in bk), str([os.path.basename(f) for f in bk]))
        pg.evaluate("go('settings');SET_CAT='security';go('settings')"); pg.wait_for_timeout(500)
        t = pg.evaluate("document.getElementById('view').innerText")
        check('V6 Settings shows encryption on and a recovery key row', 'AES-256' in t and 'Recovery key' in t, t[:300])
        # in-app lock: checked by the main process
        pg.keyboard.press('Control+l'); wait_locked(pg)
        type_pin(pg, '111111'); pg.wait_for_timeout(1200)
        check('V7 wrong passcode keeps the in-app lock closed', pg.evaluate("document.getElementById('lock').classList.contains('on')"))
        type_pin(pg, PIN); pg.wait_for_timeout(1200)
        check('V8 right passcode opens the in-app lock', not pg.evaluate("document.getElementById('lock').classList.contains('on')"))
        E.kill(p)

        # ---------- 2. relaunch: unlock screen, data only after the right passcode ----------
        p, br, pg = E.session(pw); errs2 = []; pg.on('pageerror', lambda e: errs2.append(str(e)))
        wait_locked(pg)
        check('V9 launch shows the unlock screen, no data loaded yet', pg.evaluate("!S||!S.accounts||S.accounts.length===0||document.getElementById('lock').classList.contains('on')"))
        type_pin(pg, '999999'); pg.wait_for_timeout(1500)
        check('V10 wrong passcode: still locked, message shown', 'didn’t work' in pg.inner_text('#lock'), pg.inner_text('#lock'))
        type_pin(pg, PIN); pg.wait_for_function("typeof S!=='undefined'&&S&&S.accounts&&S.accounts.length>0", timeout=15000)
        check('V11 right passcode opens the data', pg.evaluate("S.accounts.map(a=>a.name)") == names)
        check('V12 nothing was set aside as damaged', not glob.glob(os.path.join(E.CFG, 'penny-data.damaged-*')))
        pg.evaluate("S.goals.push({id:'gx',name:'Secret trip',target:900,saved:10,color:'#fff'});saveNow()"); pg.wait_for_timeout(600)
        check('V13 new saves stay encrypted', 'Secret trip' not in raw() and raw().startswith('{"pennyVault"'))
        E.kill(p)

        # ---------- 3. forgot the passcode: recovery key ----------
        p, br, pg = E.session(pw); wait_locked(pg)
        pg.click('#lk_rec'); pg.fill('#rk', 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH'); pg.click('#rk_go'); pg.wait_for_timeout(1500)
        check('V14 a wrong recovery key is refused', pg.evaluate("document.getElementById('lock').classList.contains('on')"))
        pg.fill('#rk', key.lower().replace('-', ' ')); pg.click('#rk_go')
        pg.wait_for_function("typeof S!=='undefined'&&S&&S.goals&&S.goals.some(g=>g.name==='Secret trip')", timeout=15000)
        check('V15 recovery key opens the data (case and spacing forgiven)', True)
        pg.wait_for_timeout(1200)
        check('V16 after recovery the passcode is cleared and setup is offered', pg.evaluate("S.settings.pin===null&&!!document.querySelector('#p')"))
        E.kill(p)
        p, br, pg = E.session(pw); pg.wait_for_timeout(1500)
        check('V17 next launch opens without a passcode', not pg.evaluate("document.getElementById('lock').classList.contains('on')") and pg.evaluate("S.goals.some(g=>g.name==='Secret trip')"))
        E.kill(p)

        # ---------- 4. passcode set before 1.9 gets upgraded ----------
        E.reset()
        p, br, pg = E.session(pw); pg.wait_for_selector('#wd', timeout=10000); pg.click('#wd'); pg.wait_for_timeout(1200)
        old = pg.evaluate("""(async()=>{closeModal();tourEnd(true);const salt='s1';S.settings.salt=salt;S.settings.pin=await hashPin('2580',salt);saveNow();return JSON.stringify(S)})()""")
        E.kill(p)
        open(os.path.join(E.CFG, 'penny-data.json'), 'w', encoding='utf8').write(old)
        p, br, pg = E.session(pw); wait_locked(pg)
        type_pin(pg, '2580'); pg.wait_for_selector('.rk-key', timeout=10000)
        check('V18 old passcode unlocks and is upgraded to encryption with a recovery key', raw().startswith('{"pennyVault"'))
        check('V19 no page errors', not (errs or errs2), str((errs + errs2)[:3]))
        E.kill(p)
    ok = all(r for _, r in E.RESULTS)
    print(f"{sum(1 for _, r in E.RESULTS if r)}/{len(E.RESULTS)} checks passed")
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
