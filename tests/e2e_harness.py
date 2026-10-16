"""Shared helpers for the Electron end-to-end suites (real Electron app, driven over CDP).
Each run uses a throw-away profile (XDG_CONFIG_HOME) so it never touches real data."""
import json, os, shutil, signal, subprocess, time, urllib.request
ROOT = os.environ.get('PENNY_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XDG = os.environ.get('PENNY_E2E_HOME', '/tmp/penny-e2e')
CFG = os.path.join(XDG, 'Penny')
PORT, INSPECT = 9229, 9230
RESULTS = []

def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'   {detail}'))
    return ok

def kill(p, sig=9):
    try:
        if p and p.poll() is None: p.send_signal(sig); p.wait(timeout=10)
    except Exception: pass
    subprocess.run(['pkill', '-9', '-x', 'electron'], capture_output=True); time.sleep(.4)

def reset(files=None):
    subprocess.run(['pkill', '-9', '-x', 'electron'], capture_output=True); time.sleep(.4)
    shutil.rmtree(XDG, ignore_errors=True); os.makedirs(CFG, exist_ok=True)
    for n, v in (files or {}).items():
        open(os.path.join(CFG, n), 'w', encoding='utf8').write(v if isinstance(v, str) else json.dumps(v))

def session(pw, args=()):
    env = dict(os.environ, PENNY_E2E='1', XDG_CONFIG_HOME=XDG, DISPLAY=os.environ.get('DISPLAY', ':99'))
    exe = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'node_modules', 'electron', 'dist', 'electron')
    p = subprocess.Popen([exe, ROOT, '--no-sandbox', f'--remote-debugging-port={PORT}', f'--inspect={INSPECT}', *args], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(80):
        try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1); break
        except Exception: time.sleep(.25)
    br = pw.chromium.connect_over_cdp(f'http://127.0.0.1:{PORT}')
    ctx = br.contexts[0]; pg = None
    for _ in range(60):
        if ctx.pages: pg = ctx.pages[0]; break
        time.sleep(.25)
    pg.wait_for_function('()=>typeof S!=="undefined"||!!document.querySelector("#modal.on")', timeout=20000)
    pg.wait_for_timeout(500)
    return p, br, pg

def finish_onboarding(pg):
    pg.wait_for_selector('#wf', timeout=10000); pg.click('#wf'); pg.wait_for_function('()=>typeof S!=="undefined"&&!!S&&!!S.accounts', timeout=10000)
    for _ in range(3):   # the welcome tour opens ~0.5 s after setup; close it whenever it shows
        pg.wait_for_timeout(800)
        pg.evaluate('()=>{if(document.querySelector("#modal.on"))closeModal()}')

def mev(expr):
    r = subprocess.run(['node', os.path.join(ROOT, 'tests', 'main_eval.js'), str(INSPECT), expr], capture_output=True, text=True, timeout=20)
    try: return json.loads(r.stdout)
    except Exception: return {'error': r.stdout + r.stderr}

def disk():
    return json.load(open(os.path.join(CFG, 'penny-data.json'), encoding='utf8'))

def log_text():
    try: return open(os.path.join(CFG, 'logs', 'penny.log'), encoding='utf8').read()
    except Exception: return ''
