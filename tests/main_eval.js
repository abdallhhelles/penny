#!/usr/bin/env node
/* Evaluate an expression inside the running Electron MAIN process (needs `electron --inspect=<port>`).
   usage: node tests/main_eval.js <port> "<expression using E = require('electron')>"   -> prints JSON result */
const [port, expr] = [process.argv[2], process.argv[3]];
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const code = `(async()=>{const E=globalThis.__PENNY_ELECTRON;return (${expr});})()`;
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: code, awaitPromise: true, returnByValue: true } }));
  ws.onmessage = m => {
    const r = JSON.parse(m.data); if (r.id !== 1) return;
    if (r.result.exceptionDetails) { console.log(JSON.stringify({ error: r.result.exceptionDetails.exception?.description || 'exception' })); }
    else console.log(JSON.stringify(r.result.result.value === undefined ? null : r.result.result.value));
    ws.close(); process.exit(0);
  };
  setTimeout(() => { console.log(JSON.stringify({ error: 'timeout' })); process.exit(2); }, 8000);
})().catch(e => { console.log(JSON.stringify({ error: String(e) })); process.exit(1); });
