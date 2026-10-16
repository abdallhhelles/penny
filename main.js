const { app, BrowserWindow, ipcMain, dialog, shell, screen, Notification, Tray, Menu, nativeImage, globalShortcut, nativeTheme } = require('electron');
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
const { createStore } = require('./store');
const log = createLogger(app.getPath('userData'));
const store = createStore(app.getPath('userData'), log);
const readData = () => store.load();
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
const SYS_DEFAULTS = { lang: 'auto', launchAtStartup: false, startMinimized: true, closeToTray: false, tray: true, hotkey: true, hotkeyAccel: 'CommandOrControl+Alt+P', alwaysOnTop: false, hideFromCapture: false, zoom: 1, autoUpdate: true, updateFeed: '' };
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
        { program: process.execPath, arguments: '--quick=expense', iconPath: process.execPath, iconIndex: 0, title: mt('jump.addExpense'), description: mt('jump.addExpenseDesc') },
        { program: process.execPath, arguments: '--quick=income', iconPath: process.execPath, iconIndex: 0, title: mt('jump.addIncome'), description: mt('jump.addIncomeDesc') }
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
    const menu = () => Menu.buildFromTemplate([
      { label: 'Open Penny', click: showWin },
      { label: 'Add expense', accelerator: sys.hotkey ? sys.hotkeyAccel : undefined, click: () => quickAdd('expense') },
      { label: 'Add income', click: () => quickAdd('income') },
      { type: 'separator' },
      { label: 'Hide amounts', click: () => { send('privacy'); } },
      { label: 'Lock Penny', click: () => { showWin(); send('lock'); } },
      { type: 'separator' },
      { label: `About Penny (${PUB.name})`, click: () => { showWin(); send('navigate', { page: 'settings', scat: 'about' }); } },
      { label: 'Quit Penny', click: () => { quitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu());
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
function createWindow() {
  const isWin = process.platform === 'win32';
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1380, height: st.height || 880, x: st.x, y: st.y, minWidth: 420, minHeight: 560,
    show: false, frame: false, backgroundColor: '#00000000',
    ...(isWin ? { backgroundMaterial: 'acrylic' } : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 52 },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Penny',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged, spellcheck: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  if (st.max) win.maximize();
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
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });
  app.whenReady().then(() => {
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
    ipcMain.handle('data:snapshot', (_e, kind) => store.snapshot(kind));
    ipcMain.handle('backups:list', () => store.listBackups());
    ipcMain.handle('backups:read', (_e, name) => store.readBackup(name));
    ipcMain.handle('log:write', (_e, level, msg) => { if (logBudget-- > 0) (level === 'error' ? log.error : log.warn)('renderer: ' + String(msg).slice(0, 1500)); return true; });
    ipcMain.handle('app:openLogs', () => shell.openPath(path.dirname(log.file)));
    ipcMain.handle('win:material', (_e, m) => { if (win && process.platform === 'win32') { try { win.setBackgroundMaterial(m); } catch {} } return true; });
    ipcMain.handle('win:overlay', (_e, symbolColor) => { if (win && process.platform === 'win32') { try { win.setTitleBarOverlay({ color: '#00000000', symbolColor, height: 52 }); } catch {} } });
    ipcMain.handle('file:export', async (_e, { name, content, filters }) => {
      const r = await dialog.showSaveDialog(win, { defaultPath: name, filters });
      if (r.canceled || !r.filePath) return false;
      fs.writeFileSync(r.filePath, content, 'utf8');
      return r.filePath;
    });
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
    ipcMain.handle('upd:get', () => ({ ...updater.getState(), feed: updater.feedUrl(sys), autoUpdate: sys.autoUpdate }));
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
    createWindow(); applySys(); handleArgv(process.argv);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  // A window that really closes (close-to-tray is off, or Quit was chosen) must end the process.
  // Leaving it alive with no window would look like "quit" to the user while reminders silently stop.
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') { log.info('last window closed; quitting'); app.quit(); } });
}
