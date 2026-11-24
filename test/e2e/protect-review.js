// Revisão gramatical numa nota protegida: o texto só sai (sem cifra) depois de uma confirmação
// específica para ela; cancelar não envia nada. Servidor falso conta os pedidos.
// Rodar com: bash test/e2e/run.sh test/e2e/protect-review.js 'node test/e2e/lt-server.js'
const sleep = (ms) => `await new Promise((r) => setTimeout(r, ${ms}))`;
const answer = `async function answer(vals) { for (const v of vals) { for (let i = 0; i < 50 && document.getElementById('dialog').hidden; i++) ${sleep(40)}; if (typeof v === 'string') document.getElementById('dialog-input').value = v; document.getElementById('dialog-ok').click(); ${sleep(80)}; } }`;
const dlg = `(async () => { for (let i = 0; i < 50 && document.getElementById('dialog').hidden; i++) ${sleep(40)}; return JSON.stringify({ aberto: !document.getElementById('dialog').hidden, titulo: document.getElementById('dialog-title')?.textContent }); })()`;
module.exports = [
  { wait: 400, js: `(async () => { ${answer};
      await lumen.fs.write('Segredo.md', 'Fui a praia com a senha girassol.'); await refreshVault(); openNote('Segredo.md'); setMode('edit');
      const p = Protect.protectNote(); await answer(['abcd1234', 'abcd1234']); await p; ${sleep(500)};
      setSetting('ltEnabled', true); setSetting('ltServer', 'custom'); setSetting('ltUrl', 'http://127.0.0.1:47124');
      return 'protegida: ' + Protect.isProtected('Segredo.md'); })()` },
  { js: `(() => { window.__run = window.__lumenReview.run(); return 'pediu revisão'; })()` },
  { js: dlg },
  { click: '#dialog-cancel', wait: 1500, js: `'cancelado'` },
  { js: `(() => { window.__run = window.__lumenReview.run(); return 'pediu de novo'; })()` },
  { js: dlg },
  { click: '#dialog-ok', wait: 2500, js: `'confirmado'` },
];
