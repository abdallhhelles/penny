'use strict';
/* =========================================================================
   Penny display formatting — numbers, currency, percentages, dates, times.

   DISPLAY ONLY. Every function takes a raw value (number / 'YYYY-MM-DD' / Date) and returns a string.
   Nothing here is ever used to compute, store or parse financial data back, so changing language or
   locale can never change an amount, a date or a balance.

   Policy (documented in docs/I18N.md):
   - Dates are stored as Gregorian ISO strings and always DISPLAYED with the Gregorian calendar
     (ar-SA would otherwise show Hijri dates for the same transaction).
   - Digits: 'latn' (0-9, default) or 'native' (e.g. Arabic-Indic ٠-٩). Western digits are the default
     because amounts are typed with a number field and many Arabic users expect 0-9 in finance apps.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fmt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_LOCALE = 'en-US';

  /* 'es-ES' + digits -> 'es-ES-u-ca-gregory-nu-latn' (extension keys are kept in alphabetical order) */
  function tag(base, { digits = 'latn' } = {}) {
    let b = String(base || DEFAULT_LOCALE).replace(/_/g, '-').replace(/-u-.*$/i, '');
    try { b = Intl.getCanonicalLocales(b)[0]; } catch { b = DEFAULT_LOCALE; }
    return `${b}-u-ca-gregory${digits === 'latn' ? '-nu-latn' : ''}`;
  }

  const ymdToDate = s => {
    if (s instanceof Date) return s;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); // local-date semantics, same as core.js pd()
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(NaN);
  };

  function create({ locale = DEFAULT_LOCALE, currency = 'USD', digits = 'latn' } = {}) {
    let lt = tag(locale, { digits });
    let money, compact;
    try {
      money = new Intl.NumberFormat(lt, { style: 'currency', currency });
      compact = new Intl.NumberFormat(lt, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    } catch { // unknown currency code or locale: fall back safely, never throw while rendering
      lt = tag(DEFAULT_LOCALE, { digits });
      money = new Intl.NumberFormat(lt, { style: 'currency', currency: 'USD' });
      compact = new Intl.NumberFormat(lt, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
    }
    const cache = new Map();
    const dtf = opts => { const k = JSON.stringify(opts); let f = cache.get(k); if (!f) { f = new Intl.DateTimeFormat(lt, opts); cache.set(k, f); } return f; };
    const nf = opts => { const k = 'n' + JSON.stringify(opts); let f = cache.get(k); if (!f) { f = new Intl.NumberFormat(lt, opts); cache.set(k, f); } return f; };
    const safeDate = (f, d) => { const x = ymdToDate(d); return isNaN(x) ? '' : f.format(x); };

    const decimalSep = (() => { try { return nf({}).formatToParts(1.5).find(p => p.type === 'decimal').value; } catch { return '.'; } })();

    return {
      locale: lt,
      /* numbers & money (amounts are rounded to cents for DISPLAY only, as before) */
      money: n => money.format(Math.round(n * 100) / 100),
      /* an amount in another currency (e.g. an account held in EUR while the base currency is USD) */
      moneyIn: (n, cur) => { if (!cur || cur === currency) return money.format(Math.round(n * 100) / 100); try { return nf({ style: 'currency', currency: cur }).format(Math.round(n * 100) / 100); } catch { return money.format(Math.round(n * 100) / 100) + ' ' + cur; } },
      moneyCompact: n => compact.format(n),
      number: (n, opts) => nf(opts || {}).format(n),
      percent: (ratio, fractionDigits = 0) => nf({ style: 'percent', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(ratio),
      currencySymbol: () => { try { return money.formatToParts(0).find(p => p.type === 'currency').value; } catch { return currency; } },
      decimalSeparator: decimalSep,
      /* dates (accept 'YYYY-MM-DD' or Date) */
      dateShort: d => safeDate(dtf({ month: 'short', day: 'numeric' }), d),
      dateMid: d => safeDate(dtf({ weekday: 'short', month: 'short', day: 'numeric' }), d),
      dateLong: d => safeDate(dtf({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), d),
      dateFull: d => safeDate(dtf({ weekday: 'long', month: 'long', day: 'numeric' }), d),
      monthYear: d => safeDate(dtf({ month: 'long', year: 'numeric' }), d),
      weekdayShort: d => safeDate(dtf({ weekday: 'short' }), d),
      dateTime: d => { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? '' : dtf({ dateStyle: 'medium', timeStyle: 'short' }).format(x); },
      time: hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? dtf({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, +m[1], +m[2])) : ''; },
      hour: h => dtf({ hour: 'numeric' }).format(new Date(2000, 0, 1, h, 0)),
      dateFmt: opts => dtf(opts)
    };
  }

  /* Turn what a person typed (any digit system, any decimal mark) into a plain JS number, or NaN.
     Used only for input boxes; stored data is always real numbers. */
  function parseNumber(text) {
    let s = String(text ?? '').trim();
    if (!s) return NaN;
    s = s.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660))      // Arabic-Indic
         .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06F0))      // Persian / Urdu
         .replace(/[٫]/g, '.').replace(/[٬  \s']/g, '')      // Arabic decimal / thousands marks, spaces
         .replace(/٪/g, '');                                                 // Arabic percent sign
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) { // both present: whichever comes last is the decimal mark
      s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
    } else if (lastComma >= 0) {
      const tail = s.length - lastComma - 1;
      s = (tail === 3 && s.indexOf(',') === lastComma && /^\d{1,3},\d{3}$/.test(s)) ? s.replace(',', '') : s.replace(/,/g, '.');
    }
    return /^[+-]?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
  }

  /* Replace Arabic-Indic / Persian digits and marks in a string with ASCII (for number inputs) */
  const toAscii = s => String(s).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06F0)).replace(/[٫،]/g, '.');

  return { create, tag, parseNumber, toAscii, ymdToDate, DEFAULT_LOCALE };
});
