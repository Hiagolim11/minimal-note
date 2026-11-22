// Quadros por segundo do grafo (cofre grande gerado pelo comando de fundo).
module.exports = [
  { wait: 20000, js: `refreshVault().then(() => 'notas=' + S.notes.size)` },
  { keys: 'ctrl+g', wait: 500 },
  { js: `new Promise((res) => { const g = S.graph; let frames = 0, ticks = 0; const t0 = performance.now(); const tick = g.tick.bind(g); g.tick = function () { const a = performance.now(); tick(); ticks += performance.now() - a; }; const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(JSON.stringify({ nos: g.nodes.length, fps: Math.round(frames / 3), msPorTick: ticks / frames | 0 })); }; requestAnimationFrame(f); })` },
];
