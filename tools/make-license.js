#!/usr/bin/env node
// Usage: node tools/make-license.js "Customer Name" [email] [expiresISO|lifetime]
// Prints a license key that Penny verifies offline. Keep tools/private-key.pem secret and OUT of the installer.
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const [name = 'Customer', email = '', exp = 'lifetime'] = process.argv.slice(2);
const priv = fs.readFileSync(path.join(__dirname, 'private-key.pem'), 'utf8');
const payload = Buffer.from(JSON.stringify({ v: 1, id: crypto.randomUUID(), plan: 'pro', name, email, issued: new Date().toISOString(), expires: exp === 'lifetime' ? null : exp }));
const b = x => x.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log('PENNY-' + b(payload) + '.' + b(crypto.sign(null, payload, priv)));
