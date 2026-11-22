// Mede o refresh num cofre grande (gerado pelo comando de fundo, ver test/e2e/all.sh).
module.exports = [
  { wait: 15000 },
  { js: `(async () => {
      await refreshVault();
      const known = {}; for (const n of S.notes.values()) known[n.path] = n.mtime;
      let a = performance.now(); const inc = await lumen.fs.readAll(known); const tInc = performance.now() - a;
      a = performance.now(); const full = await lumen.fs.readAll(); const tFull = performance.now() - a;
      const t = []; for (let i = 0; i < 3; i++) { a = performance.now(); await refreshVault(); t.push(Math.round(performance.now() - a)); }
      return JSON.stringify({ notas: S.notes.size, comConteudo: inc.filter((n) => n.content !== undefined).length, incrementalMs: Math.round(tInc), completoMs: Math.round(tFull), refreshMs: t });
    })()` },
];
