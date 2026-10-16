'use strict';
const test = require('node:test'), assert = require('node:assert');
const I = require('../renderer/importers.js');

test('amounts: US / EU / accounting formats', () => {
  const a = I.parseAmount;
  assert.equal(a('1,234.56'), 1234.56); assert.equal(a('1.234,56'), 1234.56); assert.equal(a('(45.00)'), -45); assert.equal(a('45.00-'), -45);
  assert.equal(a('-$45'), -45); assert.equal(a('€ 12,5'), 12.5); assert.equal(a('1,234'), 1234); assert.equal(a('12,50'), 12.5); assert.equal(a('1.234.567'), 1234567);
  assert.ok(isNaN(a(''))); assert.ok(isNaN(a('n/a'))); assert.equal(a('−3.20'), -3.2);
});
test('dates: file-wide order, impossible readings corrected, OFX stamps', () => {
  const p = I.parseDate;
  assert.equal(p('03/04/2026', 'mdy'), '2026-03-04'); assert.equal(p('03/04/2026', 'dmy'), '2026-04-03');
  assert.equal(p('25/12/2026', 'mdy'), '2026-12-25'); assert.equal(p('12/25/2026', 'dmy'), '2026-12-25');
  assert.equal(p('31/02/2026', 'dmy'), null); assert.equal(p('2026-10-15'), '2026-10-15'); assert.equal(p('20261015'), '2026-10-15');
  assert.equal(p('20261015120000[-5:EST]', 'ymd'), '2026-10-15'); assert.equal(p('5.3.26', 'dmy'), '2026-03-05'); assert.equal(p('hello'), null);
  assert.equal(I.csvDateOrder([['25/12/2026'], ['01/02/2026']], 0).order, 'dmy'); assert.equal(I.csvDateOrder([['12/25/2026']], 0).order, 'mdy');
  assert.equal(I.csvDateOrder([['01/02/2026']], 0, 'en-US').kind, 'ambiguous'); assert.equal(I.csvDateOrder([['01/02/2026']], 0, 'es-ES').order, 'dmy');
  assert.equal(I.csvDateOrder([['25/12/2026'], ['12/25/2026']], 0).kind, 'conflict');
});
test('delimited: delimiter detection, quotes, embedded commas / newlines, BOM', () => {
  const t = '﻿Date;Description;Amount\n01.02.2026;"Smith; John";-12,50\n02.02.2026;"Multi\nline";3,00\n';
  const r = I.parseDelimited(t); assert.equal(r.sep, ';'); assert.equal(r.rows.length, 3); assert.equal(r.rows[1][1], 'Smith; John'); assert.equal(r.rows[2][1], 'Multi\nline');
  assert.equal(I.parseDelimited('a\tb\n1\t2').sep, '\t'); assert.deepEqual(I.parseDelimited('a,"b ""q"""\n').rows[0], ['a', 'b "q"']);
});
test('columns: English / Spanish headers, debit+credit layouts', () => {
  assert.deepEqual(I.guessColumns(['Posting Date', 'Description', 'Debit', 'Credit', 'Balance']), { date: 0, desc: 1, debit: 2, credit: 3 });
  const g = I.guessColumns(['Fecha', 'Concepto', 'Importe', 'Saldo']); assert.equal(g.date, 0); assert.equal(g.desc, 1); assert.equal(g.amount, 2);
  assert.equal(I.guessColumns(['Date', 'Amount', 'Payee', 'Category']).category, 3);
  assert.equal(I.looksLikeHeader(['Date', 'Amount']), true); assert.equal(I.looksLikeHeader(['2026-01-02', '-4.50']), false);
});
test('rows -> items: sign, debit/credit, invert, skipped reasons with line numbers', () => {
  const rows = [['Date', 'Desc', 'Amount'], ['2026-01-02', 'Cafe', '-4.50'], ['2026-01-03', 'Pay', '1,000.00'], ['bad', 'X', '1'], ['2026-01-05', 'Y', ''], ['2026-01-06', 'Z', '0.00']];
  const r = I.rowsToItems(rows, { date: 0, desc: 1, amount: 2 }, { order: 'mdy' });
  assert.deepEqual(r.items.map(x => [x.type, x.amount]), [['expense', 4.5], ['income', 1000]]);
  assert.deepEqual(r.skipped.map(x => [x.line, x.reason]), [[4, 'date'], [5, 'amount'], [6, 'zero']]);
  const dc = I.rowsToItems([['d', 'x', 'debit', 'credit'], ['2026-01-02', 'Shop', '20.00', ''], ['2026-01-03', 'Refund', '', '5.00']], { date: 0, desc: 1, debit: 2, credit: 3 });
  assert.deepEqual(dc.items.map(x => [x.type, x.amount]), [['expense', 20], ['income', 5]]);
  const inv = I.rowsToItems([['d', 'x', 'a'], ['2026-01-02', 'Shop', '20.00']], { date: 0, desc: 1, amount: 2 }, { invert: true });
  assert.equal(inv.items[0].type, 'expense'); assert.equal(I.signHint([1, 2, 3]), 'allPositive'); assert.equal(I.signHint([1, -2]), 'mixed');
});
const OFX1 = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261015</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD<BANKACCTFROM><BANKID>123456789<ACCTID>00112233<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261015
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-5:EST]<TRNAMT>-45.20<FITID>2026100301<NAME>SHELL OIL 123<MEMO>Fuel &amp; snacks</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>2500.00<FITID>2026100502<NAME>ACME PAYROLL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007<TRNAMT>-12,40<FITID>2026100703<MEMO>Only a memo</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
test('OFX 1.x (SGML, unclosed tags) and 2.x (XML)', () => {
  const o = I.parseOFX(OFX1); assert.equal(o.currency, 'USD'); assert.equal(o.acctId, '…2233'); assert.equal(o.rows.length, 3);
  assert.deepEqual([o.rows[0].date, o.rows[0].amount, o.rows[0].fitid, o.rows[0].merchant, o.rows[0].memo], ['2026-10-03', -45.2, '2026100301', 'SHELL OIL 123', 'Fuel & snacks']);
  assert.equal(o.rows[2].amount, -12.4); assert.equal(o.rows[2].merchant, 'Only a memo');
  const it = I.ofxToItems(o); assert.deepEqual(it.items.map(x => [x.type, x.amount, x.fitid]), [['expense', 45.2, '2026100301'], ['income', 2500, '2026100502'], ['expense', 12.4, '2026100703']]);
  const xml = '<?xml version="1.0"?><OFX><CCSTMTRS><CURDEF>EUR</CURDEF><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260102</DTPOSTED><TRNAMT>-3.50</TRNAMT><FITID>A1</FITID><NAME>Kiosk</NAME></STMTTRN><STMTTRN><DTPOSTED>20260103</DTPOSTED><TRNAMT>9</TRNAMT><FITID>A2</FITID><NAME>Back</NAME></STMTTRN></BANKTRANLIST></CCSTMTRS></OFX>';
  const x = I.parseOFX(xml); assert.equal(x.currency, 'EUR'); assert.equal(x.rows.length, 2); assert.equal(x.rows[1].amount, 9);
  assert.equal(I.parseOFX('not ofx at all'), null);
  const bad = I.ofxToItems({ currency: '', rows: [{ date: null, amount: 1 }, { date: '2026-01-01', amount: NaN }, { date: '2026-01-01', amount: 0 }] }); assert.deepEqual(bad.skipped.map(s => s.reason), ['date', 'amount', 'zero']);
});
