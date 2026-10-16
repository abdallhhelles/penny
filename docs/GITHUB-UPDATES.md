# Updating Penny from GitHub Releases

How it works: installed Penny downloads `latest.json` from your repository's newest release, checks the file's SHA-256 and its Ed25519 signature (made with your private update key), and only then stages the update for the next launch. Nobody who can write to the repo but lacks your private key can push code to users.

## One-time setup
1. Create a GitHub repository (it can hold only releases; the source can stay private, but **Releases must be public** so the app can download them without logging in).
2. Put `owner/name` in `renderer/publisher.js` as `updateRepo` (for example `akrot/penny`). Nothing else to configure; Settings > Updates can still override the address.
3. Install the GitHub CLI and sign in: `gh auth login`.
4. Keep `tools/update-private-key.pem` on the publishing computer only (and a backup offline).

## Each release
1. Bump `version` in `package.json`.
2. `tools/publish-github.sh owner/name "What's new"` (runs the release check, builds the signed `penny-app-X.Y.Z.pkg` plus `latest.json`, and creates the release).
3. Installed apps find it on their next check (Settings > Updates > Check now) and apply it at the next launch.

## Good to know
- The release gate (`tools/release-check.js`) must pass: fill in the publisher fields first.
- Only the app layer (screens, logic, translations) updates this way. A new Electron runtime, or a change that bumps the "shell" number, needs the new installer (the app then says so).
- Rollback: publish a higher version number with the fix; installed copies also roll back automatically if a new version fails to start.
- Prereleases and drafts are ignored by `latest`.
- Private repositories do not work for the in-app updater (it sends no credentials).
