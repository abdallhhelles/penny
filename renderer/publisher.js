'use strict';
/* =========================================================================
   Publisher details - the ONE place to edit. Everything that names the publisher reads from here:
   the About page, EULA, Privacy Notice, Help, tray, installer text (installer/LICENSE.txt and PRIVACY.txt are generated
   from this file by tools/make-docs.js), package.json author and the window/app ids.
   Fill in the empty fields, then run:  node tools/release-check.js   (it lists anything still missing)
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PUBLISHER = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return Object.freeze({
    name: 'Akrot',                    // publisher / data controller shown to users
    product: 'Penny',
    appId: 'com.akrot.penny',         // Windows AppUserModelID (notifications, taskbar). Was com.penny.app before 1.7.0.
    // ---- REQUIRED before public release (left empty on purpose: they were not provided) ----
    supportUrl: 'https://github.com/abdallhhelles/penny/issues', // e.g. https://akrot.example/penny/support   (https only)
    supportDiscord: 'akrott',         // Discord username for support and privacy requests (provided by the publisher)
    updateRepo: 'abdallhhelles/penny',                 // GitHub repository that hosts the signed update files, as owner/name (e.g. akrot/penny). The repo's Releases must be public. Penny then checks https://github.com/<owner>/<name>/releases/latest/download/latest.json
    discordInvite: 'https://discord.gg/r5kNGC6p29',                // Discord server invite, https only (e.g. https://discord.gg/xxxx). Paste it here when the server exists; About then shows an Open button.
    supportEmail: '',                 // support + privacy requests, e.g. privacy@akrot.example
    website: 'https://github.com/abdallhhelles/penny',            // optional, https only
    postalAddress: '',                // registered address of the controller (needed for GDPR-style notices)
    governingLaw: '',                 // e.g. "the laws of England and Wales"
    // ---- document versions ----
    eulaVersion: '1.1.0',
    privacyVersion: '1.2.0',
    docsDate: '2026-10-16',
    // ---- privacy facts (these describe how the app actually behaves) ----
    retention: { dailyBackups: 14, beforeChangeBackups: 20, preMigrationBackups: 8, manualBackups: 30, logFiles: 2, logMaxMB: 1 }
  });
});
