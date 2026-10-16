#!/usr/bin/env node
/* Release gate. Run before publishing:  node tools/release-check.js   (exit 1 = do not ship)
   Add --allow-missing-contact to build a TEST installer while the publisher contact fields are still empty. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const P = require(path.join(root, 'renderer', 'publisher.js')), L = require(path.join(root, 'renderer', 'legal.js'));
const pkg = JSON.parse(rd('package.json')), allowContact = process.argv.includes('--allow-missing-contact');
const errors = [], warns = [];
const need = (cond, msg, soft) => { if (!cond) (soft ? warns : errors).push(msg); };

// 1. publisher details (these were never supplied; they are the only manual step left)
need(/^https:\/\/\S+$/.test(P.supportUrl) || /^\S+@\S+\.\S+$/.test(P.supportEmail) || /^[\w.]{2,32}$/.test(P.supportDiscord || ''), 'renderer/publisher.js: no support contact (set supportDiscord, supportEmail or supportUrl)', allowContact);
need(!!P.postalAddress, 'renderer/publisher.js: postalAddress is empty (the Privacy Notice names the controller)', allowContact);
need(!!P.governingLaw, 'renderer/publisher.js: governingLaw is empty (EULA section 10)', allowContact);
// 2. versions in sync
const brand = (rd('renderer/icons.js').match(/version:'([\d.]+)'/) || [])[1];
need(brand === pkg.version, `version mismatch: package.json ${pkg.version} vs icons.js BRAND ${brand}`);
for (const f of ['installer/nsis/penny.nsi', 'installer/build_exe.sh']) if (fs.existsSync(path.join(root, f))) need(!/\b1\.[0-6]\.\d\b/.test(rd(f).replace(/38\.8\.6/g, '')), `${f}: contains an old version number`);
// 3. identity
need(pkg.author === P.name, `package.json author "${pkg.author}" should be "${P.name}"`);
need(pkg.build.appId === P.appId, 'package.json build.appId differs from publisher.js appId');
need(P.appId === 'com.akrot.penny', 'appId is not the Akrot id');
need(fs.readFileSync(path.join(root, 'main.js'), 'utf8').includes('PUB.appId'), 'main.js does not take APP_ID from publisher.js');
// 4. generated legal files are current and clean
const crlf = s => s.replace(/\r?\n/g, '\r\n');
need(rd('installer/LICENSE.txt') === crlf(L.eula(P)), 'installer/LICENSE.txt is stale: run  node tools/make-docs.js');
need(rd('installer/PRIVACY.txt') === crlf(L.privacy(P)), 'installer/PRIVACY.txt is stale: run  node tools/make-docs.js');
for (const f of ['installer/LICENSE.txt', 'installer/PRIVACY.txt']) need(!/NOTE TO (THE )?PUBLISHER|\(TEMPLATE\)|TODO|\[\[/i.test(rd(f)), `${f}: still has template wording`);
// 5. leftovers of old names in shipped code (Lumivault is allowed only in the data-migration code)
const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
for (const f of [...walk('renderer'), 'main.js', 'preload.js', 'updater.js', 'store.js', 'bootstrap.js'].filter(f => /\.(js|html|json|css)$/.test(f))) {
  const t = rd(f); if (/com\.penny\.app/.test(t) && f !== path.join('renderer', 'publisher.js')) errors.push(`${f}: old app id com.penny.app`);
  if (/lumivault/i.test(t) && !['main.js', path.join('renderer', 'core.js'), path.join('renderer', 'transfer.js')].includes(f)) errors.push(`${f}: mentions Lumivault`);
}
// 6. assets
for (const f of ['assets/icon.ico', 'assets/icon.png', 'assets/tray-light.png', 'assets/tray-dark.png', 'assets/tray-light@2x.png', 'assets/tray-dark@2x.png', 'installer/nsis/sidebar.bmp', 'installer/nsis/header.bmp', 'renderer/logo-mark.js']) need(fs.existsSync(path.join(root, f)), `missing ${f} (run python3 brand/build_brand.py)`);
warns.forEach(w => console.log('WARN  ' + w)); errors.forEach(e => console.log('ERROR ' + e));
console.log(errors.length ? `\nrelease-check FAILED (${errors.length})` : `\nrelease-check OK${warns.length ? ` with ${warns.length} warning(s) - fill them in before a public release` : ''}`);
process.exit(errors.length ? 1 : 0);
