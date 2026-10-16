# Suggested next steps (after 1.9)

Ordered by impact for a global audience. None of these are built yet.

## Reach more people
1. **More languages.** French, German, Portuguese (Brazil), Turkish, Hindi, Indonesian, Chinese (Simplified) and Urdu cover most of the world's PC users. The i18n system already supports drop-in files and right-to-left.
2. **Translate the remaining hard-coded English.** A few older screens (export/import sheet in `transfer.js`, tips in `guide.js`, some report-adjacent labels) still build English text directly.
3. **Code-sign the installer** (Azure Trusted Signing or an OV certificate). Unsigned installers trigger SmartScreen warnings, which scare many first-time users.
4. **macOS and Linux builds.** Electron already runs there; the vault falls back gracefully without DPAPI (macOS Keychain works through the same `safeStorage` API).

## Trust & safety
5. **Windows Hello unlock** (fingerprint / face) as an alternative to the passcode, keeping the passcode + recovery key as fallback.
6. **Encrypted backup to a folder of your choice** (USB drive, OneDrive folder) on a schedule — the files are already encrypted, so this is mostly a copy job.
7. **Fill the legal fields** (`postalAddress`, `governingLaw`, `supportEmail` in `renderer/publisher.js`) so the release gate passes without `--allow-missing-contact`.

## Smarter money features
8. **Receipt and statement OCR** (on-device) to add transactions from a photo or PDF.
9. **Cash-flow forecast alerts:** "at this pace you'll be short on the 27th" as a notification.
10. **Shared household mode:** two people, one encrypted file on a shared drive, with per-person categories.
11. **Zakat / tax helpers by country** (zakat for the Arabic audience, simple tax-year summaries) — opt-in, clearly labelled as estimates.
12. **Subscription audit:** list every recurring charge with a "cancel" checklist and total yearly cost.
13. **Goals with milestones and auto-transfer suggestions** based on safe-to-spend.

## Product polish
14. **Accessibility audit with NVDA/Narrator** on the new tour and update sheet; high-contrast theme.
15. **Opt-in crash reports** (local file the user can choose to send) to fix problems faster without breaking the privacy promise.
16. **Release channels** (stable / beta) using GitHub prereleases and a toggle in Settings.
