'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createStore, createVault, makeRecoveryKey, normRecovery } = require('../store');

/* stand-in for Windows DPAPI: AES with a per-"Windows account" secret */
function fakeDevice(secret = 'pc-1', on = true) {
  const k = crypto.createHash('sha256').update(secret).digest();
  return {
    on, available() { return this.on; },
    encrypt(b) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv); const ct = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]); },
    decrypt(b) { const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); }
  };
}
const sample = () => ({ schema: 3, settings: { currency: 'USD' }, accounts: [{ id: 'a', name: 'Cash' }], categories: [], transactions: [{ id: 't1', amount: 12.5, note: 'coffee' }], goals: [], bills: [], reminders: [] });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'penny-vault-'));

test('recovery keys are 32 readable chars and normalise typos', () => {
  const k = makeRecoveryKey();
  assert.match(k, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/);
  assert.strictEqual(normRecovery(k.toLowerCase().replace(/-/g, ' ')), k.replace(/-/g, ''));
});

test('device mode: encrypts transparently, nothing readable on disk', () => {
  const v = createVault({ device: fakeDevice() });
  assert.ok(v.ensureKey());
  const disk = v.encode(JSON.stringify(sample()));
  assert.ok(!disk.includes('coffee'), 'plaintext leaked');
  assert.deepStrictEqual(JSON.parse(v.decode(disk)), sample());
  // a fresh process on the same Windows account opens it without asking
  const v2 = createVault({ device: fakeDevice() });
  assert.strictEqual(v2.open(disk), 'open');
  assert.deepStrictEqual(JSON.parse(v2.decode(disk)), sample());
  assert.strictEqual(v2.status().mode, 'device');
});

test('device mode on another PC is foreign, not damaged', () => {
  const v = createVault({ device: fakeDevice('pc-1') }); v.ensureKey();
  const disk = v.encode('{"a":1}');
  const other = createVault({ device: fakeDevice('pc-2') });
  assert.strictEqual(other.open(disk), 'foreign');
  assert.throws(() => other.decode(disk), e => e.code === 'LOCKED');
});

test('no OS protection and no passcode: plain JSON as before', () => {
  const v = createVault({ device: fakeDevice('x', false) });
  assert.strictEqual(v.ensureKey(), false);
  assert.strictEqual(v.encode('{"a":1}'), '{"a":1}');
  assert.strictEqual(v.status().mode, 'plain');
});

test('passcode: locked on launch, wrong code throttled, right code opens', () => {
  let t = 1e6;
  const dev = fakeDevice();
  const v = createVault({ device: dev }); v.ensureKey();
  const { recoveryKey } = v.setPasscode('482913');
  assert.ok(recoveryKey);
  const disk = v.encode(JSON.stringify(sample()));
  assert.ok(!disk.includes('"device"'), 'device-only key must be gone once a passcode is set');

  const v2 = createVault({ device: fakeDevice(), now: () => t });
  assert.strictEqual(v2.open(disk), 'locked');
  assert.ok(v2.isLocked());
  assert.throws(() => v2.encode('{}'), e => e.code === 'LOCKED');      // can never overwrite with plaintext while locked
  for (let i = 0; i < 5; i++) assert.strictEqual(v2.unlockPasscode(disk, '000000').ok, false);
  const r = v2.unlockPasscode(disk, '482913');
  assert.strictEqual(r.reason, 'wait');                                // throttled after 5 misses
  t += 3000;
  assert.strictEqual(v2.unlockPasscode(disk, '482913').ok, true);
  assert.deepStrictEqual(JSON.parse(v2.decode(disk)), sample());
  assert.strictEqual(v2.verifyPasscode('482913').ok, true);
  assert.strictEqual(v2.verifyPasscode('111111').ok, false);
});

test('passcode is also bound to the Windows account; recovery key works anywhere', () => {
  const v = createVault({ device: fakeDevice('pc-1') }); v.ensureKey();
  const { recoveryKey } = v.setPasscode('1234');
  const disk = v.encode(JSON.stringify(sample()));
  const other = createVault({ device: fakeDevice('pc-2') });
  assert.strictEqual(other.open(disk), 'locked');
  assert.strictEqual(other.unlockPasscode(disk, '1234').reason, 'device');
  assert.strictEqual(other.unlockRecovery(disk, 'AAAA-BBBB').ok, false);
  assert.strictEqual(other.unlockRecovery(disk, recoveryKey.toLowerCase()).ok, true);
  assert.deepStrictEqual(JSON.parse(other.decode(disk)), sample());
  assert.strictEqual(other.status().mode, 'device');                  // passcode dropped after recovery, ready for a new one
  const again = other.encode('{"b":2}');
  assert.strictEqual(createVault({ device: fakeDevice('pc-2') }).open(again), 'open');
});

test('passcode without OS protection (scrypt only)', () => {
  const v = createVault({ device: null });
  v.setPasscode('9876');
  const disk = v.encode('{"z":1}');
  const v2 = createVault({ device: null });
  assert.strictEqual(v2.open(disk), 'locked');
  assert.strictEqual(v2.unlockPasscode(disk, '9876').ok, true);
  assert.strictEqual(v2.decode(disk), '{"z":1}');
});

test('tampered file fails authentication', () => {
  const v = createVault({ device: fakeDevice() }); v.ensureKey();
  const o = JSON.parse(v.encode('{"amount":100}'));
  const d = Buffer.from(o.data, 'base64'); d[0] ^= 1; o.data = d.toString('base64');
  assert.throws(() => v.decode(JSON.stringify(o)));
});

test('store: plain files migrate to encrypted, backups included, nothing lost', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'penny-data.json'), JSON.stringify(sample()));
  fs.mkdirSync(path.join(dir, 'backups'));
  fs.writeFileSync(path.join(dir, 'backups', 'penny-2026-10-01.json'), JSON.stringify(sample()));
  const v = createVault({ device: fakeDevice() });
  const st = createStore(dir, undefined, v);
  assert.strictEqual(v.open(st.newestRaw()), 'plain');
  const d = st.load();
  assert.strictEqual(d.transactions[0].note, 'coffee');
  v.ensureKey();
  const r = st.rewriteAll();
  assert.strictEqual(r.done, 2);
  for (const f of ['penny-data.json', 'backups/penny-2026-10-01.json']) assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes('coffee'), f + ' still plain');
  assert.strictEqual(st.rewriteAll().done, 0);                         // idempotent
  assert.ok(st.save({ ...sample(), transactions: [...sample().transactions, { id: 't2', note: 'tea' }] }).ok);
  assert.ok(!fs.readFileSync(path.join(dir, 'penny-data.json'), 'utf8').includes('tea'));
  assert.strictEqual(st.load().transactions.length, 2);
  assert.strictEqual(st.listBackups()[0].valid, true);
  assert.ok(JSON.parse(st.readBackup('penny-2026-10-01.json')).accounts);
});

test('store: a locked file is reported as locked and never set aside as damaged', () => {
  const dir = tmp();
  const v = createVault({ device: fakeDevice() }); v.ensureKey(); v.setPasscode('2468');
  const st = createStore(dir, undefined, v);
  assert.ok(st.save(sample()).ok);
  const v2 = createVault({ device: fakeDevice() });
  const st2 = createStore(dir, undefined, v2);
  assert.strictEqual(v2.open(st2.newestRaw()), 'locked');
  assert.deepStrictEqual(st2.load(), { __locked: true });
  assert.ok(!st2.save(sample()).ok, 'must not save while locked');
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['penny-data.json']);
  assert.ok(v2.unlockPasscode(st2.newestRaw(), '2468').ok);
  assert.strictEqual(st2.load().accounts[0].name, 'Cash');
});

test('store: setting a passcode re-wraps old backups so none opens without it', () => {
  const dir = tmp();
  const v = createVault({ device: fakeDevice() }); v.ensureKey();
  const st = createStore(dir, undefined, v);
  st.save(sample()); st.save({ ...sample(), goals: [] }); st.snapshot('manual');
  v.setPasscode('1357');
  st.save(sample());
  st.rewriteAll();
  const all = [path.join(dir, 'penny-data.json'), ...fs.readdirSync(path.join(dir, 'backups')).map(n => path.join(dir, 'backups', n))];
  for (const f of all) assert.ok(!JSON.parse(fs.readFileSync(f, 'utf8')).keys.device, path.basename(f) + ' still opens with the device key alone');
});

test('store: recovery on a system without OS protection returns to plain files that open next time', () => {
  const dir = tmp();
  const v = createVault({ device: null }); const { recoveryKey } = v.setPasscode('1122');
  const st = createStore(dir, undefined, v); st.save(sample()); st.snapshot('manual');
  const v2 = createVault({ device: null }), st2 = createStore(dir, undefined, v2);
  assert.strictEqual(v2.open(st2.newestRaw()), 'locked');
  assert.ok(v2.unlockRecovery(st2.newestRaw(), recoveryKey).ok);
  assert.strictEqual(st2.load().accounts[0].name, 'Cash');
  st2.rewriteAll();
  const v3 = createVault({ device: null }), st3 = createStore(dir, undefined, v3);
  assert.strictEqual(v3.open(st3.newestRaw()), 'plain');
  assert.strictEqual(st3.load().accounts[0].name, 'Cash');
  assert.ok(st3.listBackups().every(b => b.valid));
});
