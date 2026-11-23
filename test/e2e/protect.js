// Notas protegidas por senha: o arquivo no disco nunca fica sem cifra.
const NL = '\\n';
const sleep = (ms) => `await new Promise((r) => setTimeout(r, ${ms}))`;
// responde aos diálogos em sequência (valor ou true para só confirmar)
const answer = `async function answer(vals) { for (const v of vals) { for (let i = 0; i < 50 && document.getElementById('dialog').hidden; i++) ${sleep(40)}; if (typeof v === 'string') document.getElementById('dialog-input').value = v; document.getElementById('dialog-ok').click(); ${sleep(80)}; } }`;
const disk = (p) => `(await lumen.fs.read(${JSON.stringify(p)}))`;
module.exports = [
  { wait: 400, js: `(async () => {
      await lumen.fs.write('Segredo.md', '# Segredo${NL}A senha do cofre é girassol.');
      await lumen.fs.write('Privado/A.md', 'nota a'); await lumen.fs.write('Privado/B.md', 'nota b');
      await refreshVault(); await openNote('Segredo.md'); setMode('edit'); return 'ok'; })()` },
  // proteger
  { js: `(async () => { ${answer}; const p = Protect.protectNote(); await answer(['abcd1234', 'abcd1234']); await p; ${sleep(600)};
      const d = ${disk('Segredo.md')};
      return JSON.stringify({ cifrado: VaultCrypto.isEncrypted(d), vazou: d.includes('girassol'), naTela: editor.ta.value.includes('girassol') }); })()` },
  // editar com a nota aberta: o disco continua cifrado, com o texto novo
  { js: `(() => { const v = editor.ta.value; editor.ta.focus(); editor.ta.setSelectionRange(v.length, v.length); return 'ok'; })()` },
  { type: ' Nova linha secreta.', wait: 3500 },
  { js: `(async () => { const d = ${disk('Segredo.md')}; return JSON.stringify({ cifrado: VaultCrypto.isEncrypted(d), texto: (await VaultCrypto.decrypt(d, 'abcd1234')).split('${NL}').pop() }); })()` },
  // bloquear
  { js: `(async () => { const n = await Protect.lockAll(); ${sleep(300)}; showLeftPanel('search'); const i = document.getElementById('search-input'); i.value = 'girassol'; runSearch(); return JSON.stringify({ bloqueadas: n, tela: !document.getElementById('lock-view').hidden, somenteLeitura: editor.ta.readOnly, busca: document.getElementById('search-meta').textContent }); })()`, shot: 'protect-lock' },
  // senha errada e certa
  { js: `(async () => { document.getElementById('lock-pw').value = 'errada'; document.querySelector('#lock-view form').requestSubmit(); ${sleep(1500)}; return 'errada: ' + document.getElementById('lock-err').textContent; })()` },
  { js: `(async () => { document.getElementById('lock-pw').value = 'abcd1234'; document.querySelector('#lock-view form').requestSubmit(); ${sleep(1500)}; return JSON.stringify({ aberta: document.getElementById('lock-view').hidden, texto: editor.ta.value.includes('Nova linha secreta') }); })()` },
  // renomear com a nota aberta: continua cifrada no novo nome
  { js: `(async () => { await renamePath('Segredo.md', 'Cofre.md'); ${sleep(500)}; await openNote('Cofre.md'); ${sleep(300)}; const v = editor.ta.value; editor.ta.focus(); editor.ta.setSelectionRange(v.length, v.length); return 'renomeada'; })()` },
  { type: ' x', wait: 1800, js: `(async () => { const d = ${disk('Cofre.md')}; return JSON.stringify({ novoCifrado: VaultCrypto.isEncrypted(d), vazou: d.includes('girassol') }); })()` },
  // duplicar é bloqueado
  { js: `(async () => { await duplicateNote('Cofre.md'); ${sleep(300)}; return 'cópias: ' + [...S.notes.keys()].filter((p) => /Cofre/.test(p)).length; })()` },
  // remover a senha
  { js: `(async () => { ${answer}; const p = Protect.removeProtection('Cofre.md'); await answer([true]); await p; ${sleep(600)}; const d = ${disk('Cofre.md')}; return JSON.stringify({ cifrado: VaultCrypto.isEncrypted(d), texto: d.includes('girassol') }); })()` },
  // pasta inteira
  { js: `(async () => { ${answer}; const p = Protect.protectFolder('Privado'); await answer(['pasta123', 'pasta123']); await p; ${sleep(900)}; return JSON.stringify({ a: VaultCrypto.isEncrypted(${disk('Privado/A.md')}), b: VaultCrypto.isEncrypted(${disk('Privado/B.md')}) }); })()` },
  // bloqueia e abre B: a senha da pasta abre A automaticamente depois
  { js: `(async () => { await Protect.lockAll(); await openNote('Privado/B.md'); ${sleep(300)}; document.getElementById('lock-pw').value = 'pasta123'; document.querySelector('#lock-view form').requestSubmit(); ${sleep(1500)}; await openNote('Privado/A.md'); ${sleep(1500)}; return JSON.stringify({ aAberta: document.getElementById('lock-view').hidden, texto: editor.ta.value }); })()` },
];
