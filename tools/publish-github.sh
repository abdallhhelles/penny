#!/usr/bin/env bash
# Publish a signed Penny update to GitHub Releases (run on YOUR computer: the signing key never leaves it).
#   tools/publish-github.sh owner/name "What's new in this version"
# Needs: node, the GitHub CLI (gh, already signed in: gh auth login) and tools/update-private-key.pem.
# Bump "version" in package.json first. The release must be PUBLIC for installed apps to download it.
set -euo pipefail
REPO="${1:?usage: publish-github.sh owner/name \"notes\"}"; NOTES="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
VER=$(node -p "require('./package.json').version")
OUT="$(mktemp -d)"
node tools/release-check.js
node tools/publish-update.js "$OUT" --notes "$NOTES"
gh release create "v$VER" "$OUT/penny-app-$VER.pkg" "$OUT/latest.json" --repo "$REPO" --title "Penny $VER" --notes "${NOTES:-Penny $VER}" --latest
echo "Published. Installed copies check: https://github.com/$REPO/releases/latest/download/latest.json"
