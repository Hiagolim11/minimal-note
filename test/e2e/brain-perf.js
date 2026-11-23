// Grafo cérebro com cofre grande: tempo para montar e para desenhar cada quadro (2D e 3D).
// Rodar com BRAIN_NOTES=1500 (o padrão do roteiro brain.js é 90).
const base = require('./brain.js');
const frame = (label) => `(async () => {
  const t = []; for (let i = 0; i < 40; i++) { const a = performance.now(); S.graph.draw(); t.push(performance.now() - a); await new Promise((r) => requestAnimationFrame(r)); }
  t.sort((a, b) => a - b); return '${label}: mediana=' + t[20].toFixed(1) + 'ms p90=' + t[36].toFixed(1) + 'ms';
})()`;
module.exports = [
  { ...base[0], wait: 600 },
  { size: [1280, 800], js: `(() => { const a = performance.now(); addTab({ kind: 'graph' }); return 'montar 2D: ' + Math.round(performance.now() - a) + 'ms, nós ' + S.graph.nodes.length; })()`, wait: 1500 },
  { js: frame('2D grande') },
  { js: `(() => { const a = performance.now(); S.settings.graph = { ...S.settings.graph, style: 'brain3d' }; updateGraph(); S.graph.draw(); return 'montar 3D: ' + Math.round(performance.now() - a) + 'ms'; })()`, wait: 800 },
  { js: frame('3D grande') },
  { shot: 'brain-3d-grande' },
  { js: `(() => { S.settings.graph = { ...S.settings.graph, style: 'brain2d' }; updateGraph(); return 'ok'; })()`, wait: 1200, shot: 'brain-2d-grande' },
];
