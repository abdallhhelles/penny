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
const crypto = require('crypto');

const ARR = ['accounts', 'categories', 'transactions', 'goals', 'bills', 'reminders'];
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
/* what we accept when READING (older files may lack reminders/settings) */
const loadable = o => isObj(o) && Array.isArray(o.accounts) && Array.isArray(o.transactions);
/* what we accept when WRITING (the renderer always normalizes first) */
const saveable = o => isObj(o) && ARR.every(k => Array.isArray(o[k])) && isObj(o.settings) && (o.schema == null || Number.isInteger(o.schema));
const meaningful = o => loadable(o) && (o.accounts.length + o.transactions.length + (o.bills || []).length + (o.goals || []).length + (o.reminders || []).length) > 0;
const counts = o => ({ accounts: o.accounts.length, transactions: o.transactions.length, goals: (o.goals || []).length, bills: (o.bills || []).length, reminders: (o.reminders || []).length });

const KINDS = { 'before-change': { keep: 20 }, 'pre-migration': { keep: 8 }, manual: { keep: 30 } };

const PLAIN = { encode: t => t, decode: t => t, current: () => true };

/* codec: { encode(text) -> disk text, decode(disk text) -> text (throws {code:'LOCKED'}), current(disk text) -> bool } (see vault.js) */
function createStore(dir, log = { info() {}, warn() {}, error() {} }, codec = PLAIN) {
  const file = () => path.join(dir, 'penny-data.json');
  const lastGood = () => path.join(dir, 'penny-data.lastgood.json');
  const bdir = () => path.join(dir, 'backups');
  const parse = p => JSON.parse(codec.decode(fs.readFileSync(p, 'utf8')));
  let lastMeaningful = false;
  const infoCache = new Map();

  function prune(prefixRe, keep, where) {
    try {
      const names = fs.readdirSync(where).filter(n => prefixRe.test(n)).sort();
      while (names.length > keep) fs.unlinkSync(path.join(where, names.shift()));
    } catch (e) { log.warn('prune failed', e); }
  }

  function atomicWrite(target, text) {
    const out = codec.encode(text);   // first: a locked vault throws before anything touches the disk
    const tmp = target + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, out); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
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
      } catch (e) {
        if (e && e.code === 'LOCKED') return { __locked: true };   // encrypted and not unlocked yet: never treat as damaged
        state = 'unreadable'; log.error('data file unreadable', e);
      }
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
      if (codec.isLocked && codec.isLocked()) return { ok: false, error: 'locked' };
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
    try { return codec.decode(fs.readFileSync(path.join(bdir(), name), 'utf8')); } catch { return null; }
  }

  /* rewrite every Penny data file with the current keys: encrypts old plain files, and re-wraps after a passcode change
     so no older copy is left that opens without the passcode. Each file is rewritten atomically; a file that cannot be
     decoded is left exactly as it is. */
  function rewriteAll() {
    const files = [];
    try { for (const n of fs.readdirSync(dir)) if (/^penny-data(\.lastgood|\.damaged-\d+)?\.json$/.test(n)) files.push(path.join(dir, n)); } catch {}
    for (const b of backupFiles()) files.push(path.join(bdir(), b.name));
    let done = 0, skipped = 0;
    for (const f of files) {
      try {
        const raw = fs.readFileSync(f, 'utf8');
        if (codec.current(raw)) continue;
        const text = codec.decode(raw);
        const st = fs.statSync(f);
        atomicWrite(f, text);
        try { fs.utimesSync(f, st.atime, st.mtime); } catch {}   // backups are listed by date: keep it
        done++;
      } catch (e) { skipped++; log.warn('rewrite skipped ' + path.basename(f), e && (e.code || e.message)); }
    }
    infoCache.clear();
    if (done || skipped) log.info(`data files rewritten: ${done}, skipped: ${skipped}`);
    return { ok: true, done, skipped };
  }
  /* newest file text the vault can read its keys from (main file, else last-good, else newest backup) */
  function newestRaw(usable = () => true) {
    const c = [file(), lastGood(), ...backupFiles().map(b => path.join(bdir(), b.name))];
    for (const p of c) { try { const t = fs.readFileSync(p, 'utf8'); if (usable(t)) return t; } catch {} }
    return null;
  }

  return { rewriteAll, newestRaw, load, save, snapshot, listBackups, readBackup, recover, file, lastGood, bdir, meaningful, saveable, loadable };
}


/* =========================================================
   Penny vault: encryption at rest. Lives in store.js (not its own file) because installed 1.8 updaters accept
   only a fixed list of file names, so a new file would make the update unusable for them.
   Encrypts every data file Penny writes (penny-data.json, last-good copy, backups) with AES-256-GCM.

   One random 256-bit data key (DEK) encrypts the files. The DEK itself is never stored in the clear; it is wrapped by:
     - device   : Windows DPAPI (Electron safeStorage), bound to this Windows account. Used when no passcode is set,
                  so encryption is automatic and needs nothing to remember.
     - pass     : a key derived from the user's passcode with scrypt, and on top of that wrapped by DPAPI when available,
                  so guessing the passcode offline also needs this Windows account. Replaces `device` when a passcode is set.
     - rec      : a key derived from a random recovery key (shown once). Not bound to the device, so it also opens the data
                  on a new PC or after Windows is reinstalled.
   Each encrypted file carries its own wrapped keys, so any single file (a backup, say) can be opened on its own.

   File format (JSON text): {"pennyVault":1,"keyId":"..","keys":{..},"iv":"b64","tag":"b64","data":"b64"}
   Plain JSON files from older versions are still read; they are rewritten encrypted after the first successful load.
   ========================================================= */

const VAULT_VERSION = 1;
const SCRYPT_PASS = { N: 1 << 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const SCRYPT_REC = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1: easy to read back from paper

const b64 = b => Buffer.from(b).toString('base64');
const unb64 = s => Buffer.from(String(s || ''), 'base64');
const vErr = (code, msg) => Object.assign(new Error(msg || code), { code });

function gcmEncrypt(key, plain) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { iv: b64(iv), tag: b64(c.getAuthTag()), ct: b64(ct) };
}
function gcmDecrypt(key, o) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, unb64(o.iv));
  d.setAuthTag(unb64(o.tag));
  return Buffer.concat([d.update(unb64(o.ct)), d.final()]);
}
const keyIdOf = dek => crypto.createHash('sha256').update('penny-keyid').update(dek).digest('hex').slice(0, 16);

function makeRecoveryKey() {
  const bytes = crypto.randomBytes(20); let bits = '', out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g).join('-'); // 32 chars, 160 bits
}
const normRecovery = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[I1]/g, 'L');

/** device: { available(): bool, encrypt(Buffer): Buffer, decrypt(Buffer): Buffer } (Electron safeStorage) */
function createVault({ device = null, log = { info() {}, warn() {}, error() {} }, now = () => Date.now() } = {}) {
  let dek = null, keyId = null, keys = null; // keys: wrapped keys written into every file
  const known = new Map();                    // every data key opened this session (keyId -> key), so files can still be read after a key change
  let fails = 0, waitUntil = 0;
  const devOk = () => { try { return !!(device && device.available()); } catch { return false; } };

  const isVaultObj = o => !!o && typeof o === 'object' && o.pennyVault === VAULT_VERSION && typeof o.data === 'string' && o.keys && typeof o.keys === 'object';
  function peek(text) {
    if (typeof text !== 'string' || text.charCodeAt(0) !== 123 || text.indexOf('"pennyVault"') < 0 || text.indexOf('"pennyVault"') > 40) return null;
    try { const o = JSON.parse(text); return isVaultObj(o) ? o : null; } catch { return null; }
  }

  function adopt(newDek, fileKeys) { dek = newDek; keyId = keyIdOf(newDek); keys = fileKeys; known.set(keyId, newDek); }

  /* --- unwrap helpers --- */
  function unwrapDevice(k) { return device.decrypt(unb64(k.device)); }
  function unwrapPass(k, pin) {
    let w = k.pass;
    if (w.d) { if (!devOk()) throw vErr('DEVICE'); try { w = JSON.parse(device.decrypt(unb64(w.d)).toString('utf8')); } catch { throw vErr('DEVICE'); } }
    const kek = crypto.scryptSync(String(pin), unb64(w.salt), 32, SCRYPT_PASS);
    return gcmDecrypt(kek, w);
  }
  function unwrapRec(k, code) {
    const w = k.rec, kek = crypto.scryptSync(normRecovery(code), unb64(w.salt), 32, SCRYPT_REC);
    return gcmDecrypt(kek, w);
  }
  /* --- wrap helpers --- */
  function wrapPass(pin) {
    const salt = crypto.randomBytes(16), kek = crypto.scryptSync(String(pin), salt, 32, SCRYPT_PASS);
    const w = { salt: b64(salt), ...gcmEncrypt(kek, dek) };
    return devOk() ? { d: b64(device.encrypt(Buffer.from(JSON.stringify(w)))) } : w;
  }
  function wrapRec(code) {
    const salt = crypto.randomBytes(16), kek = crypto.scryptSync(normRecovery(code), salt, 32, SCRYPT_REC);
    return { salt: b64(salt), ...gcmEncrypt(kek, dek) };
  }

  /**
   * Called with the newest Penny file text before the store loads anything.
   * Returns 'plain' (old unencrypted file, or no file), 'open' (unlocked automatically), 'locked' (passcode needed),
   * or 'foreign' (encrypted for another PC / Windows account and no passcode to try: recovery key needed).
   */
  function open(text) {
    const v = peek(text);
    if (!v) return 'plain';
    if (dek && v.keyId === keyId) return 'open';
    if (!keys && known.has(v.keyId)) return 'open';     // key known this session, files about to be rewritten plain
    const k = v.keys;
    if (k.device) {
      if (devOk()) { try { const d = unwrapDevice(k); if (keyIdOf(d) === v.keyId) { adopt(d, k); return 'open'; } } catch (e) { log.warn('vault: device key did not open this file', e && e.message); } }
      return 'foreign';
    }
    if (k.pass) { keys = k; keyId = v.keyId; return 'locked'; }
    return 'foreign';
  }
  /** what the unlock screen needs to know about a locked/foreign file */
  function describe(text) {
    const v = peek(text); if (!v) return null;
    const k = v.keys;
    return { passcode: !!k.pass, recovery: !!k.rec, device: !!k.device, deviceBound: !!(k.pass && k.pass.d), deviceAvailable: devOk() };
  }

  function throttle() {
    const t = now();
    if (t < waitUntil) return Math.ceil((waitUntil - t) / 1000);
    return 0;
  }
  function failed() {
    fails++;
    if (fails >= 5) waitUntil = now() + Math.min(300, 2 ** (fails - 5) * 2) * 1000;
    return { ok: false, reason: 'wrong', wait: throttle() };
  }

  /** passcode unlock against the wrapped keys found in `text` */
  function unlockPasscode(text, pin) {
    const wait = throttle(); if (wait) return { ok: false, reason: 'wait', wait };
    const v = peek(text); if (!v || !v.keys.pass) return { ok: false, reason: 'nopass' };
    try {
      const d = unwrapPass(v.keys, pin);
      if (keyIdOf(d) !== v.keyId) return failed();
      adopt(d, v.keys); fails = 0; waitUntil = 0; return { ok: true };
    } catch (e) {
      if (e && e.code === 'DEVICE') return { ok: false, reason: 'device' };
      return failed();
    }
  }
  /** recovery-key unlock; afterwards the passcode is dropped (device wrap only) so the user can set a new one */
  function unlockRecovery(text, code) {
    const wait = throttle(); if (wait) return { ok: false, reason: 'wait', wait };
    const v = peek(text); if (!v || !v.keys.rec) return { ok: false, reason: 'norec' };
    try {
      const d = unwrapRec(v.keys, code);
      if (keyIdOf(d) !== v.keyId) return failed();
      adopt(d, { ...v.keys });
      delete keys.pass;
      if (devOk()) keys.device = b64(device.encrypt(d));
      else { dek = null; keyId = null; keys = null; }   // no OS protection here: back to plain files (rewritten after load)
      fails = 0; waitUntil = 0; return { ok: true };
    } catch { return failed(); }
  }
  /** passcode check while unlocked (in-app lock screen). Same throttle as the boot unlock. */
  function verifyPasscode(pin) {
    const wait = throttle(); if (wait) return { ok: false, reason: 'wait', wait };
    if (!dek || !keys || !keys.pass) return { ok: false, reason: 'nopass' };
    try { const d = unwrapPass(keys, pin); if (d.equals(dek)) { fails = 0; waitUntil = 0; return { ok: true }; } return failed(); }
    catch (e) { if (e && e.code === 'DEVICE') return { ok: false, reason: 'device' }; return failed(); }
  }

  /** make sure there is a key whenever encryption is possible (device available, or a passcode was set) */
  function ensureKey() {
    if (dek) return true;
    if (!devOk()) return false;
    const d = crypto.randomBytes(32);
    adopt(d, { device: b64(device.encrypt(d)) });
    log.info('vault: new data key (device protected)');
    return true;
  }
  /** turn on (or change) the passcode. Returns { recoveryKey } when a new recovery key was made (show it once). */
  function setPasscode(pin, { newRecovery = false } = {}) {
    if (!/^\d{4,8}$/.test(String(pin))) throw vErr('BADPIN', 'Use 4 to 8 digits');
    if (!dek) { const d = crypto.randomBytes(32); adopt(d, {}); log.info('vault: new data key (passcode protected)'); }
    const next = { pass: wrapPass(pin) };
    let recoveryKey = null;
    if (keys && keys.rec && !newRecovery) next.rec = keys.rec;
    else { recoveryKey = makeRecoveryKey(); next.rec = wrapRec(recoveryKey); }
    keys = next; fails = 0; waitUntil = 0;
    return { recoveryKey };
  }
  function newRecoveryKey() {
    if (!dek || !keys) throw vErr('LOCKED');
    const recoveryKey = makeRecoveryKey();
    keys = { ...keys, rec: wrapRec(recoveryKey) };
    return { recoveryKey };
  }
  /** passcode off: back to device protection (or plain JSON where the OS offers no protection) */
  function clearPasscode() {
    if (!dek) return;
    if (devOk()) keys = { device: b64(device.encrypt(dek)) };
    else { dek = null; keyId = null; keys = null; }
  }

  /** plaintext JSON text -> what goes on disk */
  function encode(text) {
    if (!dek && keys) throw vErr('LOCKED', 'Penny is locked'); // never write plain text over an encrypted file
    if (!dek) return text; // no protection available on this system and no passcode: plain JSON as before
    const e = gcmEncrypt(dek, Buffer.from(text, 'utf8'));
    return JSON.stringify({ pennyVault: VAULT_VERSION, keyId, keys, iv: e.iv, tag: e.tag, data: e.ct });
  }
  /** disk text -> plaintext JSON text. Throws {code:'LOCKED'} if the key is not available. */
  function decode(text) {
    const v = peek(text);
    if (!v) return text;
    let key = known.get(v.keyId) || null;
    if (!key && v.keys.device && devOk()) { try { const d = unwrapDevice(v.keys); if (keyIdOf(d) === v.keyId) key = d; } catch {} }
    if (!key) throw vErr('LOCKED', 'This file is encrypted and Penny is locked');
    return gcmDecrypt(key, { iv: v.iv, tag: v.tag, ct: v.data }).toString('utf8');
  }

  function status() {
    return {
      encrypted: !!dek,
      mode: !dek ? 'plain' : keys && keys.pass ? 'passcode' : 'device',
      recovery: !!(keys && keys.rec),
      deviceAvailable: devOk()
    };
  }
  /** files written with the current keys? (false after a passcode change: rewrite them) */
  const current = text => { const v = peek(text); if (!dek) return !v; return !!v && v.keyId === keyId && JSON.stringify(v.keys) === JSON.stringify(keys); };

  return { peek, open, describe, unlockPasscode, unlockRecovery, verifyPasscode, ensureKey, setPasscode, newRecoveryKey, clearPasscode, encode, decode, status, current, isLocked: () => !dek && !!keys };
}


module.exports = { createStore, saveable, loadable, meaningful, createVault, makeRecoveryKey, normRecovery, VAULT_VERSION };
