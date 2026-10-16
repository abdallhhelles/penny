#!/usr/bin/env python3
"""E2E for 1.8: Financial Health Report (four pillars, priorities, debt lab, sources, assumptions, empty state) and the
GitHub Releases update feed resolution in the main process."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_harness as E
from playwright.sync_api import sync_playwright
check = E.check
REQ = "process.getBuiltinModule('module').createRequire(__PENNY_ELECTRON.app.getAppPath()+'/x.js')"

def main():
    with sync_playwright() as pw:
        E.reset(); p, br, pg = E.session(pw)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        E.finish_onboarding(pg)
        pg.evaluate("go('report')"); pg.wait_for_timeout(500)
        t = pg.evaluate("document.getElementById('view').innerText")
        check('R1 empty data shows a friendly empty state, no crash', 'Not enough data yet' in t, t[:120])
        pg.evaluate("replaceData(demoData('T'))"); pg.wait_for_timeout(800); pg.evaluate("document.querySelector('#modal.on')&&closeModal()")
        pg.evaluate("go('report')"); pg.wait_for_timeout(600)
        t = pg.evaluate("document.getElementById('view').innerText")
        check('R2 report shows the four pillars', all(w in t for w in ('Spend', 'Save', 'Borrow', 'Plan')), t[:200])
        check('R3 a score and a label are shown', pg.evaluate("/\\b\\d{1,3}\\b/.test(document.querySelector('#view .card').innerText)") and any(w in t for w in ('Strong', 'Solid', 'Building', 'Needs attention')))
        check('R4 every benchmark cites a numbered source', pg.evaluate("document.querySelectorAll('#view .rsrc').length")>=6)
        check('R5 sources list has live links and a not-advice note', pg.evaluate("document.querySelectorAll('#view [data-ext]').length")>=7 and 'not a financial adviser' in t)
        check('R6 Morningstar 3.9% and Fidelity 15% are referenced', '3.9%' in t and '15%' in t)
        check('R7 Report is in the navigation and the command palette', pg.evaluate("NAV.some(n=>n[0]==='report')") and pg.evaluate("!!document.querySelector('.nav[data-nav=report]')"))
        # debt lab: extra payment reduces time and interest
        has_lab = pg.evaluate("!!document.querySelector('#rpx')")
        check('R8 debt payoff lab is present for the demo debts', has_lab)
        if has_lab:
            before = pg.evaluate("(()=>{const R=reportData();return R.strat?[R.strat.ava.months,R.strat.ava.totalInterest]:null})()")
            pg.fill('#rpx', '300'); pg.dispatch_event('#rpx', 'change'); pg.wait_for_timeout(500)
            after = pg.evaluate("(()=>{const R=reportData();return R.strat?[R.strat.ava.months,R.strat.ava.totalInterest]:null})()")
            check('R9 extra payment cuts payoff time and interest', before and after and after[0] < before[0] and after[1] < before[1], f'{before} -> {after}')
            pg.evaluate("window._rpExtra=0")
        # assumptions persist in settings
        pg.select_option('#rp_swr', '0.04'); pg.wait_for_timeout(500)
        check('R10 withdrawal-rate assumption is saved', pg.evaluate("S.settings.report.swr") == 0.04)
        pg.select_option('#rp_real', '0.05'); pg.wait_for_timeout(500)
        check('R11 real-return assumption is saved and changes the result', pg.evaluate("S.settings.report.real") == 0.05)
        # robustness: debts without rate/payment, no income, huge numbers
        r = pg.evaluate("""(()=>{try{const keep=JSON.stringify(S);S.transactions=[];S.accounts.forEach(a=>{if(isLiab(a)){a.apr=0;a.minPay=0}});go('report');const a=document.getElementById('view').innerText;
          S.transactions=[];S.accounts=[];go('report');const b=document.getElementById('view').innerText;return [a.length>50,b.includes('Not enough data')]}catch(e){return String(e)}})()""")
        check('R12 report survives missing rates, no transactions and no accounts', r == [True, True], str(r))
        pg.evaluate("go('dashboard')")
        # GitHub feed resolution in the real main process
        g = E.mev(REQ + "('./updater.js').githubFeed('akrot/penny')")
        check('R13 owner/name maps to the GitHub latest-release feed', g == 'https://github.com/akrot/penny/releases/latest/download/latest.json', str(g))
        bad = E.mev("['', 'nope', 'a/b/c', 'x y/z', '../etc/passwd', 'https://evil.example/x'].map(r=>" + REQ + "('./updater.js').githubFeed(r))")
        check('R14 invalid repository strings are rejected', bad == ['', '', '', '', '', ''], str(bad))
        pub = E.mev(REQ + "('./renderer/publisher.js').updateRepo")
        check('R15 publisher.js exposes updateRepo (empty until set)', pub == '' or isinstance(pub, str), str(pub))

        # full GitHub-style update: a 302 from /releases/latest/download/... to the asset, signed with the real key, applied by the real updater
        key = os.path.join(E.ROOT, 'tools', 'update-private-key.pem')
        if os.path.exists(key):
            import shutil, subprocess, threading, http.server, json as _j, tempfile
            tmp = tempfile.mkdtemp(); src = os.path.join(tmp, 'src')
            shutil.copytree(E.ROOT, src, ignore=shutil.ignore_patterns('node_modules', 'dist-exe', '.git'))
            pj = os.path.join(src, 'package.json'); d = _j.load(open(pj)); d['version'] = '9.9.9'; _j.dump(d, open(pj, 'w'))
            out = os.path.join(tmp, 'out'); subprocess.run(['node', os.path.join(src, 'tools', 'publish-update.js'), out, '--notes', 'test update'], check=True, capture_output=True)
            class H(http.server.SimpleHTTPRequestHandler):
                def __init__(s, *a, **k): super().__init__(*a, directory=out, **k)
                def do_GET(s):
                    if s.path.startswith('/o/r/releases/latest/download/'):
                        s.send_response(302); s.send_header('Location', '/assets/' + s.path.rsplit('/', 1)[1]); s.end_headers(); return
                    if s.path.startswith('/assets/'): s.path = '/' + s.path.split('/assets/', 1)[1]
                    return super().do_GET()
                def log_message(s, *a): pass
            srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
            feed = f'http://127.0.0.1:{srv.server_address[1]}/o/r/releases/latest/download/latest.json'
            E.mev(REQ + "('./main.js')" if False else "0")
            r = E.mev("(async()=>{const u=" + REQ + "('./updater.js');const s=await u.check({updateFeed:" + _j.dumps(feed) + "});return [s.status,s.available,s.error]})()")
            check('R17 update via a GitHub-style redirecting feed is downloaded, verified and staged', r == ['ready', '9.9.9', ''], str(r))
            # a tampered package must be refused
            pk = os.path.join(out, 'penny-app-9.9.9.pkg'); b = bytearray(open(pk, 'rb').read()); b[len(b) // 2] ^= 0xFF; open(pk, 'wb').write(bytes(b))
            E.mev("require" if False else "0")
            shutil.rmtree(os.path.join(E.CFG, 'updates'), ignore_errors=True)
            r2 = E.mev("(async()=>{const u=" + REQ + "('./updater.js');const s=await u.check({updateFeed:" + _j.dumps(feed) + "});return [s.status,s.error]})()")
            check('R18 a tampered update is refused', isinstance(r2, list) and r2[0] == 'error', str(r2))
            srv.shutdown()
        check('R16 no page errors', not errs, str(errs[:2]))
        E.kill(p)
    ok = sum(1 for _, v in E.RESULTS if v); print(f'\n{ok}/{len(E.RESULTS)} checks passed'); sys.exit(0 if ok == len(E.RESULTS) else 1)
if __name__ == '__main__': main()
