const { app, BrowserWindow, ipcMain, dialog, shell, screen, Notification, Tray, Menu, nativeImage, globalShortcut, nativeTheme, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { verifyKey } = require('./license');
const updater = require('./updater');
const { createI18n } = require('./renderer/i18n.js');

if (process.env.PENNY_E2E === '1') global.__PENNY_ELECTRON = require('electron'); // test hook only (tests/main_eval.js); inert in normal use
const PUB = require('./renderer/publisher.js');   // publisher details live in one file
const APP_ID = PUB.appId;
app.setName('Penny');
app.setAppUserModelId(APP_ID);
app.setPath('userData', path.join(app.getPath('appData'), 'Penny'));
const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'penny-data.json');
const sysFile = () => path.join(dataDir(), 'system.json');
const licFile = () => path.join(dataDir(), 'license.json');
const backupDir = () => path.join(dataDir(), 'backups');
const stateFile = () => path.join(dataDir(), 'window.json');
let logBudget = 200;
let win, tray = null, quitting = false, pendingEvents = [], rendererReady = false;
const launchedHidden = process.argv.includes('--hidden');

/* ---------- logging + data (see log.js / store.js) ---------- */
const { createLogger } = require('./log');
const { createStore, createVault, createAttachments, attExt, ATT_TYPES } = require('./store');
const log = createLogger(app.getPath('userData'));
/* Windows DPAPI through Electron safeStorage. On Linux without a keyring Electron falls back to a fixed key ("basic_text"),
   which protects nothing, so it is treated as unavailable there (data then stays plain unless a passcode is set). */
const device = {
  available() {
    if (!app.isReady()) return false;
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
      return true;
    } catch { return false; }
  },
  encrypt: b => safeStorage.encryptString(b.toString('latin1')),
  decrypt: b => Buffer.from(safeStorage.decryptString(b), 'latin1')
};
const vault = createVault({ device, log });
const store = createStore(app.getPath('userData'), log, vault);
const attach = createAttachments(app.getPath('userData'), vault, log);
/* "Open" decrypts a copy into a private temp folder (emptied at start and quit) for the system viewer */
const viewDir = () => path.join(app.getPath('temp'), 'Penny-attachments');
const clearViewDir = () => { try { fs.rmSync(viewDir(), { recursive: true, force: true }); } catch {} };
/* newest file the vault can read keys from: an encrypted file, or valid plain JSON */
const usableRaw = t => { if (vault.peek(t)) return true; try { JSON.parse(t); return true; } catch { return false; } };
function afterOpen() {
  try { vault.ensureKey(); store.rewriteAll(); attach.rewriteAll(); } catch (e) { log.error('encrypting data files failed', e); }
}
function readData() {
  const raw = store.newestRaw(usableRaw);
  const state = raw ? vault.open(raw) : 'plain';
  if (state === 'locked' || state === 'foreign') { log.info('data is encrypted; waiting for unlock', { state }); return { __locked: true, vault: { state, ...vault.describe(raw) } }; }
  const d = store.load();
  if (d && !d.__locked && !d.__damaged) afterOpen();
  return d;
}
const writeData = obj => store.save(obj);
process.on('uncaughtException', e => { log.error('uncaughtException', e); });
process.on('unhandledRejection', e => { log.error('unhandledRejection', e); });
log.info(`start v${updater.VERSION} electron ${process.versions.electron} ${process.platform} argv=${process.argv.slice(1).join(' ')}`);

/* ---------- one-time migration from the old "Lumivault" folder ---------- */
function migrateLegacy() {
  try {
    if (fs.existsSync(dataFile())) return;
    const old = path.join(app.getPath('appData'), 'Lumivault');
    const oldFile = path.join(old, 'lumivault-data.json');
    if (!fs.existsSync(oldFile)) return;
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.copyFileSync(oldFile, dataFile());
    const ob = path.join(old, 'backups');
    if (fs.existsSync(ob)) {
      fs.mkdirSync(backupDir(), { recursive: true });
      for (const n of fs.readdirSync(ob)) if (n.endsWith('.json')) fs.copyFileSync(path.join(ob, n), path.join(backupDir(), n.replace(/^lumivault-/, 'penny-')));
    }
  } catch {}
}

/* ---------- Windows integration settings (kept in the main process so they work before the UI loads) ---------- */
const SYS_DEFAULTS = { lang: 'auto', launchAtStartup: false, startMinimized: true, closeToTray: false, tray: true, hotkey: true, hotkeyAccel: 'CommandOrControl+Alt+P', alwaysOnTop: false, hideFromCapture: false, zoom: 1, autoUpdate: true, updateFeed: '', uiTheme: '' };
let sys = { ...SYS_DEFAULTS };
function loadSys() {
  try { sys = { ...SYS_DEFAULTS, ...JSON.parse(fs.readFileSync(sysFile(), 'utf8')) }; }
  catch (e) {
    sys = { ...SYS_DEFAULTS };
    if (e && e.code !== 'ENOENT') { // unreadable (not just missing): keep a copy for diagnosis instead of silently resetting
      log.warn('system.json unreadable; using defaults', e);
      try { fs.copyFileSync(sysFile(), sysFile() + '.damaged'); } catch {}
    }
  }
}
function saveSys() { // atomic: a crash mid-write can never leave a half-written settings file
  try { fs.mkdirSync(dataDir(), { recursive: true }); const t = sysFile() + '.tmp'; fs.writeFileSync(t, JSON.stringify(sys)); fs.renameSync(t, sysFile()); }
  catch (e) { log.error('could not save system settings', e); }
}
/* ---------- languages: message files live in renderer/locales (bundled) and <userData>/locales (translator drop-ins) ---------- */
const CODE_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const mainI18n = createI18n();
const mt = (k, v) => mainI18n.t(k, v);
const localeDirs = () => [{ dir: path.join(__dirname, 'renderer', 'locales'), source: 'bundled' }, { dir: path.join(dataDir(), 'locales'), source: 'user' }];
function readLocaleFile(dir, code) {
  try {
    const f = path.join(dir, code + '.json');
    if (fs.statSync(f).size > 2 * 1024 * 1024) return null;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return j && typeof j === 'object' && j.strings && typeof j.strings === 'object' && !Array.isArray(j.strings) ? j : null;
  } catch { return null; }
}
/* bundled file first, then the user's file on top (per-key overlay, so a translator can ship a partial fix) */
function readLocale(code) {
  if (typeof code !== 'string' || !CODE_RE.test(code)) return null;
  let out = null;
  for (const { dir, source } of localeDirs()) {
    const j = readLocaleFile(dir, code); if (!j) continue;
    out = out ? { meta: { ...out.meta, ...(j.meta || {}) }, strings: { ...out.strings, ...j.strings }, source } : { meta: j.meta || {}, strings: j.strings, source };
  }
  return out;
}
function listLocales() {
  const codes = new Set();
  for (const { dir } of localeDirs()) { try { for (const n of fs.readdirSync(dir)) { const m = /^(.+)\.json$/.exec(n); if (m && CODE_RE.test(m[1])) codes.add(m[1]); } } catch {} }
  const out = [];
  for (const c of codes) {
    const b = readLocale(c);
    if (!b) { log.warn('language file ignored (not a valid Penny language file)', c); continue; }
    out.push({ code: c, name: b.meta.name || c, nativeName: b.meta.nativeName || b.meta.name || c, dir: b.meta.dir === 'rtl' ? 'rtl' : 'ltr', region: b.meta.region || '', source: b.source });
  }
  return out.sort((a, b) => (a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.nativeName.localeCompare(b.nativeName)));
}
function initMainI18n() {
  try {
    const codes = listLocales().map(l => l.code);
    const code = mainI18n.resolve(sys.lang, app.getLocale(), codes);
    mainI18n.setLanguage(code);
    for (const c of mainI18n.chain.reverse()) { const real = codes.find(x => mainI18n.canon(x) === c); if (real) { const b = readLocale(real); if (b) mainI18n.register(c, b); } }
    log.info('language', { preference: sys.lang, using: code });
  } catch (e) { log.error('language init failed', e); }
}

let hotkeyOk = true;
function applySys() {
  const isWin = process.platform === 'win32';
  try { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!sys.launchAtStartup, args: ['--hidden'] }); } catch {}
  if (win) {
    try { win.setAlwaysOnTop(!!sys.alwaysOnTop); win.setContentProtection(!!sys.hideFromCapture); win.webContents.setZoomFactor(Math.min(1.5, Math.max(.8, +sys.zoom || 1))); } catch {}
  }
  // tray (forced on when "start minimized" or "close to tray" need somewhere to live)
  const wantTray = sys.tray || sys.closeToTray || (sys.launchAtStartup && sys.startMinimized);
  if (wantTray && !tray) makeTray(); else if (!wantTray && tray) { tray.destroy(); tray = null; }
  globalShortcut.unregisterAll(); hotkeyOk = true;
  if (sys.hotkey && sys.hotkeyAccel) { try { hotkeyOk = globalShortcut.register(sys.hotkeyAccel, () => quickAdd('expense')); } catch { hotkeyOk = false; } }
  if (isWin) {
    try {
      app.setUserTasks([
        { program: process.execPath, arguments: '--quick=expense', iconPath: brandIconPath() || process.execPath, iconIndex: 0, title: mt('jump.addExpense'), description: mt('jump.addExpenseDesc') },
        { program: process.execPath, arguments: '--quick=income', iconPath: brandIconPath() || process.execPath, iconIndex: 0, title: mt('jump.addIncome'), description: mt('jump.addIncomeDesc') }
      ]);
    } catch {}
  }
}
function send(name, arg) {
  if (win && rendererReady && !win.isDestroyed()) win.webContents.send('app:event', name, arg);
  else pendingEvents.push([name, arg]);
}
function showWin() {
  if (!win) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function quickAdd(kind) { showWin(); send('quick-add', kind || 'expense'); }
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: mt('tray.open'), click: showWin },
    { label: mt('tray.addExpense'), accelerator: sys.hotkey ? sys.hotkeyAccel : undefined, click: () => quickAdd('expense') },
    { label: mt('tray.addIncome'), click: () => quickAdd('income') },
    { type: 'separator' },
    { label: mt('tray.hideAmounts'), click: () => { send('privacy'); } },
    { label: mt('tray.lock'), click: () => { showWin(); send('lock'); } },
    { type: 'separator' },
    { label: mt('tray.about', { publisher: PUB.name }), click: () => { showWin(); send('navigate', { page: 'settings', scat: 'about' }); } },
    { label: mt('tray.quit'), click: () => { quitting = true; app.quit(); } }
  ]);
}
function refreshTray() { try { if (tray) tray.setContextMenu(trayMenu()); } catch (e) { log.error('tray menu failed', e); } }
function trayImage() { // monochrome glyph that matches the Windows taskbar: white on a dark taskbar, dark on a light one
  const name = nativeTheme.shouldUseDarkColors ? 'tray-dark' : 'tray-light';
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'assets', name + '.png'));
    if (!img.isEmpty()) return img;
  } catch {}
  return nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 });
}
function makeTray() {
  try {
    tray = new Tray(trayImage());
    tray.setToolTip('Penny');
    tray.setContextMenu(trayMenu());   // translated from the first moment (was English until a language change)
    tray.on('click', () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWin(); });
  } catch { tray = null; }
}
nativeTheme.on('updated', () => { try { if (tray) tray.setImage(trayImage()); } catch {} });
function dotIcon() { // small red badge for the taskbar button
  const n = 16, buf = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), i = (y * n + x) * 4;
    const a = d <= 6.5 ? 255 : d <= 7.5 ? Math.round(255 * (7.5 - d)) : 0;
    buf[i] = 0x45; buf[i + 1] = 0x3A; buf[i + 2] = 0xFF; buf[i + 3] = a; // BGRA: #FF3A45
  }
  return nativeImage.createFromBitmap(buf, { width: n, height: n });
}
function handleArgv(argv) {
  const q = (argv || []).find(a => a.startsWith('--quick='));
  if (q) quickAdd(q.split('=')[1]);
}

/* ---------- window ---------- */
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const ok = s.x == null || screen.getAllDisplays().some(d => {
      const b = d.workArea; return s.x >= b.x - 50 && s.y >= b.y - 50 && s.x < b.x + b.width - 100 && s.y < b.y + b.height - 100;
    });
    return ok ? s : { width: s.width, height: s.height };
  } catch { return {}; }
}
/* the app's own theme (Light or Dark, chosen in Settings), remembered so the window opens in the right colour */
const uiDark = () => sys.uiTheme ? sys.uiTheme === 'dark' : nativeTheme.shouldUseDarkColors;
const themeBg = () => (uiDark() ? '#10201D' : '#FBF6EF');

/* =========================================================================
   Windows icons after an update (1.10). An in-app update replaces the app files but not Penny.exe or the shortcuts,
   so on the first start of a new version Penny points everything Windows shows at the new icon:
   Start menu, desktop and pinned-taskbar shortcuts, the jump list, the taskbar button and the Apps list entry.
   The icon file gets a new name whenever it changes (penny-<hash>.ico), so Windows cannot keep a cached old image.
   Runs once per icon, only for an installed Penny (Uninstall.exe next to Penny.exe), never touches anything else.
   ========================================================================= */
let brandIco = null;   // the stable, versioned icon file in the install folder (null until synced / not installed)
function brandIconPath() {
  if (brandIco && fs.existsSync(brandIco)) return brandIco;
  try {
    const inst = path.dirname(process.execPath), f = fs.readdirSync(inst).find(n => /^penny-[a-f0-9]{10}\.ico$/.test(n));
    if (f) return (brandIco = path.join(inst, f));
  } catch {}
  return null;
}
function syncWindowsIcons(force) {
  if (process.platform !== 'win32') return;
  const inst = path.dirname(process.execPath);
  if (!fs.existsSync(path.join(inst, 'Uninstall.exe'))) return;   // dev run or portable copy: leave Windows alone
  try {
    const src = fs.readFileSync(path.join(__dirname, 'assets', 'icon.ico'));
    const hash = require('crypto').createHash('sha256').update(src).digest('hex').slice(0, 10);
    const stateF = path.join(dataDir(), 'icon-sync.json');
    let st = {}; try { st = JSON.parse(fs.readFileSync(stateF, 'utf8')); } catch {}
    const ico = path.join(inst, `penny-${hash}.ico`);
    if (!force && st.hash === hash && st.exe === process.execPath && fs.existsSync(ico)) { brandIco = ico; return; }
    // 1. the icon files: versioned copy for shortcuts, plus the installer's icon.ico (uninstaller, older references)
    if (!fs.existsSync(ico)) fs.writeFileSync(ico, src);
    try { fs.writeFileSync(path.join(inst, 'icon.ico'), src); } catch {}
    for (const n of fs.readdirSync(inst)) if (/^penny-[a-f0-9]{10}\.ico$/.test(n) && n !== path.basename(ico)) { try { fs.unlinkSync(path.join(inst, n)); } catch {} }
    brandIco = ico;
    // 2. every shortcut that starts this Penny.exe
    const ad = app.getPath('appData'), places = [
      path.join(ad, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      app.getPath('desktop'),
      path.join(ad, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
      path.join(ad, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'StartMenu'),
      path.join(ad, 'Microsoft', 'Internet Explorer', 'Quick Launch')
    ];
    const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(b).toLowerCase();
    let n = 0;
    for (const dir of places) {
      let names = []; try { names = fs.readdirSync(dir); } catch { continue; }
      for (const f of names) {
        if (!/\.lnk$/i.test(f)) continue;
        const p = path.join(dir, f);
        try {
          const l = shell.readShortcutLink(p);
          if (!same(l.target, process.execPath)) continue;
          if (shell.writeShortcutLink(p, 'update', { icon: ico, iconIndex: 0, appUserModelId: APP_ID })) n++;
        } catch {}
      }
    }
    // 3. Apps list (Settings > Apps): icon and version
    const { execFile } = require('child_process');
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Penny';
    const reg = (v, d) => new Promise(r => execFile('reg.exe', ['add', key, '/v', v, '/t', 'REG_SZ', '/d', d, '/f'], { windowsHide: true }, () => r()));
    execFile('reg.exe', ['query', key, '/v', 'InstallLocation'], { windowsHide: true }, async (err, out) => {
      if (!err && same(String(out).split(/REG_SZ/i)[1]?.trim(), inst)) { await reg('DisplayIcon', ico); await reg('DisplayVersion', updater.VERSION); }
      // 4. ask Explorer to drop its cached icons (built into Windows 10 and 11)
      try { execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ie4uinit.exe'), ['-show'], { windowsHide: true }, () => {}); } catch {}
    });
    fs.writeFileSync(stateF, JSON.stringify({ hash, exe: process.execPath, version: updater.VERSION, shortcuts: n, at: new Date().toISOString() }));
    log.info(`windows icons updated (${n} shortcut(s))`);
  } catch (e) { log.warn('windows icon sync failed', e && e.message); }
}
function createWindow() {
  const isWin = process.platform === 'win32';
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1380, height: st.height || 880, x: st.x, y: st.y, minWidth: 420, minHeight: 560,
    show: false, frame: false, backgroundColor: themeBg(),   // brand Night / Cream: no white flash before the first paint
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: uiDark() ? '#FBF6EF' : '#14211F', height: 52 },
    icon: path.join(__dirname, 'assets', isWin ? 'icon.ico' : 'icon.png'),
    title: 'Penny',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged, spellcheck: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  if (st.max) win.maximize();
  if (isWin) { try { const ic = brandIconPath(); if (ic) win.setAppDetails({ appId: APP_ID, appIconPath: ic, appIconIndex: 0, relaunchCommand: `"${process.execPath}"`, relaunchDisplayName: 'Penny' }); } catch {} }
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    const hide = launchedHidden && sys.startMinimized && sys.launchAtStartup && (tray || sys.tray);
    if (!hide) win.show();
  });
  win.webContents.on('did-finish-load', () => { try { if (global.__PENNY_BOOT_OK) global.__PENNY_BOOT_OK(); } catch {} try { win.webContents.setZoomFactor(Math.min(1.5, Math.max(.8, +sys.zoom || 1))); } catch {} });
  win.on('closed', () => { win = null; rendererReady = false; });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  let crashes = 0;
  win.webContents.on('render-process-gone', (_e, d) => {
    log.error('render-process-gone', d);
    if (d.reason !== 'clean-exit' && d.reason !== 'killed' && crashes++ < 3 && win) { try { win.webContents.reload(); } catch (e) { log.error('reload after crash failed', e); } }
  });
  win.webContents.on('unresponsive', () => log.warn('window unresponsive'));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log.error('did-fail-load', { code, desc, url }));
  win.webContents.on('console-message', (_e, level, msg, line, src) => { if (level >= 3) { if (logBudget-- > 0) log.warn('console.error', `${msg} (${String(src).split(/[\\/]/).pop()}:${line})`); } });
  if (sys.alwaysOnTop) win.setAlwaysOnTop(true);
  if (sys.hideFromCapture) win.setContentProtection(true);
  const saveState = () => {
    try { const b = win.getNormalBounds(); fs.writeFileSync(stateFile(), JSON.stringify({ ...b, max: win.isMaximized() })); } catch {}
  };
  win.on('close', e => {
    saveState();
    if (!quitting && sys.closeToTray && tray && process.platform !== 'darwin') { e.preventDefault(); win.hide(); }
  });
}

const lock = app.requestSingleInstanceLock();
if (!lock) { log.info('another Penny is already running; exiting'); app.quit(); }
else {
  app.on('second-instance', (_e, argv) => { log.info('second instance blocked; focusing existing window'); showWin(); handleArgv(argv); });
  app.on('child-process-gone', (_e, d) => log.error('child-process-gone', d));
  app.on('before-quit', () => { quitting = true; log.info('before-quit'); });
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} clearViewDir(); });
  app.whenReady().then(() => {
    clearViewDir();
    migrateLegacy(); loadSys(); initMainI18n();
    if (process.platform === 'win32') { // let Windows attribute toast notifications to Penny
      try {
        const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Penny.lnk');
        if (fs.existsSync(lnk)) shell.writeShortcutLink(lnk, 'update', { appUserModelId: APP_ID });
      } catch {}
    }
    ipcMain.handle('i18n:list', () => listLocales());
    ipcMain.handle('i18n:get', (_e, code) => { const b = readLocale(code); return b ? JSON.stringify({ meta: b.meta, strings: b.strings }) : null; });
    ipcMain.handle('data:load', () => readData());
    ipcMain.handle('data:save', (_e, obj) => writeData(obj));
    ipcMain.on('data:saveSync', (e, obj) => { e.returnValue = writeData(obj); }); // used when the window is closing
    /* ---- encryption (vault.js) ---- */
    const vaultOut = () => ({ ...vault.status() });
    const unlockWith = fn => {
      const raw = store.newestRaw(usableRaw);
      if (!raw) return { ok: false, reason: 'nodata' };
      const r = fn(raw);
      if (!r.ok) { log.warn('unlock failed', { reason: r.reason }); return r; }
      const d = store.load();
      if (!d || d.__locked) return { ok: false, reason: 'unreadable' };
      afterOpen();
      log.info('data unlocked');
      return { ok: true, data: d, vault: vaultOut() };
    };
    ipcMain.handle('vault:status', () => vaultOut());
    ipcMain.handle('vault:unlock', (_e, pin) => unlockWith(raw => vault.unlockPasscode(raw, String(pin || ''))));
    ipcMain.handle('vault:recover', (_e, code) => unlockWith(raw => vault.unlockRecovery(raw, String(code || ''))));
    ipcMain.handle('vault:verify', (_e, pin) => vault.verifyPasscode(String(pin || '')));
    ipcMain.handle('vault:setPasscode', (_e, pin) => {
      try { const { recoveryKey } = vault.setPasscode(String(pin || '')); store.rewriteAll(); attach.rewriteAll(); log.info('passcode encryption on'); return { ok: true, recoveryKey, vault: vaultOut() }; }
      catch (e) { log.error('set passcode failed', e); return { ok: false, error: e.code || 'failed' }; }
    });
    ipcMain.handle('vault:clearPasscode', () => { try { vault.clearPasscode(); store.rewriteAll(); attach.rewriteAll(); log.info('passcode encryption off'); return { ok: true, vault: vaultOut() }; } catch (e) { log.error('clear passcode failed', e); return { ok: false }; } });
    ipcMain.handle('vault:newRecovery', () => { try { const { recoveryKey } = vault.newRecoveryKey(); store.rewriteAll(); attach.rewriteAll(); return { ok: true, recoveryKey }; } catch (e) { return { ok: false, error: e.code || 'failed' }; } });
    /* data encrypted for another PC/Windows account and no recovery key: keep it aside (renamed, never deleted) and start fresh */
    ipcMain.handle('vault:setAside', () => {
      const ts = Date.now(), moved = [];
      for (const n of ['penny-data.json', 'penny-data.lastgood.json']) { try { fs.renameSync(path.join(dataDir(), n), path.join(dataDir(), n.replace('.json', `.locked-${ts}.json`))); moved.push(n); } catch {} }
      try { fs.renameSync(backupDir(), backupDir() + `.locked-${ts}`); moved.push('backups'); } catch {}
      log.warn('encrypted data set aside', moved);
      return { ok: true, moved };
    });
    ipcMain.handle('data:snapshot', (_e, kind) => store.snapshot(kind));
    ipcMain.handle('backups:list', () => store.listBackups());
    ipcMain.handle('backups:read', (_e, name) => store.readBackup(name));
    ipcMain.handle('log:write', (_e, level, msg) => { if (logBudget-- > 0) (level === 'error' ? log.error : log.warn)('renderer: ' + String(msg).slice(0, 1500)); return true; });
    ipcMain.handle('app:openLogs', () => shell.openPath(path.dirname(log.file)));
    ipcMain.handle('win:material', (_e, m) => { if (win && process.platform === 'win32') { try { win.setBackgroundMaterial(m); } catch {} } return true; });
    ipcMain.on('win:themeGet', e => { e.returnValue = uiDark() ? 'dark' : 'light'; });
    // right-click menu: clipboard and undo commands run on the window that asked (never anything else)
    ipcMain.handle('win:edit', (e, c) => { if (['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'].includes(c)) e.sender[c](); });
    ipcMain.handle('win:theme', (_e, t) => {
      if (t !== 'light' && t !== 'dark') return false;
      if (sys.uiTheme !== t) { sys.uiTheme = t; saveSys(); }
      if (win) { try { win.setBackgroundColor(themeBg()); } catch {} }
      return true;
    });
    ipcMain.handle('win:overlay', (_e, symbolColor) => { if (win && process.platform === 'win32') { try { win.setTitleBarOverlay({ color: '#00000000', symbolColor, height: 52 }); } catch {} } });
    ipcMain.handle('file:export', async (_e, { name, content, filters }) => {
      const r = await dialog.showSaveDialog(win, { defaultPath: name, filters });
      if (r.canceled || !r.filePath) return false;
      fs.writeFileSync(r.filePath, content, 'utf8');
      return r.filePath;
    });
    /* the current page as a PDF (Financial Health Report). The renderer switches to its print layout first. */
    ipcMain.handle('file:pdf', async (_e, name) => {
      if (!win) return false;
      const r = await dialog.showSaveDialog(win, { defaultPath: String(name || mt('dlg.reportPdf')).replace(/[\\/:*?"<>|]/g, '-'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return false;
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.5, bottom: 0.5, left: 0.45, right: 0.45 } });
      fs.writeFileSync(r.filePath, pdf);
      log.info('report saved as PDF');
      return r.filePath;
    });
    /* ---- attachments ---- */
    const attErr = e => ({ ok: false, error: (e && e.code) || 'failed' });
    ipcMain.handle('att:pick', async () => {
      const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [
        { name: mt('dlg.attAll'), extensions: Object.keys(ATT_TYPES) }, { name: mt('dlg.images'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'] }, { name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled) return { ok: true, files: [] };
      const files = [], bad = [];
      for (const f of r.filePaths.slice(0, 10)) {
        try { if (fs.statSync(f).size > 20 * 1024 * 1024) { bad.push({ name: path.basename(f), error: 'SIZE' }); continue; } files.push(attach.save(path.basename(f), fs.readFileSync(f))); }
        catch (e) { bad.push({ name: path.basename(f), error: e.code || 'failed' }); }
      }
      if (files.length) log.info(`attached ${files.length} file(s)`);
      return { ok: true, files, bad };
    });
    ipcMain.handle('att:save', (_e, o) => { try { return { ok: true, file: attach.save(o && o.name, Buffer.from((o && o.bytes) || [])) }; } catch (e) { return attErr(e); } });
    ipcMain.handle('att:preview', (_e, id) => {   // images only: the app shows them itself
      try { const f = attach.read(id); if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(f.type)) return { ok: false, error: 'NO_PREVIEW' }; return { ok: true, type: f.type, bytes: f.bytes }; } catch (e) { return attErr(e); }
    });
    ipcMain.handle('att:open', async (_e, id) => {
      try {
        const f = attach.read(id), ext = attExt('x.' + f.ext);
        if (!ext) return { ok: false, error: 'TYPE' };
        const d = path.join(viewDir(), String(id)); fs.mkdirSync(d, { recursive: true });
        const base = f.name.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^\w .()\-]+/g, ' ').trim().slice(0, 80) || 'attachment';
        const p = path.join(d, base + '.' + ext); fs.writeFileSync(p, f.bytes);
        const err = await shell.openPath(p); return err ? { ok: false, error: 'OPEN' } : { ok: true };
      } catch (e) { return attErr(e); }
    });
    ipcMain.handle('att:saveAs', async (_e, id) => {
      try {
        const f = attach.read(id);
        const r = await dialog.showSaveDialog(win, { defaultPath: f.name, filters: [{ name: f.ext.toUpperCase(), extensions: [f.ext] }] });
        if (r.canceled || !r.filePath) return { ok: false, error: 'CANCELED' };
        fs.writeFileSync(r.filePath, f.bytes); return { ok: true };
      } catch (e) { return attErr(e); }
    });
    ipcMain.handle('att:remove', (_e, id) => ({ ok: attach.remove(id) }));
    ipcMain.handle('att:gc', (_e, ids) => { try { return { ok: true, removed: attach.gc(Array.isArray(ids) ? ids.map(String) : []) }; } catch (e) { return attErr(e); } });
    ipcMain.handle('file:import', async (_e, { filters }) => {
      const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
      if (r.canceled || !r.filePaths[0]) return null;
      if (fs.statSync(r.filePaths[0]).size > 100 * 1024 * 1024) { log.warn('import refused: file larger than 100 MB'); return null; }
      return fs.readFileSync(r.filePaths[0], 'utf8');
    });
    ipcMain.handle('app:openData', () => shell.openPath(dataDir()));
    ipcMain.handle('app:version', () => updater.VERSION);
    ipcMain.handle('app:notify', (_e, o) => {
      if (!Notification.isSupported()) { log.warn('notify: notifications are not supported on this system'); return false; }
      const { title = 'Penny', body = '', sound, silent, go, id } = o || {};
      const esc = t => String(t).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
      const icon = path.join(__dirname, 'assets', 'icon.png');
      let n;
      if (process.platform === 'win32' && (sound || silent)) { // custom Windows toast sound
        try {
          const audio = silent ? '<audio silent="true"/>' : `<audio src="ms-winsoundevent:${esc(sound)}"/>`;
          n = new Notification({ toastXml: `<toast><visual><binding template="ToastGeneric"><text>${esc(title)}</text><text>${esc(body)}</text></binding></visual>${audio}</toast>` });
        } catch { n = null; }
      }
      if (!n) n = new Notification({ title, body, icon, silent: !!silent });
      n.on('click', () => { showWin(); if (go) send('navigate', { page: go, id }); });
      n.on('failed', (_e, err) => log.warn('notify failed', err)); // Windows only event
      try { n.show(); log.info('notify shown', { sound: sound || null, silent: !!silent, go: go || null }); } // never log the text itself
      catch (e) { log.error('notify show failed', e); return false; }
      return true;
    });
    updater.onState(st => send('update-state', st));
    const autoCheck = () => { if (sys.autoUpdate) updater.check(sys, { silent: true }); };
    setTimeout(autoCheck, 12000); setInterval(autoCheck, 6 * 3600e3);
    ipcMain.handle('upd:get', () => ({ ...updater.getState(), ...updater.sourceOf(sys), feed: updater.feedUrl(sys), autoUpdate: sys.autoUpdate }));
    ipcMain.handle('upd:check', () => updater.check(sys, { silent: false }));
    ipcMain.handle('upd:apply', async () => {
      try { if (win) await win.webContents.executeJavaScript('window.__flushSync&&window.__flushSync()'); } catch (e) { log.error('flush before update failed', e); }
      log.info('applying update: relaunch'); quitting = true; app.relaunch(); app.exit(0); return true;
    });
    ipcMain.handle('sys:get', () => ({ ...sys, hotkeyOk, systemLocale: app.getLocale(), packaged: app.isPackaged, platform: process.platform, loginItem: app.isPackaged ? app.getLoginItemSettings().openAtLogin : false }));
    ipcMain.handle('sys:set', (_e, patch) => {
      const prevLang = sys.lang;
      const allowed = Object.keys(SYS_DEFAULTS);
      for (const k of Object.keys(patch || {})) if (allowed.includes(k)) sys[k] = (k === 'updateFeed') ? String(patch[k] || '').slice(0, 300) : patch[k];
      if (typeof sys.hotkeyAccel !== 'string' || !/^[\w+]+$/.test(sys.hotkeyAccel)) sys.hotkeyAccel = SYS_DEFAULTS.hotkeyAccel;
      if (typeof sys.lang !== 'string' || !(sys.lang === 'auto' || CODE_RE.test(sys.lang))) sys.lang = 'auto';
      if (sys.lang !== prevLang) { initMainI18n(); refreshTray(); }
      saveSys(); applySys();
      return { ...sys, hotkeyOk };
    });
    ipcMain.handle('sys:tooltip', (_e, t) => { if (tray && typeof t === 'string') tray.setToolTip(t.slice(0, 120)); return true; });
    ipcMain.handle('sys:badge', (_e, n) => {
      if (win && process.platform === 'win32') { try { win.setOverlayIcon(n > 0 ? dotIcon() : null, n > 0 ? `${n} bills due` : ''); } catch {} }
      return true;
    });
    ipcMain.handle('sys:ready', () => { rendererReady = true; const q = pendingEvents; pendingEvents = []; q.forEach(([n, a]) => send(n, a)); return true; });
    ipcMain.handle('license:get', () => {
      try { const k = fs.readFileSync(licFile(), 'utf8'); const r = verifyKey(k); return r.ok ? { ok: true, payload: r.payload } : { ok: false, reason: r.reason, payload: r.payload || null }; } catch { return { ok: false, reason: 'none' }; }
    });
    ipcMain.handle('license:activate', (_e, key) => {
      const r = verifyKey(key);
      if (r.ok) { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(licFile(), String(key).trim()); } catch {} }
      return r.ok ? { ok: true, payload: r.payload } : { ok: false, reason: r.reason };
    });
    ipcMain.handle('license:remove', () => { try { fs.unlinkSync(licFile()); } catch {} return true; });
    syncWindowsIcons(); createWindow(); applySys(); handleArgv(process.argv);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  // A window that really closes (close-to-tray is off, or Quit was chosen) must end the process.
  // Leaving it alive with no window would look like "quit" to the user while reminders silently stop.
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') { log.info('last window closed; quitting'); app.quit(); } });
}
