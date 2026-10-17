'use strict';
/* =========================================================================
   Legal texts. The templates live in the locale files (legal.eula / legal.privacy / legal.oss) so every language has a
   translation; the ENGLISH text is the binding version and is what Setup installs (tools/make-docs.js renders en.json).
   Plain functions of the PUBLISHER details, so the in-app pages and the installer files can never disagree. Contact lines
   appear only when the publisher has filled them in (renderer/publisher.js).
   Usage: LEGAL.eula(P, msg) where msg(key) returns the message template (default: the app language, falling back to English).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LEGAL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  let EN = null;
  const english = () => {
    if (typeof I18N === 'object' && I18N.raw) return k => I18N.raw('en', k) || '';
    if (!EN) { try { EN = require('./locales/en.json').strings; } catch { EN = {}; } } return k => EN[k] || '';
  };
  const pick = msg => msg || (typeof tr === 'function' ? (k => tr(k)) : english());
  const fill = (t, v) => String(t || '').replace(/\{([A-Za-z]+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  const contact = (P, m) => [P.supportDiscord && `${m('legal.c.discord')}: ${P.supportDiscord}`, P.supportEmail && `${m('legal.c.email')}: ${P.supportEmail}`, P.supportUrl && `${m('legal.c.support')}: ${P.supportUrl}`, P.website && `${m('legal.c.website')}: ${P.website}`, P.postalAddress && `${m('legal.c.address')}: ${P.postalAddress}`].filter(Boolean);
  const base = P => ({ product: P.product, productUpper: P.product.toUpperCase(), name: P.name, date: P.docsDate });
  function eula(P, msg) {
    const m = pick(msg);
    const law = P.governingLaw ? fill(m('legal.law1'), { law: P.governingLaw }) : m('legal.law0');
    return fill(m('legal.eula'), { ...base(P), version: P.eulaVersion, law, contactLines: contact(P, m).join('\n') }).replace(/\n+$/, '') + '\n';
  }
  function privacy(P, msg) {
    const m = pick(msg), r = P.retention, c = contact(P, m);
    return fill(m('legal.privacy'), { ...base(P), version: P.privacyVersion, contactIndented: c.map(l => '  ' + l).join('\n'), contactInline: c.join('; ') || P.name,
      daily: r.dailyBackups, beforeChange: r.beforeChangeBackups, preMigration: r.preMigrationBackups, manual: r.manualBackups, logFiles: r.logFiles, logMB: r.logMaxMB }).replace(/\n{3,}/g, '\n\n');
  }
  function oss(msg) { return pick(msg)('legal.oss'); }
  /* English only (installer files, and the "binding text" button) */
  const en = () => english();
  return { eula, privacy, oss, en };
});
