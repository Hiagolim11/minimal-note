// Busca inteligente, modelos e tarefas no app.
const day = (d = 0) => `(() => { const x = new Date(); x.setDate(x.getDate() + ${d}); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); })()`;
const NL = '\\n'; // "\n" dentro do código enviado ao app
module.exports = [
  { wait: 400, js: `(async () => {
      const t0 = ${day(0)}, ontem = ${day(-1)}, sem = ${day(5)};
      await lumen.fs.write('Projetos/Roadmap.md', '# Roadmap${NL}Lançar a versão com orçamento aprovado.${NL}- [ ] revisar orçamento 📅 ' + t0 + '${NL}- [ ] enviar contrato 📅 ' + ontem + '${NL}- [ ] planejar sprint 📅 ' + sem + '${NL}- [x] contratar designer${NL}#trabalho');
      await lumen.fs.write('Receitas/Bolo.md', 'Bolo de cenoura com açúcar.${NL}- [ ] comprar ovos');
      await refreshVault(); return 'notas: ' + S.notes.size; })()` },
  // busca
  { js: `(() => { showLeftPanel('search'); const i = document.getElementById('search-input'); i.value = 'orcamneto'; runSearch(); return 'busca com erro: ' + [...document.querySelectorAll('#search-results .sr-name > span:not(.sr-folder)')].map((e) => e.textContent).join(',') + ' | marca: ' + document.querySelector('#search-results mark')?.textContent; })()` },
  { js: `(() => { const i = document.getElementById('search-input'); i.value = 'tarefa:pendente pasta:receitas'; runSearch(); return 'filtro: ' + document.getElementById('search-meta').textContent + ' | ' + document.querySelector('#search-results .sr-hit')?.textContent; })()` },
  { js: `(() => { const i = document.getElementById('search-input'); i.value = ''; runSearch(); return 'chips: ' + document.querySelectorAll('#search-meta [data-q]').length; })()`, shot: 'feat-busca' },
  // modelos
  { js: `(async () => { await Templates.ensureDefaults(); return 'modelos: ' + Templates.list().map((n) => n.name).join(','); })()`, wait: 300 },
  { js: `(async () => { const tpl = Templates.list().find((n) => n.name === 'Reunião'); const rel = await Templates.createFrom(tpl, { name: 'Reunião de teste' }); await new Promise((r) => setTimeout(r, 500)); const v = editor.ta.value; return JSON.stringify({ rel, titulo: v.split('${NL}')[0], cursorNaPauta: v.slice(editor.ta.selectionStart - 2, editor.ta.selectionStart) === '- ', sobrou: /\\{\\{/.test(v) }); })()` },
  { js: `(async () => { await dailyNote(); await new Promise((r) => setTimeout(r, 500)); return 'diária: ' + activeTab().path + ' | ' + editor.ta.value.split('${NL}')[0]; })()` },
  // tarefas
  { js: `(() => { showLeftPanel('tasks'); Tasks.setFilter('today'); return 'hoje: ' + [...document.querySelectorAll('#task-list .task-txt')].map((e) => e.textContent).join(',') + ' | badge: ' + document.querySelector('.rb-btn[data-panel=tasks] .rb-badge').textContent; })()`, wait: 300, shot: 'feat-tarefas' },
  { click: '#task-list .task-item input', wait: 800, js: `'concluída no arquivo: ' + /- \\[x\\] (revisar orçamento|enviar contrato).*✅/.test(S.notes.get('Projetos/Roadmap.md').content)` },
  { js: `(async () => { await openNote('Receitas/Bolo.md'); await new Promise((r) => setTimeout(r, 400)); setMode('edit'); editor.ta.focus(); const v = editor.ta.value; const p = v.indexOf('comprar ovos') + 'comprar ovos'.length; editor.ta.setSelectionRange(p, p); return 'ok'; })()` },
  { type: ' @amanha ', wait: 300, js: `'data rápida: ' + editor.ta.value.split('${NL}')[1]` },
  { js: `'esperado: ' + ${day(1)}` },
];
