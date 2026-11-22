// Vários salvamentos da mesma nota ao mesmo tempo: o disco deve terminar com o texto mais novo, sem erro.
module.exports = [
  { wait: 300, js: `(async () => {
      const p = 'Bem-vindo.md', n = S.notes.get(p), errs = [];
      const origToast = window.toast; window.toast = (m) => errs.push(m);
      const big = 'x'.repeat(400000);
      const runs = [];
      for (let i = 0; i < 30; i++) { n.content = big + ' versão ' + i; n.version = (n.version || 0) + 1; S.pending.add(p); runs.push(saveNote(p)); }
      await Promise.all(runs);
      window.toast = origToast;
      const disk = await lumen.fs.read(p);
      return JSON.stringify({ final: disk.slice(-10), pendente: S.pending.has(p), erros: errs.length });
    })()` },
];
