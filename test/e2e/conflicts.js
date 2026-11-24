// Conflitos de sincronização: faixa na nota, "usar a versão do conflito" (a atual vai para o
// histórico e a cópia some) e "descartar" (a nota fica como está).
const sleep = (ms) => `await new Promise((r) => setTimeout(r, ${ms}))`;
const answer = `async function answer(vals) { for (const v of vals) { for (let i = 0; i < 50 && document.getElementById('dialog').hidden; i++) ${sleep(40)}; if (typeof v === 'string') document.getElementById('dialog-input').value = v; document.getElementById('dialog-ok').click(); ${sleep(150)}; } }`;
const pick = (i) => `for (let k = 0; k < 50 && !document.querySelectorAll('#palette-list .pl-item')[${i}]; k++) ${sleep(40)}; document.querySelectorAll('#palette-list .pl-item')[${i}].click();`;
const C1 = 'Plano.sync-conflict-20261124-101530-ABC1234.md', C2 = 'Plano (conflicted copy 2026-11-24).md';
module.exports = [
  { wait: 400, js: `(async () => {
      await lumen.fs.write('Plano.md', 'versão daqui'); await lumen.fs.write('${C1}', 'versão do celular');
      await refreshVault(); openNote('Plano.md'); setMode('edit'); ${sleep(300)}
      const bar = document.querySelector('.conflict-bar');
      return JSON.stringify({ faixa: !bar.hidden, texto: bar.innerText.replace(/\\s+/g, ' ').trim() }); })()` },
  { js: `(async () => { ${answer}; Conflicts.resolve(); ${pick(0)}; await answer([true]); ${sleep(800)};
      return JSON.stringify({ disco: await lumen.fs.read('Plano.md'), tela: editor.value, copiaSumiu: !S.notes.has('${C1}'), historico: (await History.load('Plano.md')).map((v) => v.content), faixa: !document.querySelector('.conflict-bar').hidden }); })()` },
  { js: `(async () => { ${answer}; await lumen.fs.write('${C2}', 'outra versão'); await refreshVault(); ${sleep(200)};
      const antes = !document.querySelector('.conflict-bar').hidden;
      Conflicts.resolve(); ${pick(1)}; await answer([true]); ${sleep(800)};
      return JSON.stringify({ faixaAntes: antes, disco: await lumen.fs.read('Plano.md'), copiaSumiu: !S.notes.has('${C2}'), faixaDepois: !document.querySelector('.conflict-bar').hidden }); })()` },
];
