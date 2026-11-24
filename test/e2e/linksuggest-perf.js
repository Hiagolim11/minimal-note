// Tempo de LinkSuggest.render (painel "Links") num cofre grande, simulando edições seguidas na nota aberta.
// Rodar com: bash test/e2e/run.sh test/e2e/linksuggest-perf.js "$(cat test/e2e/search-perf.setup)"
module.exports = [
  { wait: 40000, js: `refreshVault().then(() => { openNote('pasta1/Nota 1.md'); return 'notas=' + S.notes.size; })` },
  { js: `(() => { const n = activeNote(), t = []; for (let i = 0; i < 5; i++) { n.content += ' mais'; const a = performance.now(); LinkSuggest.render(n); t.push(performance.now() - a); } return 'render ms: ' + t.map(Math.round).join(','); })()` },
];
