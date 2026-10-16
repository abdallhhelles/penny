# Updating Penny from GitHub Releases

Installed Penny checks `https://github.com/abdallhhelles/penny/releases/latest/download/latest.json` about 12 seconds after launch and then every 6 hours (Settings › Updates & help › *Update automatically*). It downloads the small app bundle with live progress, checks its SHA-256 and its **Ed25519 signature** (made with your private update key), stages it, and offers **Restart now**. Nobody who can write to the repo but lacks your private key can push code to users. If an updated version fails to start, Penny rolls back by itself.

The repository and its **Releases must be public**: the app sends no credentials.

## One-time setup
1. Make the repository public (GitHub › Settings › General › Danger Zone › Change visibility).
2. Add your signing key as a secret: GitHub › Settings › Secrets and variables › Actions › **New repository secret**
   - Name: `UPDATE_PRIVATE_KEY`
   - Value: the full contents of `tools/update-private-key.pem` (including the BEGIN/END lines)
3. Keep `tools/update-private-key.pem` on your computer only, with an offline backup. It is in `.gitignore`. If it is ever lost, installed copies can no longer be updated in-app (they would need a new installer with a new public key).

`renderer/publisher.js` already has `updateRepo: 'abdallhhelles/penny'`. Settings › Updates › *Update address* can still override it.

## Each release (automatic)
1. Bump `version` in `package.json` and `BRAND.version` in `renderer/icons.js`.
2. Write the notes users will see in `docs/RELEASE-<version>.md` (a short bullet list works best).
3. Commit, then tag and push:
   ```
   git tag v1.9.0
   git push origin v1.9.0
   ```
4. The **Release** workflow (`.github/workflows/release.yml`) runs the tests, the translation check and the release gate, builds and signs `penny-app-<version>.pkg` + `latest.json`, and publishes the GitHub Release. Installed copies find it on their next check.

## Each release (by hand, if you prefer)
`tools/publish-github.sh abdallhhelles/penny "What's new"` (needs the GitHub CLI signed in and the key in `tools/`).

## Good to know
- Only the app layer (screens, logic, translations) updates this way. A new Electron runtime, or a change that bumps the "shell" number, needs the full installer: build it with `installer/build_exe.sh`, attach it to the release, and publish the bundle with `--shell <n> --installer-url <link to the .exe>`. The app then shows **Get the installer**.
- Rollback: publish a higher version number with the fix.
- Prereleases and drafts are ignored by `latest`.
- Until the first release exists, the app reports "up to date" (GitHub answers 404), never an error.
- Installed **1.8.0** copies were built without an update address, so they won't find updates on their own. Users need to install 1.9 once (or paste the address above into Settings › Updates › Update address). From 1.9 on, updates arrive automatically.
