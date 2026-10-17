#!/bin/bash
# Builds Penny-Setup-<version>.exe with NSIS (works on Linux, no Wine needed).
# Needs the electron-builder NSIS cache (see docs/BUILD.md). Usage: bash installer/build_exe.sh [outdir] [--allow-missing-contact]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTDIR="$ROOT/dist-exe"; ALLOW=""
for a in "$@"; do case "$a" in --allow-missing-contact) ALLOW="--allow-missing-contact";; *) OUTDIR="$a";; esac; done
N=$(ls -d $HOME/.cache/electron-builder/nsis-3.0.4.1/*/ | head -1)
PLUG=$(ls -d $HOME/.cache/electron-builder/nsis-resources-3.4.1/*/plugins/x86-unicode | head -1)
SHA=1c9319bab793492715f7668e0be0e6a30bf2a8577275e40035bd33601bf6f573   # electron-v44.8.0-win32-x64.zip (matches the official SHASUMS256.txt)
mkdir -p "$OUTDIR" && OUTDIR="$(cd "$OUTDIR" && pwd)"
node "$ROOT/tools/make-docs.js"
node "$ROOT/tools/release-check.js" $ALLOW
VER=$(node -p "require('$ROOT/package.json').version")
PUB=$(node -p "require('$ROOT/renderer/publisher.js').name")
YEAR=$(date +%Y)
WORK=$(mktemp -d); mkdir -p "$WORK/app/assets" "$OUTDIR"
python3 - <<PY
import json
p=json.load(open("$ROOT/package.json"))
for k in ("scripts","devDependencies","build"): p.pop(k,None)
json.dump(p,open("$WORK/app/package.json","w"),indent=2)
PY
cd "$ROOT"
cp bootstrap.js main.js preload.js store.js log.js license.js updater.js license-public.pem update-public.pem update-config.json "$WORK/app/"
cp -r renderer "$WORK/app/" && cp assets/icon.png assets/icon.ico assets/tray-*.png "$WORK/app/assets/"
cp installer/nsis/sidebar.bmp installer/nsis/header.bmp installer/LICENSE.txt installer/PRIVACY.txt "$WORK/" && cp assets/icon.ico "$WORK/icon.ico"
RC="$ROOT/node_modules/electron-winstaller/vendor/rcedit.exe"   # rcedit 1.x (MIT), stamps the icon onto Penny.exe at install time
echo "e2df7b664db830f159d0dc6b3da8a95442cca175b9577f2d19952646d37ac32f  $RC" | sha256sum -c --quiet - || { echo "rcedit.exe missing or changed (run npm ci)"; exit 1; }
cp "$RC" "$WORK/rcedit.exe"
OUT="$OUTDIR/Penny-Setup-$VER.exe"
SUPPORT=""
SURL=$(node -p "require('$ROOT/renderer/publisher.js').supportUrl")
[ -n "$SURL" ] && SUPPORT="WriteRegStr HKCU \"\${UNINST_KEY}\" \"HelpLink\" \"$SURL\""
sed -e "s#__SHA__#$SHA#" -e "s#__PLUGINS__#$PLUG#" -e "s#__OUT__#$OUT#" -e "s#__ICON__#$WORK/icon.ico#g" \
    -e "s#__LICENSE__#$WORK/LICENSE.txt#g" -e "s#__PRIVACY__#$WORK/PRIVACY.txt#g" -e "s#__APPDIR__#$WORK/app#g" \
    -e "s#__VERSION__#$VER#g" -e "s#__PUBLISHER__#$PUB#g" -e "s#__YEAR__#$YEAR#g" -e "s#__SUPPORT_REG__#$SUPPORT#" \
    installer/nsis/penny.nsi > "$WORK/penny.nsi"
cd "$WORK"
NSISDIR="$N" NSISCONFDIR="$N" "$N/linux/makensis" -V2 penny.nsi
ls -lh "$OUT"
