'use strict';
/* Crash-safety: a process that is SIGKILLed in the middle of continuous saves must never leave
   an unreadable or truncated data file, and must never need the backup fallback. */
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../store');

const child = `
const { createStore } = require(${JSON.stringify(path.join(__dirname, '..', 'store.js'))});
const s = createStore(process.argv[1]);
const mk = n => ({ schema: 2, settings: {}, accounts: [{ id: 'a', name: 'A', type: 'checking', opening: 0 }], categories: [],
  transactions: Array.from({ length: 4000 }, (_, k) => ({ id: 't' + k, date: '2026-01-01', amount: k + n, type: 'expense', accountId: 'a', category: 'c', note: 'x'.repeat(40) })),
  goals: [], bills: [], reminders: [] });
for (let i = 0; ; i++) s.save(mk(i));
`;

test('25 random SIGKILLs during back-to-back saves: main file is always complete and valid', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penny-crash-'));
  const file = path.join(dir, 'penny-data.json');
  let recoveredCount = 0;
  for (let round = 0; round < 25; round++) {
    const p = spawn(process.execPath, ['-e', child, dir], { stdio: 'ignore' });
    for (let w = 0; w < 100 && !fs.existsSync(file); w++) await new Promise(r => setTimeout(r, 20)); // wait for the first save
    await new Promise(r => setTimeout(r, Math.random() * 120));
    p.kill('SIGKILL');
    await new Promise(r => p.on('exit', r));
    const d = createStore(dir).load(); // what the app would see on the next start
    assert.ok(d && !d.__damaged, `round ${round}: nothing loadable`);
    if (d.__recovered) recoveredCount++;
    assert.strictEqual(d.transactions.length, 4000, `round ${round}: truncated data`);
    JSON.parse(fs.readFileSync(file, 'utf8')); // the file itself parses (no .json corruption)
  }
  assert.strictEqual(recoveredCount, 0, 'the main file should never have needed backup recovery');
  fs.rmSync(dir, { recursive: true, force: true });
});
