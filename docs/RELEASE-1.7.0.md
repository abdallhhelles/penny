# Penny 1.7.0 — release notes, publisher setup and Windows test steps

Publisher: **Akrot** · Data folder unchanged: `%APPDATA%\Penny` · Data format: schema 3 (migrates from 1.6.x automatically, with a backup first)

## 0. Before you publish (the only manual steps)

1. **Publisher details.** Open `renderer/publisher.js` and fill in `supportUrl` (https), `supportEmail`, `postalAddress`, `governingLaw`. They were never supplied, so they are empty. Nothing is invented.
2. `node tools/release-check.js` must print `release-check OK` with no warnings. (`--allow-missing-contact` builds a *test* installer only — that is what `Penny-Setup-1.7.0.exe` was built with.)
3. `bash installer/build_exe.sh` rebuilds the installer. It regenerates `installer/LICENSE.txt` and `PRIVACY.txt` from `renderer/legal.js` + `publisher.js`, so the app, the installer and package.json cannot disagree.
4. **Have a lawyer read** `renderer/legal.js` (EULA 1.1 and Privacy Notice). They are complete, plain-language and match what the app really does, but they are not legal advice.
5. **Logo.** The description you mentioned never arrived, so the mark is a placeholder: a flat coin ring with a rising peak. To swap it, edit `MARK_PATHS` in `brand/build_brand.py` and run `python3 brand/build_brand.py`; it regenerates `assets/icon.ico/png`, `assets/tray-light|dark(@2x).png`, installer bitmaps, `brand/*.svg` and `renderer/logo-mark.js`.
6. **Signing keys.** The update-signing and license-signing private keys (`tools/*.pem`) were lost with the earlier workspace reset. `update-public.pem` in this build is the same public key as 1.6.1, so over-the-air updates only work if you still have the matching private key. Otherwise ship 1.7.0 as a full installer and generate a new keypair for the next release.

## 1. What changed

**Finance accuracy** — each account has its own currency; totals convert at the rates you type (Settings → Language & money) and a missing rate is flagged, never guessed · net-worth history snapshots · 50/30/20, savings rate, 6-month emergency fund, debt-to-income, housing ratio (Money Health) · rolling budgets (carry-over of surplus/overspend) · split transactions · future-date and likely-duplicate guards · investment XIRR and loan amortization · recurring payments detected from history · import wizard for CSV / TSV / OFX / QFX (column mapping, date order, flip signs, duplicate skip by bank ID or amount/payee/date, skipped-rows report, safety backup, one-step Undo).

**Insights** — forecast uses the median and weekday/seasonal factors, drops outliers, and shows an 80 % range with a confidence label · a **?** beside each number opens *Formula · Inputs · Benchmark and source*.

**Akrot identity** — publisher, About page, tray (monochrome glyph that follows the Windows light/dark taskbar; tray menu has About), AppUserModelId `com.akrot.penny`, package.json author, installer publisher/version info, support link when set.

**Official pages** — About, Help (11 topics, en/es/ar), Keyboard shortcuts, EULA 1.1 (final), Privacy Notice (controller, contact, retention, deletion), open-source notices. "NOTE TO PUBLISHER" and "(TEMPLATE)" are gone; `release-check` blocks them.

**Quality** — schema migrations (v2→v3), crypto-random `uid()`, schema tests for core / smart / rules-engine / transfer, keyboard access for every clickable card, dialog roles + focus trap + focus return, labelled inputs, polite toast announcements, keyboard focus rings, empty states.

Fixes found while testing: the Add-transaction sheet crashed on save (`splits` scope), split rows were not read on save, imports of split transactions now keep their parts, merge/import remaps split categories, damaged splits are repaired on import.

## 2. Files changed (against the 1.6.1 + Clean-style base)

See `Penny-1.7.0-diffs.patch` (unified diff, one section per file). New: `renderer/{finance,importers,import-wizard,explain,money,publisher,legal,docs,a11y,logo-mark}.js`, `installer/nsis/penny.nsi`, `tools/{make-docs,release-check}.js`, `tests/{schema.test.js,e2e_v17.py,e2e_identity.py,e2e_a11y.py,e2e_harness.py}`. Removed: `installer/nsis/lumivault.nsi`.

## 3. Test results (Linux, real Electron 38.8.6 under Xvfb)

| Suite | Result |
|---|---|
| `npm test` (finance, importers, schema, store/crash, i18n) | 48 / 48 |
| `e2e_v17` (wizard CSV+OFX, splits, guards, FX, explain panels, 1.6.1→1.7.0 upgrade) | 26 / 26 |
| `e2e_identity` (About, docs, tray assets, data folder) | 16 / 16 |
| `e2e_a11y` (keyboard, dialogs, empty states) | 16 / 16 |
| `e2e_features` (languages/RTL, settings, filters, bulk edit, phone layout) | 69 / 69 |
| `e2e_rules` | 27 / 27 |
| `npm run i18n:check` | OK (en 863 keys; es/ar drafts) |

Not covered: the earlier 61-check reliability suite (restart/crash/close behaviour) was lost with the workspace reset and has not been rebuilt; the features suite is the recovered version (69 checks, previously 101).

## 4. Windows test steps (needs a Windows 10/11 PC — none of this could run on Linux)

**Install and upgrade**
1. Run `Penny-Setup-1.7.0.exe` on a PC that has 1.6.1. SmartScreen will warn (the installer is unsigned): *More info → Run anyway*.
2. Setup should say "App runtime is already up to date – skipping download", keep the same folder, and show **Akrot** as publisher in Settings → Apps. Start menu/desktop shortcut still named Penny.
3. Open Penny: all data present. `%APPDATA%\Penny\backups\pre-migration-*.json` exists. Settings → About says *Version 1.7.0 · by Akrot · Data format 3*.
4. If Penny was pinned to the taskbar, unpin and pin again (the app id changed).

**Identity**
5. Tray icon: crisp at 100 % and 200 % scaling; switch Windows between light and dark taskbar (Settings → Personalization → Colors → *Choose your mode*) — the glyph flips. Right-click → *About Penny (Akrot)* opens Settings → About.
6. Task manager/Start menu icon is the new mark. Title bar and installer sidebar show the new logo.

**Money features** (use *Demo data* from a fresh profile to see everything)
7. Accounts → New → pick EUR on a USD profile → Money Health shows a "missing rate" notice; enter 1.10 in Settings → Language & money → totals update.
8. Add a transaction → **Split** → 70 + 20 on 100 refuses to save; 70 + 30 saves. Date in the future asks first. Re-entering the same payee/amount asks first.
9. Transactions → Import: a US-format CSV (check the date preview), a credit-card CSV with all-positive amounts (tick *Flip signs*), a bank `.ofx`/`.qfx`. Import the same file twice: the second shows 0 ready. Undo restores everything.
10. Insights: tap **?** beside Savings rate, Emergency fund, Debt-to-income, Forecast: formula, inputs, benchmark + source appear.

**Official pages**
11. Settings → About: Help, Keyboard shortcuts, Privacy notice, License agreement, Open-source notices all open; EULA/Privacy mention Akrot and contain no template wording. After you fill `publisher.js`, the Support row appears.
12. Uninstall from Settings → Apps: it offers to delete `%APPDATA%\Penny`; answer *No* first and check the data is kept.

**Keyboard**: Tab through Accounts → Enter opens an account; Esc closes it and focus returns to the card; Ctrl+K, N, P, Ctrl+L, Alt+1–9 as listed in Shortcuts.

## 5. Known limits

Electron 38 is past end of life (upgrade is on the roadmap) · the passcode is a privacy screen, not encryption · money is stored as floating-point numbers rounded to cents · Spanish and Arabic are drafts needing a native reviewer, and some screens are still English · Windows-only behaviour (tray, global hotkey, toast sounds, login item, installer run, update install) is untested here.
