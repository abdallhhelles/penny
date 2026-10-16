'use strict';
/* Tiny diagnostic logger: userData/logs/penny.log, rotated at 1 MB (one previous file kept).
   Never throws, never logs financial data — only events, counts and error messages. */
const fs = require('fs');
const path = require('path');

function createLogger(dir, { max = 1024 * 1024 } = {}) {
  const file = path.join(dir, 'logs', 'penny.log');
  let ok = true;
  const fmt = a => (a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })());
  function write(level, msg, extra) {
    if (!ok) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { if (fs.statSync(file).size > max) fs.renameSync(file, file + '.old'); } catch {}
      const line = `${new Date().toISOString()} ${level.padEnd(5)} ${String(msg).slice(0, 2000)}${extra !== undefined ? ' | ' + fmt(extra).slice(0, 4000) : ''}\n`;
      fs.appendFileSync(file, line);
    } catch { ok = false; }
  }
  return { file, info: (m, e) => write('INFO', m, e), warn: (m, e) => write('WARN', m, e), error: (m, e) => write('ERROR', m, e) };
}
module.exports = { createLogger };
