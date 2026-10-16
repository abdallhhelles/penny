// Offline license verification (Ed25519). The PRIVATE key never ships with the app (tools/private-key.pem).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'license-public.pem'), 'utf8');
const b64u = {
  dec: s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
};
function verifyKey(key) {
  try {
    const k = String(key || '').trim().replace(/\s+/g, '');
    if (!k.startsWith('PENNY-')) return { ok: false, reason: 'format' };
    const [p, s] = k.slice(6).split('.');
    if (!p || !s) return { ok: false, reason: 'format' };
    const payloadBuf = b64u.dec(p);
    const good = crypto.verify(null, payloadBuf, PUBLIC_KEY, b64u.dec(s));
    if (!good) return { ok: false, reason: 'signature' };
    const payload = JSON.parse(payloadBuf.toString('utf8'));
    if (payload.v !== 1 || !payload.plan) return { ok: false, reason: 'format' };
    if (payload.expires && Date.now() > Date.parse(payload.expires)) return { ok: false, reason: 'expired', payload };
    return { ok: true, payload };
  } catch { return { ok: false, reason: 'format' }; }
}
module.exports = { verifyKey };
