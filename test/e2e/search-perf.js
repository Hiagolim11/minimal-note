// Tempo da busca num cofre grande (3.000 notas de ~3 KB, geradas pelo comando de fundo).
// Rodar com: bash test/e2e/run.sh test/e2e/search-perf.js "$(cat test/e2e/search-perf.setup)"
module.exports = [
  { wait: 40000, js: `refreshVault().then(() => 'notas=' + S.notes.size)` },
  { js: `(() => { const notes = [...S.notes.values()], out = {};
      for (const q of ['texto', 'nota 15', 'informação', '"Texto da"', 'tag:tag3 texto', 'xyzinexistente']) {
        SmartSearch.run(notes, q); const t = []; for (let i = 0; i < 5; i++) { const a = performance.now(); SmartSearch.run(notes, q); t.push(performance.now() - a); }
        out[q] = Math.round(t.sort((a, b) => a - b)[2]) + 'ms';
      } return JSON.stringify(out); })()` },
];
