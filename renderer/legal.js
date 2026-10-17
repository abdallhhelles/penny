'use strict';
/* =========================================================================
   Legal texts (English; the English text is the binding version). Plain functions of the PUBLISHER details, so the in-app
   pages and the installer files (tools/make-docs.js -> installer/LICENSE.txt, PRIVACY.txt) can never disagree.
   Contact lines appear only when the publisher has filled them in (renderer/publisher.js); tools/release-check.js blocks a
   release while they are empty.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LEGAL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const contact = P => [P.supportDiscord && `Discord: ${P.supportDiscord}`, P.supportEmail && `Email: ${P.supportEmail}`, P.supportUrl && `Support: ${P.supportUrl}`, P.website && `Website: ${P.website}`, P.postalAddress && `Address: ${P.postalAddress}`].filter(Boolean);
  const law = P => P.governingLaw ? `This agreement is governed by ${P.governingLaw}, without affecting any consumer rights you have under the law of the place where you live.` : 'Nothing in this agreement limits rights that the law of the place where you live gives you as a consumer.';

  function eula(P) {
    return `${P.product.toUpperCase()} END-USER LICENSE AGREEMENT
Version ${P.eulaVersion} · ${P.docsDate}

This agreement is between you and ${P.name} ("${P.name}", "we"), the publisher of ${P.product} ("the Software"). By installing or using the Software you accept it. If you do not accept it, do not install or use the Software.

1. License. ${P.name} grants you a personal, non-exclusive, non-transferable license to install and use the Software on devices you own or control, for your own personal finances.

2. Restrictions. You may not sell, rent, sublicense or redistribute the Software, remove notices from it, or reverse engineer or decompile it, except to the extent the law allows this despite this restriction. License keys are personal to you.

3. Your data stays with you. The financial information you enter is stored only on your device. ${P.name} does not receive, host or access it, and cannot recover it for you. You are responsible for your own backups; the Software keeps local backups for convenience only, and they are on the same device.

4. Not advice. The Software's insights, forecasts, ratios and benchmarks are general information. They are not financial, tax, investment or legal advice. Forecasts are estimates and can be wrong. Check important decisions with a qualified professional.

5. Updates. The Software can check a signed update address that you control in Settings and install signed updates. Updates may fix errors, change features or change this agreement; you will be told if the agreement changes materially and can stop using the Software at any time.

6. Third-party components. The Software includes open-source components, mainly Electron and Chromium, under their own licenses (MIT, BSD-style and others). Their license texts are included with the application files. Nothing in this agreement restricts your rights under those licenses.

7. No warranty. To the maximum extent the law allows, the Software is provided "as is" and ${P.name} gives no warranty of any kind, including fitness for a particular purpose and uninterrupted or error-free operation.

8. Liability. To the maximum extent the law allows, ${P.name} is not liable for indirect, incidental or consequential loss, or for lost data, profit or savings, arising from use of the Software. Nothing here excludes liability that cannot be excluded by law, including for death or personal injury caused by negligence, or for fraud.

9. Termination. This agreement ends automatically if you breach it. You may end it at any time by uninstalling the Software. Sections 3, 4, 7, 8 and 10 survive.

10. General. ${law(P)} If a part of this agreement is unenforceable, the rest stays in force. This is the whole agreement between you and ${P.name} about the Software.

Publisher: ${P.name}
${contact(P).join('\n') || ''}`.replace(/\n+$/, '') + '\n';
  }

  function privacy(P) {
    const r = P.retention;
    return `${P.product.toUpperCase()} PRIVACY NOTICE
Version ${P.privacyVersion} · ${P.docsDate}

Who is responsible. ${P.name} publishes ${P.product}. Your financial data never reaches ${P.name}: it is created and kept on your own device, so you control it. ${P.name} acts as the data controller only for what you choose to send us, for example a support email.
${contact(P).map(l => '  ' + l).join('\n')}

What ${P.product} stores, and where. Everything is on your PC, in %APPDATA%\\${P.product}:
  - penny-data.json: your accounts, transactions, budgets, goals, rules, reminders and settings;
  - backups\\: automatic copies of that file (kept: the latest ${r.dailyBackups} daily copies, ${r.beforeChangeBackups} "before a bulk change" copies, ${r.preMigrationBackups} "before an upgrade" copies and ${r.manualBackups} copies you made yourself);
  - system.json, window.json: window position and Windows options such as start-up and tray;
  - license.json: your license key, if you activated one;
  - logs\\: a diagnostic log of up to ${r.logFiles} rotating files of ${r.logMaxMB} MB. It records technical events, never amounts, payees or notes.
Encryption. On Windows, the data file and every backup are encrypted with AES-256-GCM using a random key that is protected by your Windows account (Windows DPAPI). If you set a passcode, that key is additionally locked with your passcode (scrypt key derivation), and a recovery key is shown to you once; ${P.name} never sees your passcode or recovery key and cannot recover your data without them. Exports are encrypted only if you choose a password when exporting.

What is sent over the network. Nothing about you or your money. ${P.product} has no accounts, analytics, advertising, crash reporting or cloud sync, and never asks for bank credentials.
  - Update check: ${P.product} downloads a small version file from GitHub Releases (github.com, run by GitHub, Inc.) about every six hours, and a newer signed bundle when one exists. GitHub can see your IP address and the request, as any web server can; no data about you or your money is sent. You can switch automatic checks off in Settings > Updates & help.
  - Setup downloads the open-source Electron runtime once from its public host. That request comes from your PC and carries no ${P.product} data.
  - Files you import or export are read and written only where you point them.

Why we handle it (legal basis). Because nothing is collected, there is nothing to rely on for the app itself. For support messages, we process what you send in order to answer you (legitimate interests / performing our agreement with you).

How long we keep it.
  - On your device: until you delete it (see below).
  - Support emails sent to ${P.name}: only as long as needed to resolve your request, then deleted, unless the law requires us to keep them longer.

Deleting your data. In ${P.product}: Settings > Data & backups > Erase everything (a safety backup is saved first). To remove it all from your PC: uninstall ${P.product}, choose to delete your data when asked, and delete the folder %APPDATA%\\${P.product} if anything remains. Because we hold no copy, deleting it on your device deletes it everywhere.

Your rights. Because ${P.name} holds none of your financial data, there is nothing for us to export, correct or erase on your behalf; you can do all of it in the app (Settings > Data & backups). For anything we do hold, such as a support email, you can ask us to access, correct or delete it, object to its use, or complain to your local data-protection authority.

Children. ${P.product} is a general-audience tool and is not directed at children.

Changes. If this notice changes materially, the new version ships with the update and the version number above changes.

Contact. ${contact(P).join('; ') || `${P.name}`}
`.replace(/\n{3,}/g, '\n\n');
  }

  function oss() {
    return `${'Penny'} includes open-source software.
- Electron (MIT License) - https://www.electronjs.org
- Chromium and its dependencies (BSD-style and other licenses) - https://www.chromium.org/chromium-os/licensing
- Sora typeface, Copyright 2019 The Sora Project Authors (https://github.com/sora-xor/sora-font), SIL Open Font License 1.1 (full text in assets/Sora-OFL.txt). Bundled for titles and amounts.
- rcedit, Copyright GitHub Inc. (https://github.com/electron/rcedit), MIT License. Used only by Setup to put the Penny icon and name on Penny.exe; it is not installed.
The full license texts of the bundled runtime are in the application folder (LICENSE and LICENSES.chromium.html).`;
  }
  return { eula, privacy, oss };
});
