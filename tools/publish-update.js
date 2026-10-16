#!/usr/bin/env node
// Builds a signed update from the current source tree.
//   node tools/publish-update.js [outDir] [--notes "What's new"] [--feed https://host/path/latest.json]
// Output: <outDir>/penny-app-<version>.pkg  +  <outDir>/latest.json   → upload BOTH to your host (e.g. a GitHub Release).
// Bump "version" in package.json first. Users' installed Penny finds and applies it automatically.
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const get = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : ''; };
const out = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || path.join(root, 'release'));
const notes = get('--notes');
const shell = +get('--shell') || 1;
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const files = {};
const add = rel => { files[rel] = fs.readFileSync(path.join(root, rel)).toString('base64'); };
['main.js', 'preload.js', 'store.js', 'log.js', 'license.js', 'updater.js', 'package.json', 'license-public.pem', 'update-public.pem', 'update-config.json'].forEach(add);
for (const d of ['renderer', 'renderer/locales', 'assets']) for (const n of fs.readdirSync(path.join(root, d))) if (fs.statSync(path.join(root, d, n)).isFile()) add(d + '/' + n);   // locales is a sub-folder: list it explicitly
const pkg = zlib.gzipSync(Buffer.from(JSON.stringify({ version, files })), { level: 9 });
const sha = crypto.createHash('sha256').update(pkg).digest('hex');
const sig = crypto.sign(null, Buffer.from(`penny-app\n${version}\n${sha}`), fs.readFileSync(path.join(__dirname, 'update-private-key.pem'))).toString('base64');
fs.mkdirSync(out, { recursive: true });
const name = `penny-app-${version}.pkg`;
fs.writeFileSync(path.join(out, name), pkg);
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify({ version, url: name, sha256: sha, sig, size: pkg.length, shell, notes, date: new Date().toISOString() }, null, 2));
console.log(`Penny ${version}: ${name} (${(pkg.length / 1024).toFixed(0)} KB) + latest.json → ${out}`);
