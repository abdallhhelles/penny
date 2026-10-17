'use strict';
/* =========================================================================
   Penny importers — pure functions (no UI, no app data), node-testable.
     parseDelimited(text)          CSV / TSV / semicolon files  ->  { rows, sep }
     guessColumns(headerRow)       which column is the date / payee / amount …
     parseAmount / parseDate       tolerant of bank formats; dates are decided once per file, never row by row
     parseOFX(text)                OFX 1.x (SGML) and 2.x (XML), also .QFX  ->  { currency, acctId, rows }
     rowsToItems(rows, map, opts)  mapped rows -> normalised items + a list of skipped rows with the reason
   Nothing here touches the network or the disk; the wizard (ui.js) owns all of that.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Importers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const pad = n => String(n).padStart(2, '0');
  const ymdOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /* ---------- delimited text ---------- */
  function parseDelimited(text, sepHint) {
    text = String(text || '').replace(/^﻿/, '');
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim()).slice(0, 5);
    const score = c => lines.reduce((s, l) => s + (l.split(c).length - 1), 0);
    const sep = sepHint || [',', ';', '\t', '|'].map(c => [c, score(c)]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
      else cur += ch;
    }
    row.push(cur); if (row.some(x => x !== '')) rows.push(row);
    return { rows, sep };
  }

  const HEAD = {
    date: ['posting date', 'transaction date', 'trans date', 'booking date', 'date', 'fecha', 'تاريخ', '日期', 'तारीख', 'दिनांक'],
    desc: ['description', 'merchant', 'payee', 'name', 'details', 'narrative', 'memo', 'reference', 'concepto', 'descripcion', 'comercio', 'وصف', 'البيان', '描述', '摘要', '商户', '收款方', 'विवरण', 'व्यापारी', 'प्राप्तकर्ता'],
    amount: ['amount', 'value', 'sum', 'importe', 'monto', 'المبلغ', '金额', 'राशि'],
    debit: ['debit', 'withdrawal', 'paid out', 'money out', 'cargo', 'مدين', '支出', '借方', 'डेबिट', 'निकासी'],
    credit: ['credit', 'deposit', 'paid in', 'money in', 'abono', 'دائن', '收入', '贷方', 'क्रेडिट', 'जमा'],
    category: ['category', 'categoria', 'فئة', '类别', '分类', 'श्रेणी'],
    type: ['type', 'tipo', 'نوع', '类型', 'प्रकार'],
    currency: ['currency', 'moneda', 'عملة', '币种', '货币', 'मुद्रा']
  };
  const foldH = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
  function guessColumns(head) {
    const h = head.map(foldH), out = {}, used = new Set();
    for (const k of ['date', 'amount', 'debit', 'credit', 'desc', 'category', 'type', 'currency']) {
      let best = -1, bi = 99;
      h.forEach((x, i) => { if (used.has(i)) return; HEAD[k].forEach((w, wi) => { if ((x === w || x.includes(w)) && wi < bi) { bi = wi; best = i; } }); });
      if (best >= 0) { out[k] = best; used.add(best); }
    }
    return out;
  }
  /* does the first row look like a header at all? (a data row has a parseable date or number) */
  const looksLikeHeader = row => !row.some(c => parseDate(c, 'mdy') || /^[\s$€£]*[-(]?\d[\d.,]*\)?\s*$/.test(String(c)) && String(c).length > 2 && /[.,]\d{2}$/.test(String(c).trim()));

  /* ---------- amounts ---------- */
  /* "1,234.56"  "1.234,56"  "(45.00)"  "45.00-"  "-$45"  "€ 12,5" ; returns NaN when there is no number */
  function parseAmount(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return NaN;
    const neg = /^\(.*\)$/.test(s) || /^[-−–]/.test(s) || /[-−–]\s*$/.test(s);
    s = s.replace(/[^\d.,]/g, ''); if (!/\d/.test(s)) return NaN;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) { const after = s.length - lc - 1; s = (after === 3 && s.indexOf(',') === lc && !/^0/.test(s)) ? s.replace(',', '') : s.replace(',', '.'); }   // "1,234" thousands vs "12,5" decimal
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    const n = parseFloat(s); return isNaN(n) ? NaN : (neg ? -n : n);
  }

  /* ---------- dates ---------- */
  const validYMD = (y, m, d) => { if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false; const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d; };
  const NUMDATE = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/;
  /* Day-first or month-first is decided ONCE for the whole file: any value with a part > 12 settles it. */
  function csvDateOrder(rows, iD, fallbackLocale) {
    let dmy = 0, mdy = 0;
    for (const r of rows) { const m = String(r[iD] || '').trim().match(NUMDATE); if (!m) continue; const a = +m[1], b = +m[2]; if (a > 12 && b <= 12) dmy++; else if (b > 12 && a <= 12) mdy++; }
    const kind = dmy && !mdy ? 'dmy' : mdy && !dmy ? 'mdy' : dmy && mdy ? 'conflict' : 'ambiguous';
    return { kind, order: kind === 'dmy' || kind === 'mdy' ? kind : ((fallbackLocale || 'en-US') === 'en-US' ? 'mdy' : 'dmy') };
  }
  function parseDate(d, order) {
    d = String(d == null ? '' : d).trim(); let m;
    if ((m = d.match(/^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})(?!\d)/))) return validYMD(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
    if ((m = d.match(/^(\d{4})(\d{2})(\d{2})(?:\d{0,6})?(?:\.\d+)?(?:\[.*\])?$/))) return validYMD(+m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;   // 20261015 / 20261015120000[-5:EST]
    if ((m = d.match(NUMDATE))) {
      let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
      let day, mon;
      if (a > 12 && b <= 12) { day = a; mon = b; } else if (b > 12 && a <= 12) { mon = a; day = b; }
      else if (order === 'mdy') { mon = a; day = b; } else { day = a; mon = b; }
      return validYMD(y, mon, day) ? `${y}-${pad(mon)}-${pad(day)}` : null;
    }
    if (!/\d{4}|[A-Za-z]{3}/.test(d)) return null;
    const x = new Date(d); return isNaN(x) ? null : ymdOf(x);
  }

  /* ---------- OFX / QFX ---------- */
  const unent = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
  function parseOFX(text) {
    text = String(text || ''); const i = text.search(/<OFX[\s>]/i); if (i < 0) return null;
    text = text.slice(i);
    const tag = (src, name) => { const m = src.match(new RegExp('<' + name + '>([^<\\r\\n]*)', 'i')); return m ? unent(m[1]) : ''; };
    const currency = tag(text, 'CURDEF') || '', acctId = tag(text, 'ACCTID') || '', bankId = tag(text, 'BANKID') || '';
    const rows = []; const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTTRNRS>|<\/STMTRS>|$)/gi; let m;
    while ((m = re.exec(text))) {
      const b = m[1], date = parseDate(tag(b, 'DTPOSTED') || tag(b, 'DTUSER'), 'ymd'), amount = parseAmount(tag(b, 'TRNAMT').replace(',', '.'));
      const name = tag(b, 'NAME') || tag(b, 'PAYEE'), memo = tag(b, 'MEMO');
      rows.push({ date, amount, merchant: name || memo, memo: name && memo && memo !== name ? memo : '', fitid: tag(b, 'FITID'), trnType: tag(b, 'TRNTYPE'), check: tag(b, 'CHECKNUM') });
    }
    return { format: 'ofx', currency, acctId: acctId ? '…' + acctId.slice(-4) : '', bankId, rows };
  }

  /* ---------- mapped rows -> items ---------- */
  /* map: { date, desc, amount | debit+credit, type?, category?, memo?, currency? }  (column indexes)
     opts: { order, invert (flip the sign: credit-card exports list purchases as positive), skipHeader }
     Result: { items:[{date, amount>0, type, merchant, note, categoryName, currency, line}], skipped:[{line, reason, raw}] } */
  function rowsToItems(rows, map, opts = {}) {
    const items = [], skipped = [], start = opts.skipHeader === false ? 0 : 1;
    for (let k = start; k < rows.length; k++) {
      const r = rows[k], line = k + 1;
      const date = parseDate(r[map.date], opts.order);
      if (!date) { skipped.push({ line, reason: 'date', raw: r[map.date] }); continue; }
      let raw = map.amount != null ? parseAmount(r[map.amount]) : NaN;
      if (isNaN(raw) && map.debit != null) {
        const dv = parseAmount(r[map.debit]), cv = map.credit != null ? parseAmount(r[map.credit]) : NaN;
        raw = !isNaN(dv) && dv ? -Math.abs(dv) : !isNaN(cv) && cv ? Math.abs(cv) : NaN;
      }
      if (isNaN(raw)) { skipped.push({ line, reason: 'amount', raw: r[map.amount != null ? map.amount : map.debit] }); continue; }
      if (raw === 0) { skipped.push({ line, reason: 'zero' }); continue; }
      if (opts.invert) raw = -raw;
      let type = raw < 0 ? 'expense' : 'income';
      const ty = map.type != null ? String(r[map.type] || '').toLowerCase() : ''; if (/exp|debit|withdraw/.test(ty)) type = 'expense'; else if (/inc|credit|deposit/.test(ty)) type = 'income';
      items.push({ date, amount: Math.abs(raw), type, merchant: map.desc != null ? String(r[map.desc] || '').trim() : '', note: map.memo != null ? String(r[map.memo] || '').trim() : '', categoryName: map.category != null ? String(r[map.category] || '').trim() : '', currency: map.currency != null ? String(r[map.currency] || '').trim().toUpperCase() : '', line });
    }
    return { items, skipped };
  }
  /* OFX rows already carry signed amounts and bank ids */
  function ofxToItems(ofx) {
    const items = [], skipped = [];
    ofx.rows.forEach((r, i) => {
      if (!r.date) { skipped.push({ line: i + 1, reason: 'date' }); return; }
      if (isNaN(r.amount)) { skipped.push({ line: i + 1, reason: 'amount' }); return; }
      if (r.amount === 0) { skipped.push({ line: i + 1, reason: 'zero' }); return; }
      items.push({ date: r.date, amount: Math.abs(r.amount), type: r.amount < 0 ? 'expense' : 'income', merchant: r.merchant, note: r.memo || '', categoryName: '', currency: ofx.currency, fitid: r.fitid, line: i + 1 });
    });
    return { items, skipped };
  }
  /* all amounts the same sign usually means a credit-card export (purchases positive) */
  const signHint = rows => { let neg = 0, pos = 0; rows.forEach(x => { if (x < 0) neg++; else if (x > 0) pos++; }); return pos && !neg ? 'allPositive' : neg && !pos ? 'allNegative' : 'mixed'; };

  return { parseDelimited, guessColumns, looksLikeHeader, parseAmount, validYMD, csvDateOrder, parseDate, parseOFX, rowsToItems, ofxToItems, signHint };
});
