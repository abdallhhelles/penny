// Penny bootstrap — the tiny fixed entry point. It runs the newest verified app bundle:
// either the one installed by Setup, or a newer one the updater downloaded into %APPDATA%\Penny\updates.
// A failed start of an updated bundle is detected on the next launch and rolled back automatically.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

global.__PENNY_SHELL_API = 1; // bump only if bundles need a newer bootstrap/runtime (then a full installer is required)
const root = path.join(app.getPath('appData'), 'Penny', 'updates');
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; };
const rm = p => { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} };
let entry = path.join(__dirname, 'main.js');
global.__PENNY_BOOT_OK = () => { rm(path.join(root, 'booting.json')); };

try {
  const bundled = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
  const curF = path.join(root, 'current.json'), bootF = path.join(root, 'booting.json');
  if (fs.existsSync(bootF)) { // last start of an updated bundle never finished -> roll back
    rm(curF); try { fs.readdirSync(root).filter(n => /^v\d/.test(n)).forEach(n => rm(path.join(root, n))); } catch {}
    rm(bootF);
  } else if (fs.existsSync(curF)) {
    const cur = JSON.parse(fs.readFileSync(curF, 'utf8'));
    const dir = path.join(root, String(cur.dir || ''));
    if (/^v\d+\.\d+\.\d+$/.test(cur.dir) && cmp(cur.version, bundled) > 0 && fs.existsSync(path.join(dir, 'main.js'))) {
      fs.writeFileSync(bootF, JSON.stringify({ version: cur.version, t: Date.now() }));
      entry = path.join(dir, 'main.js');
    } else if (cmp(cur.version, bundled) <= 0) { // Setup installed something newer/equal: drop stale updates
      rm(curF); try { fs.readdirSync(root).filter(n => /^v\d/.test(n)).forEach(n => rm(path.join(root, n))); } catch {}
    }
  }
} catch {}
global.__PENNY_ENTRY = entry;
require(entry);
