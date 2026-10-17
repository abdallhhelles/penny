# How Penny protects your data (1.9)

Penny keeps everything on your PC. There is no account, no cloud and no analytics. Since 1.9 the data is also encrypted at rest.

## What is encrypted
`%APPDATA%\Penny\penny-data.json`, the last-good copy, and every file in `backups\`. Logs never contain amounts, payees or notes, and are not encrypted. `system.json` and `window.json` hold only window and Windows options.

## How
- A random 256-bit **data key** encrypts each file with **AES-256-GCM** (authenticated: a tampered file is rejected, never half-read).
- The data key is never written in the clear. It is wrapped by:
  - **Windows account (DPAPI)** via Electron `safeStorage` — automatic, used when no passcode is set.
  - **Passcode** — a key derived with **scrypt** (N=2^15, r=8, p=1) from the passcode, and that wrapped key is *also* DPAPI-protected, so guessing a passcode offline additionally needs this Windows account. Replaces the Windows-only wrap when a passcode is set.
  - **Recovery key** — 160 random bits shown once as 32 characters (no I/O/0/1). Not tied to the PC, so it opens the data on a new computer or after Windows is reinstalled.
- Each file carries its own wrapped keys, so a single backup can be opened on its own.
- Wrong passcodes are slowed down after 5 tries (exponential wait, up to 5 minutes).
- The renderer (the UI) never sees a key: unlocking, encrypting and decrypting happen in the main process (`store.js`, `createVault`).

## What it protects against
| Situation | Protected? |
|---|---|
| Someone copies your Penny folder or a backup to another PC | Yes |
| A cloud-sync tool or backup service uploads the folder | Yes (encrypted files) |
| Someone signed in to your Windows account, no passcode set | No — set a passcode |
| Someone signed in to your Windows account, passcode set | Yes, while Penny is locked or closed |
| Malware running as you while Penny is unlocked | No (no desktop app can promise this) |

## Moving to a new PC
Use **Settings › Data & backups › Export** with *Protect with a password* on, then **Import** on the new PC. Or copy the folder and unlock with your recovery key (passcode users).

## Upgrading from 1.8
- On first launch, existing plain files (data, last-good, backups) are rewritten encrypted, one at a time and atomically. A file that can't be read is left untouched.
- A passcode set in 1.8 starts encrypting the data the first time you unlock, and Penny shows you a recovery key once.
- Systems without OS protection (Linux without a keyring) keep plain files unless a passcode is set.

## Reporting a vulnerability
Please open a private report through GitHub (Security › Report a vulnerability) or contact the publisher on Discord (`akrott`). Don't post details publicly until a fix ships.

## Attachments
Receipts and files attached to transactions are stored in the `attachments` folder next to your data, one file each, encrypted with the same key as your data (AES-256-GCM). Only images, PDFs and office/text documents are accepted, so nothing runnable is stored. Opening a non-image file decrypts a temporary copy into a private temp folder for your usual app; that folder is emptied when Penny starts and quits. Files no transaction refers to are deleted after 30 days. JSON exports and backups contain the references, not the files themselves.
