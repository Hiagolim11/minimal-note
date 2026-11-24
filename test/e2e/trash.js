// Sem lixeira do sistema (LUMEN_NO_SYSTEM_TRASH=1 simula um pendrive; /tmp tem lixeira em alguns sistemas): excluir vai para .lixeira do cofre,
// sem um item sobrescrever outro de mesmo nome; a pasta não aparece na árvore; dá para esvaziar.
const sleep = (ms) => `await new Promise((r) => setTimeout(r, ${ms}))`;
module.exports = [
  { wait: 400, js: `(async () => {
      await lumen.fs.write('A/Nota.md', 'conteúdo A'); await lumen.fs.write('B/Nota.md', 'conteúdo B'); await refreshVault();
      const r = [await lumen.fs.remove('A/Nota.md'), await lumen.fs.remove('B/Nota.md')]; await refreshVault();
      return JSON.stringify({ onde: r, naLixeira: await lumen.vault.trashCount(), naArvore: JSON.stringify(S.tree).includes('.lixeira'), notas: [...S.notes.keys()].filter((p) => /Nota\\.md$/.test(p)) });
    })()` },
  { js: `(async () => { openSettings('vault'); ${sleep(500)}; const el = document.getElementById('trash-count'); return JSON.stringify({ linha: !!el && !el.closest('.set-row').hidden, texto: el?.textContent }); })()` },
  { js: `(async () => { await lumen.vault.emptyTrash(); return 'depois de esvaziar: ' + await lumen.vault.trashCount(); })()` },
  { js: `(async () => { closeSettings(); openSettings('vault'); ${sleep(500)}; return 'linha visível com lixeira vazia: ' + !document.getElementById('trash-count').closest('.set-row').hidden; })()` },
];
