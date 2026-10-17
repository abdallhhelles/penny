'use strict';
/* Windows icon sync after an update (main.js › syncWindowsIcons), run against a simulated install:
   fake install folder, Start menu / desktop / pinned-taskbar shortcuts and a stand-in for Electron's shell link API. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');

function load(env) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const a = src.indexOf('let brandIco = null;'), b = src.indexOf('function createWindow() {');
  const fn = new Function('require', 'fs', 'path', 'shell', 'app', 'log', 'APP_ID', 'updater', 'dataDir', 'process', '__dirname', src.slice(a, b) + ';return {syncWindowsIcons,brandIconPath};');
  const proc = Object.create(process, { execPath: { value: env.exe }, platform: { value: env.platform || 'win32' } });
  return fn(require, fs, path, env.shell, env.app, env.log, 'com.akrot.penny', { VERSION: '1.10.0' }, () => env.data, proc, path.join(__dirname, '..'));
}
function setup({ installed = true } = {}) {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'penny-win-'));
  const inst = path.join(T, 'Programs', 'Penny'), appData = path.join(T, 'AppData'), desk = path.join(T, 'Desktop'), data = path.join(appData, 'Penny');
  const sm = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), tb = path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');
  [inst, desk, data, sm, tb].forEach(d => fs.mkdirSync(d, { recursive: true }));
  if (installed) fs.writeFileSync(path.join(inst, 'Uninstall.exe'), 'x');
  fs.writeFileSync(path.join(inst, 'icon.ico'), 'OLD'); fs.writeFileSync(path.join(inst, 'penny-0123456789.ico'), 'OLDER');
  const exe = path.join(inst, 'Penny.exe');
  const lnk = (p, target, icon) => { fs.writeFileSync(p, JSON.stringify({ target, icon })); return p; };
  const links = { start: lnk(path.join(sm, 'Penny.lnk'), exe, path.join(inst, 'icon.ico')), desk: lnk(path.join(desk, 'Penny.lnk'), exe, path.join(inst, 'icon.ico')),
    pinned: lnk(path.join(tb, 'Penny.lnk'), exe.toUpperCase(), exe), other: lnk(path.join(desk, 'Other.lnk'), 'C:\\Other\\other.exe', 'other.ico') };
  const shell = { readShortcutLink: p => JSON.parse(fs.readFileSync(p, 'utf8')), writeShortcutLink: (p, op, d) => { assert.strictEqual(op, 'update'); fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, 'utf8')), ...d })); return true; } };
  const logs = [];
  return { inst, data, links, exe, shell, app: { getPath: k => ({ appData, desktop: desk })[k] }, log: { info: m => logs.push(m), warn: (...m) => logs.push('WARN ' + m.join(' ')) }, logs };
}
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));

test('windows icons: every Penny shortcut points at the new icon, other apps are left alone', () => {
  const e = setup(), m = load(e);
  m.syncWindowsIcons();
  assert.ok(!e.logs.some(l => l.startsWith('WARN')), e.logs.join());
  const ico = fs.readdirSync(e.inst).find(n => /^penny-[a-f0-9]{10}\.ico$/.test(n));
  assert.ok(ico && ico !== 'penny-0123456789.ico', 'a fresh versioned icon file');
  assert.ok(!fs.existsSync(path.join(e.inst, 'penny-0123456789.ico')), 'the old one is removed');
  assert.ok(fs.readFileSync(path.join(e.inst, ico)).equals(fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.ico'))));
  assert.ok(fs.readFileSync(path.join(e.inst, 'icon.ico')).equals(fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.ico'))), 'icon.ico refreshed too');
  for (const k of ['start', 'desk', 'pinned']) { const l = read(e.links[k]); assert.strictEqual(path.basename(l.icon), ico, k); assert.strictEqual(l.appUserModelId, 'com.akrot.penny', k); }
  assert.deepStrictEqual(read(e.links.other), { target: 'C:\\Other\\other.exe', icon: 'other.ico' });
  assert.strictEqual(path.basename(m.brandIconPath()), ico);
});

test('windows icons: runs once per icon, and never for a dev or portable copy', () => {
  const e = setup(), m = load(e);
  m.syncWindowsIcons(); e.logs.length = 0; m.syncWindowsIcons();
  assert.strictEqual(e.logs.length, 0, 'second start does nothing');
  const p = setup({ installed: false }); load(p).syncWindowsIcons();
  assert.strictEqual(read(p.links.start).icon, path.join(p.inst, 'icon.ico'), 'not installed: shortcuts untouched');
  const l = setup(); load({ ...l, platform: 'linux' }).syncWindowsIcons();
  assert.ok(!fs.existsSync(path.join(l.data, 'icon-sync.json')), 'only on Windows');
});
