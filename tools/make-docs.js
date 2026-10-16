#!/usr/bin/env node
/* Generates installer/LICENSE.txt and installer/PRIVACY.txt from renderer/publisher.js + renderer/legal.js (single source of truth). */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const P = require(path.join(root, 'renderer', 'publisher.js')), L = require(path.join(root, 'renderer', 'legal.js'));
fs.mkdirSync(path.join(root, 'installer'), { recursive: true });
// NSIS license pages want Windows line endings
const crlf = s => s.replace(/\r?\n/g, '\r\n');
fs.writeFileSync(path.join(root, 'installer', 'LICENSE.txt'), crlf(L.eula(P)));
fs.writeFileSync(path.join(root, 'installer', 'PRIVACY.txt'), crlf(L.privacy(P)));
// keep package.json in step with the publisher
const pj = path.join(root, 'package.json'), pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
pkg.author = P.name; if (P.website) pkg.homepage = P.website; else delete pkg.homepage;
pkg.build = pkg.build || {}; pkg.build.appId = P.appId; pkg.build.copyright = `Copyright © ${new Date().getFullYear()} ${P.name}`;
fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + '\n');
console.log('docs written for', P.name);
