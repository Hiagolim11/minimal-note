// Captura rápida com a "Caixa de entrada" protegida por senha: não pode misturar texto aberto
// no arquivo cifrado. A captura no modo "nota nova" continua funcionando.
const sleep = (ms) => `await new Promise((r) => setTimeout(r, ${ms}))`;
const answer = `async function answer(vals) { for (const v of vals) { for (let i = 0; i < 50 && document.getElementById('dialog').hidden; i++) ${sleep(40)}; if (typeof v === 'string') document.getElementById('dialog-input').value = v; document.getElementById('dialog-ok').click(); ${sleep(80)}; } }`;
module.exports = [
  { wait: 400, js: `(async () => { ${answer};
      await lumen.capture.save({ text: 'primeira ideia', mode: 'inbox' }); await refreshVault();
      openNote('Caixa de entrada.md'); setMode('edit');
      const p = Protect.protectNote('Caixa de entrada.md'); await answer(['abcd1234', 'abcd1234']); await p; ${sleep(500)};
      return 'protegida: ' + VaultCrypto.isEncrypted(await lumen.fs.read('Caixa de entrada.md')); })()` },
  { js: `(async () => {
      const r = await lumen.capture.save({ text: 'ideia secreta', mode: 'inbox' }).then((x) => 'salvou em ' + x, (e) => 'recusou: ' + e.message);
      const d = await lumen.fs.read('Caixa de entrada.md');
      return JSON.stringify({ r, continuaCifrada: VaultCrypto.isEncrypted(d), textoAbertoNoArquivo: d.includes('ideia secreta') }); })()` },
  { js: `lumen.capture.save({ text: 'nota avulsa', mode: 'note' }).then((x) => 'modo nota: ' + x, (e) => 'modo nota ERRO ' + e.message)` },
];
