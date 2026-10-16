'use strict';
/* =========================================================
   Penny data store (main process, no Electron dependency so it can be unit-tested)
   - validates every save, refuses malformed data
   - atomic write: tmp file -> fsync -> rename
   - keeps `penny-data.lastgood.json` = last meaningful version, never overwritten by empty data
   - daily / before-change / manual / pre-migration backups, all validated before use
   - recovery by shape (not just JSON errors), also when the main file is missing
   ========================================================= */
const fs = require('fs');
const path = require('path');

const ARR = ['accounts', 'categories', 'transactions', 'goals', 'bills', 'reminders'];
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
/* what we accept when READING (older files may lack reminders/settings) */
const loadable = o => isObj(o) && Array.isArray(o.accounts) && Array.isArray(o.transactions);
/* what we accept when WRITING (the renderer always normalizes first) */
const saveable = o => isObj(o) && ARR.every(k => Array.isArray(o[k])) && isObj(o.settings) && (o.schema == null || Number.isInteger(o.schema));
const meaningful = o => loadable(o) && (o.accounts.length + o.transactions.length + (o.bills || []).length + (o.goals || []).length + (o.reminders || []).length) > 0;
const counts = o => ({ accounts: o.accounts.length, transactions: o.transactions.length, goals: (o.goals || []).length, bills: (o.bills || []).length, reminders: (o.reminders || []).length });

const KINDS = { 'before-change': { keep: 20 }, 'pre-migration': { keep: 8 }, manual: { keep: 30 } };

function createStore(dir, log = { info() {}, warn() {}, error() {} }) {
  const file = () => path.join(dir, 'penny-data.json');
  const lastGood = () => path.join(dir, 'penny-data.lastgood.json');
  const bdir = () => path.join(dir, 'backups');
  const parse = p => JSON.parse(fs.readFileSync(p, 'utf8'));
  let lastMeaningful = false;
  const infoCache = new Map();

  function prune(prefixRe, keep, where) {
    try {
      const names = fs.readdirSync(where).filter(n => prefixRe.test(n)).sort();
      while (names.length > keep) fs.unlinkSync(path.join(where, names.shift()));
    } catch (e) { log.warn('prune failed', e); }
  }

  function atomicWrite(target, text) {
    const tmp = target + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, target);
  }

  function backupFiles() {
    try {
      return fs.readdirSync(bdir()).filter(n => n.endsWith('.json')).map(n => {
        const s = fs.statSync(path.join(bdir(), n)); return { name: n, size: s.size, mtime: s.mtimeMs };
      }).sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? 1 : -1));
    } catch { return []; }
  }

  function inspect(p, key) {
    const st = fs.statSync(p), ck = `${key}|${st.mtimeMs}|${st.size}`;
    if (infoCache.has(ck)) return infoCache.get(ck);
    let info;
    try { const d = parse(p); info = loadable(d) ? { valid: true, schema: d.schema || d.version || 1, counts: counts(d), empty: !meaningful(d) } : { valid: false, reason: 'Missing accounts or transactions' }; }
    catch { info = { valid: false, reason: 'Not readable' }; }
    infoCache.set(ck, info); return info;
  }

  function listBackups() {
    return backupFiles().map(b => ({ ...b, ...inspect(path.join(bdir(), b.name), b.name) }));
  }

  /* newest meaningful recovery source: last-good first, then backups by recency */
  function recover() {
    const cands = [];
    if (fs.existsSync(lastGood())) cands.push({ name: 'penny-data.lastgood.json', p: lastGood() });
    for (const b of backupFiles()) cands.push({ name: b.name, p: path.join(bdir(), b.name) });
    for (const c of cands) {
      try { const d = parse(c.p); if (meaningful(d)) return { name: c.name, data: d }; } catch {}
    }
    return null;
  }

  function load() {
    const f = file();
    let state = 'missing';
    if (fs.existsSync(f)) {
      try {
        const d = parse(f);
        if (loadable(d)) { lastMeaningful = meaningful(d); return d; }
        state = 'badshape'; log.error('data file has an invalid structure');
      } catch (e) { state = 'unreadable'; log.error('data file unreadable', e); }
      try { fs.renameSync(f, path.join(dir, `penny-data.damaged-${Date.now()}.json`)); prune(/^penny-data\.damaged-\d+\.json$/, 5, dir); } catch (e) { log.error('could not set damaged file aside', e); }
    }
    const rec = recover();
    if (rec) {
      log.warn(`recovered from ${rec.name} (state=${state})`);
      lastMeaningful = true;
      rec.data.__recovered = rec.name;
      return rec.data;
    }
    return state === 'missing' ? null : { __damaged: true };
  }

  function save(obj) {
    if (!saveable(obj)) {
      log.error('save rejected: invalid structure', { type: typeof obj, keys: isObj(obj) ? Object.keys(obj).slice(0, 12) : null });
      return { ok: false, error: 'invalid-structure' };
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      const f = file(), text = JSON.stringify(obj);
      if (text.length < 20) return { ok: false, error: 'too-small' };
      if (fs.existsSync(f)) {
        // protect the last meaningful version before it is replaced
        if (lastMeaningful) { try { fs.copyFileSync(f, lastGood()); } catch (e) { log.warn('lastgood copy failed', e); } }
        // daily backup, taken from the file as it was BEFORE this write, only if it is itself good
        const day = new Date().toISOString().slice(0, 10), b = path.join(bdir(), `penny-${day}.json`);
        if (lastMeaningful && !fs.existsSync(b)) {
          fs.mkdirSync(bdir(), { recursive: true });
          fs.copyFileSync(f, b);
          prune(/^penny-\d{4}-\d{2}-\d{2}\.json$/, 14, bdir());
        }
      }
      atomicWrite(f, text);
      lastMeaningful = meaningful(obj);
      return { ok: true };
    } catch (e) {
      log.error('save failed', e);
      return { ok: false, error: String(e && e.code || e && e.message || e) };
    }
  }

  /* kind: before-change | pre-migration | manual. Skips empty data so rotation never evicts good copies. */
  function snapshot(kind = 'before-change') {
    try {
      if (!KINDS[kind]) kind = 'before-change';
      if (!fs.existsSync(file())) return { ok: false, error: 'no-data' };
      const d = parse(file());
      if (!loadable(d)) return { ok: false, error: 'invalid' };
      if (!meaningful(d) && kind !== 'manual') return { ok: true, skipped: true };
      fs.mkdirSync(bdir(), { recursive: true });
      const name = `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      fs.copyFileSync(file(), path.join(bdir(), name));
      prune(new RegExp('^' + kind + '-.*\\.json$'), KINDS[kind].keep, bdir());
      log.info(`snapshot ${kind}`, name);
      return { ok: true, name };
    } catch (e) { log.error('snapshot failed', e); return { ok: false, error: String(e && e.message || e) }; }
  }

  function readBackup(name) {
    if (typeof name !== 'string' || !/^[\w.\-]+\.json$/.test(name)) return null;
    try { return fs.readFileSync(path.join(bdir(), name), 'utf8'); } catch { return null; }
  }

  return { load, save, snapshot, listBackups, readBackup, recover, file, lastGood, bdir, meaningful, saveable, loadable };
}

module.exports = { createStore, saveable, loadable, meaningful };
