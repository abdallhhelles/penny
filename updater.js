// Penny updater (main process). Checks a signed feed, downloads a small app bundle (~1 MB), verifies SHA-256 + Ed25519
// signature, stages it in %APPDATA%\Penny\updates and activates it on the next launch (see bootstrap.js).
// No third-party service is required: host latest.json + the .pkg on GitHub Releases, any static host, or a shared folder.
const { app, net } = require('electron');
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'update-public.pem'), 'utf8');
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
const SHELL_API = global.__PENNY_SHELL_API || 1;
const root = () => path.join(app.getPath('userData'), 'updates');
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; };
const ALLOWED = /^(main\.js|preload\.js|license\.js|updater\.js|store\.js|log\.js|package\.json|license-public\.pem|update-public\.pem|update-config\.json|assets\/[\w.\-@]+|renderer\/[\w.\-]+|renderer\/locales\/[\w.\-]+\.json)$/;

let state = { status: 'idle', current: VERSION, available: null, notes: '', error: '', checkedAt: 0, progress: 0, size: 0, date: '', source: '', repo: '', releaseUrl: '' };
let listener = () => {};
const set = p => { state = { ...state, ...p }; try { listener(state); } catch {} };

/* GitHub Releases feed: owner/name -> the latest release's latest.json (GitHub redirects "latest/download" to the newest non-prerelease) */
const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const githubFeed = repo => REPO_RE.test(String(repo || '').trim()) ? `https://github.com/${String(repo).trim()}/releases/latest/download/latest.json` : '';
function feedUrl(sys) {
  let f = (sys && sys.updateFeed) || '';                                  // 1. a custom address typed in Settings wins
  if (!f) { try { f = JSON.parse(fs.readFileSync(path.join(__dirname, 'update-config.json'), 'utf8')).feedUrl || ''; } catch {} }   // 2. update-config.json
  if (!f) { try { f = githubFeed(require('./renderer/publisher.js').updateRepo); } catch {} }                                    // 3. GitHub repo from publisher.js
  return String(f).trim();
}
/* where updates come from, for the Settings card ("GitHub · owner/name") and the "View release" link */
function sourceOf(sys) {
  const custom = !!(sys && sys.updateFeed);
  let repo = '';
  if (!custom) { try { repo = String(require('./renderer/publisher.js').updateRepo || '').trim(); } catch {} }
  const f = feedUrl(sys), m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\//.exec(f);
  if (m) repo = m[1];
  return { source: m ? 'github' : f ? 'custom' : '', repo, releaseUrl: m ? `https://github.com/${m[1]}/releases/latest` : '' };
}
function okUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname)) || x.protocol === 'file:'; } catch { return false; } }
/* onProgress(received, total): real download progress for the update sheet */
async function fetchBuf(u, ms = 20000, onProgress = null, expected = 0) {
  if (/^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('\\\\') || u.startsWith('/')) return fs.readFileSync(u); // local / shared folder path
  if (u.startsWith('file:')) return fs.readFileSync(new URL(u));
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    let r;
    try { r = await net.fetch(u, { signal: ac.signal, cache: 'no-store' }); }
    catch (e) { throw Object.assign(new Error(ac.signal.aborted ? 'The update server did not answer in time' : 'No internet connection'), { code: 'OFFLINE' }); }
    if (!r.ok) throw Object.assign(new Error('Server answered ' + r.status), { code: 'HTTP', status: r.status });
    const total = +r.headers.get('content-length') || expected || 0;
    if (!onProgress || !r.body || !r.body.getReader) return Buffer.from(await r.arrayBuffer());
    const reader = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(Buffer.from(value)); got += value.length; try { onProgress(got, total); } catch {} }
    return Buffer.concat(parts);
  } finally { clearTimeout(t); }
}
const resolveUrl = (u, base) => { if (/^(https?:|file:)/i.test(u) || /^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('/')) return u; if (/^[a-zA-Z]:[\\/]|^\\\\/.test(base)) return path.join(path.dirname(base), u); return new URL(u, base).toString(); };

async function check(sys, { silent = false } = {}) {
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'verifying') return state;
  const feed = feedUrl(sys);
  set(sourceOf(sys));
  if (!feed) { set({ status: 'unconfigured', error: '' }); return state; }
  if (!/^[a-zA-Z]:[\\/]|^\\\\|^\//.test(feed) && !okUrl(feed)) { set({ status: 'error', error: 'The update address must start with https://' }); return state; }
  set({ status: 'checking', error: '' });
  try {
    let m;
    try { m = JSON.parse((await fetchBuf(feed)).toString('utf8')); }
    catch (e) {
      // GitHub answers 404 until the first release with a latest.json exists: that is "nothing to install", not a failure
      if (e && e.code === 'HTTP' && e.status === 404 && state.source === 'github') { set({ status: 'uptodate', available: null, checkedAt: Date.now(), error: '' }); return state; }
      if (e && e.code === 'OFFLINE') { set({ status: silent ? 'idle' : 'offline', error: '' }); return state; }
      throw e;
    }
    set({ checkedAt: Date.now() });
    if (!m.version || !m.sha256 || !m.sig || !m.url) throw new Error('The update feed is incomplete');
    if (cmp(m.version, VERSION) <= 0) { set({ status: 'uptodate', available: null }); return state; }
    const meta = { notes: String(m.notes || '').slice(0, 4000), size: +m.size || 0, date: String(m.date || '').slice(0, 40) };
    if ((m.shell || 1) > SHELL_API) { set({ status: 'needs-installer', available: m.version, ...meta, installerUrl: /^https:\/\//.test(m.installerUrl || '') ? m.installerUrl : state.releaseUrl }); return state; }
    // already staged?
    try { const c = JSON.parse(fs.readFileSync(path.join(root(), 'current.json'), 'utf8')); if (cmp(c.version, m.version) >= 0) { set({ status: 'ready', available: c.version, ...meta }); return state; } } catch {}
    set({ status: 'downloading', available: m.version, ...meta, progress: 0.02 });
    let last = 0;
    const buf = await fetchBuf(resolveUrl(m.url, feed), 180000, (got, total) => {
      const p = total ? Math.min(0.9, 0.02 + 0.88 * got / total) : Math.min(0.85, state.progress + 0.01);
      if (p - last >= 0.02) { last = p; set({ progress: p }); }
    }, meta.size);
    set({ status: 'verifying', progress: 0.94 });
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== String(m.sha256).toLowerCase()) throw new Error('Download failed its integrity check');
    const good = crypto.verify(null, Buffer.from(`penny-app\n${m.version}\n${sha}`), PUBLIC_KEY, Buffer.from(m.sig, 'base64'));
    if (!good) throw new Error('The update is not signed by Penny');
    stage(m.version, buf);
    set({ status: 'ready', progress: 1 });
  } catch (e) {
    set({ status: silent ? 'idle' : 'error', error: String(e.message || e).slice(0, 160) });
  }
  return state;
}
function stage(version, buf) {
  const pkg = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  if (pkg.version !== version || !pkg.files) throw new Error('The update package is malformed');
  const dir = path.join(root(), 'v' + version), tmp = dir + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  for (const [rel, b64] of Object.entries(pkg.files)) {
    if (!ALLOWED.test(rel)) throw new Error('Unexpected file in update: ' + rel);
    const out = path.join(tmp, rel); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  }
  for (const need of ['main.js', 'preload.js', 'store.js', 'log.js', 'package.json', 'renderer/index.html', 'renderer/i18n.js', 'renderer/locales/en.json', 'updater.js', 'license.js', 'license-public.pem', 'update-public.pem']) if (!fs.existsSync(path.join(tmp, need))) throw new Error('Update is missing ' + need);
  if (JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')).version !== version) throw new Error('Version mismatch in update');
  fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir);
  fs.writeFileSync(path.join(root(), 'current.json'), JSON.stringify({ version, dir: 'v' + version }));
  try { fs.readdirSync(root()).filter(n => /^v\d/.test(n) && n !== 'v' + version).forEach(n => fs.rmSync(path.join(root(), n), { recursive: true, force: true })); } catch {}
}
module.exports = { check, getState: () => state, onState: fn => { listener = fn; }, VERSION, feedUrl, githubFeed, sourceOf };
