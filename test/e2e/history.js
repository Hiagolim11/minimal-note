// Histórico de versões: guarda ao salvar, restaura pela paleta (a atual também fica guardada),
// acompanha a nota ao renomear e, em nota protegida, só guarda texto cifrado.
const sleep = (ms) => `await new Promise((r) => setTimeout(r, ${ms}))`;
const answer = `async function answer(vals) { for (const v of vals) { for (let i = 0; i < 50 && document.getElementById('dialog').hidden; i++) ${sleep(40)}; if (typeof v === 'string') document.getElementById('dialog-input').value = v; document.getElementById('dialog-ok').click(); ${sleep(120)}; } }`;
const edit = (t) => `editor.value = ${JSON.stringify(t)}; onEdit(${JSON.stringify(t)}); await saveNote(activeNote().path);`;
const pick = (i) => `for (let k = 0; k < 50 && !document.querySelectorAll('#palette-list .pl-item')[${i}]; k++) ${sleep(40)}; document.querySelectorAll('#palette-list .pl-item')[${i}].click();`;
module.exports = [
  { wait: 400, js: `(async () => { History.LIMITS.gap = 0;
      await lumen.fs.write('Diário.md', 'versão 1'); await refreshVault(); openNote('Diário.md'); setMode('edit');
      ${edit('versão 2')} ${edit('versão 3')}
      return 'guardadas: ' + JSON.stringify((await History.load('Diário.md')).map((v) => v.content)); })()` },
  // restaurar a "versão 1" (2º item: a lista vem da mais recente para a mais antiga)
  { js: `(async () => { ${answer}; await History.open(); ${pick(1)}; await answer([true]); ${sleep(600)};
      return JSON.stringify({ tela: editor.value, disco: await lumen.fs.read('Diário.md'), historico: (await History.load('Diário.md')).map((v) => v.content) }); })()` },
  // renomear: o histórico vai junto
  { js: `(async () => { await renamePath('Diário.md', 'Diário de bordo.md'); ${sleep(600)};
      return JSON.stringify({ novo: (await History.load('Diário de bordo.md')).length, antigo: (await History.load('Diário.md')).length }); })()` },
  // nota protegida: o histórico guarda só a cifra; restaurar a versão cifrada pede a senha
  { js: `(async () => { ${answer}; openNote('Diário de bordo.md');
      const p = Protect.protectNote(); await answer(['abcd1234', 'abcd1234']); await p; ${sleep(500)};
      ${edit('segredo girassol')} ${edit('segredo trocado')}
      const raw = await lumen.fs.read('.minimal-note/historico/Diário de bordo.md.json');
      return JSON.stringify({ vazouTextoAberto: raw.includes('girassol'), vazouVersoesAntigas: raw.includes('versão'), ultimaCifrada: VaultCrypto.isEncrypted(JSON.parse(raw).pop().content) }); })()` },
  { js: `(async () => { ${answer}; await History.open(); ${pick(0)}; await answer(['abcd1234', true]); ${sleep(800)};
      const d = await lumen.fs.read('Diário de bordo.md');
      return JSON.stringify({ tela: editor.value, discoCifrado: VaultCrypto.isEncrypted(d), disco: await VaultCrypto.decrypt(d, 'abcd1234') }); })()` },
];
