'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createVault, createAttachments, attExt } = require('../store');

function fakeDevice(secret = 'pc-1') {
  const k = crypto.createHash('sha256').update(secret).digest();
  return {
    available() { return true; },
    encrypt(b) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv); const ct = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]); },
    decrypt(b) { const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); }
  };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'penny-att-'));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a80000000049454e44ae426082', 'hex');

test('attachments: only documents and images are accepted', () => {
  assert.strictEqual(attExt('receipt.JPG'), 'jpg');
  assert.strictEqual(attExt('scan.pdf'), 'pdf');
  for (const bad of ['setup.exe', 'run.bat', 'x.js', 'page.html', 'noext', 'a.pdf.exe']) assert.strictEqual(attExt(bad), null, bad);
  const a = createAttachments(tmp(), createVault({ device: fakeDevice() }));
  assert.throws(() => a.save('virus.exe', Buffer.from('MZ')), e => e.code === 'TYPE');
  assert.throws(() => a.save('big.pdf', Buffer.alloc(20 * 1024 * 1024 + 1)), e => e.code === 'SIZE');
  assert.throws(() => a.read('../../etc/passwd'), e => e.code === 'BAD_ID');
});

test('attachments: encrypted at rest and read back byte for byte', () => {
  const dir = tmp(), v = createVault({ device: fakeDevice() }); v.ensureKey();
  const a = createAttachments(dir, v);
  const m = a.save('Receipt: Trader/Joe’s.png', PNG);
  assert.match(m.id, /^[a-f0-9]{24}$/); assert.strictEqual(m.ext, 'png'); assert.strictEqual(m.size, PNG.length);
  assert.ok(!/[\\/:]/.test(m.name), 'file name is made safe');
  const raw = fs.readFileSync(path.join(dir, 'attachments', m.id + '.att'), 'utf8');
  assert.ok(raw.includes('pennyVault') && !raw.includes(PNG.toString('base64')), 'nothing readable on disk');
  const r = a.read(m.id);
  assert.ok(r.bytes.equals(PNG)); assert.strictEqual(r.type, 'image/png');
});

test('attachments: a locked vault refuses to write, other PCs cannot read', () => {
  const dir = tmp(), v = createVault({ device: fakeDevice() }); v.ensureKey();
  const m = createAttachments(dir, v).save('a.pdf', Buffer.from('%PDF-1.4 hello'));
  const other = createVault({ device: fakeDevice('someone-else') });
  assert.throws(() => createAttachments(dir, other).read(m.id));
});

test('attachments: passcode change re-encrypts files with the new keys', () => {
  const dir = tmp(), v = createVault({ device: fakeDevice() }); v.ensureKey();
  const a = createAttachments(dir, v), m = a.save('a.txt', Buffer.from('hello'));
  v.setPasscode('2468'); a.rewriteAll();
  const raw = fs.readFileSync(path.join(dir, 'attachments', m.id + '.att'), 'utf8');
  assert.ok(v.current(raw), 'written with the current keys');
  assert.strictEqual(a.read(m.id).bytes.toString(), 'hello');
});

test('attachments: clean-up keeps referenced and recent files', () => {
  const dir = tmp(), v = createVault({ device: fakeDevice() }); v.ensureKey();
  const a = createAttachments(dir, v);
  const keep = a.save('keep.pdf', Buffer.from('1')), old = a.save('old.pdf', Buffer.from('2')), fresh = a.save('fresh.pdf', Buffer.from('3'));
  const past = Date.now() / 1000 - 40 * 86400;
  for (const m of [keep, old]) fs.utimesSync(path.join(dir, 'attachments', m.id + '.att'), past, past);
  assert.strictEqual(a.gc([keep.id]), 1);
  assert.ok(a.read(keep.id) && a.read(fresh.id));
  assert.throws(() => a.read(old.id), e => e.code === 'MISSING');
});
