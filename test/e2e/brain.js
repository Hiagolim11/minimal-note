// Grafo em forma de cérebro: estilos Rede / Cérebro / 3D, clique abre a nota, filtro, desempenho.
const N = Number(process.env.BRAIN_NOTES || 90);
const makeVault = `(async () => {
  const folders = ['Projetos', 'Estudos', 'Diário', 'Ideias', 'Receitas'];
  const names = [];
  for (let i = 0; i < ${N}; i++) names.push((i % 9 === 0 ? '' : folders[i % 5] + '/') + 'Nota ' + i);
  for (let i = 0; i < names.length; i++) {
    const links = [names[(i + 1) % names.length]]; if (i % 4 === 0) links.push(names[(i * 7) % names.length]);
    await lumen.fs.write(names[i] + '.md', '# Nota ' + i + '\\n' + links.map((l) => '[[' + l.split('/').pop() + ']]').join(' ') + (i % 6 === 0 ? ' #viagem' : '') + '\\n');
  }
  await refreshVault();
  await openNote('Projetos/Nota 1.md');
  return 'notas: ' + S.notes.size;
})()`;
const frame = (label) => `(async () => {
  const t = []; for (let i = 0; i < 40; i++) { const a = performance.now(); S.graph.draw(); t.push(performance.now() - a); await new Promise((r) => requestAnimationFrame(r)); }
  t.sort((a, b) => a - b); return '${label}: mediana=' + t[20].toFixed(1) + 'ms p90=' + t[36].toFixed(1) + 'ms';
})()`;
// clica no centro de um nó da visualização (coordenadas da janela)
const nodeAt = (label) => `(() => { const n = S.graph.nodes.find((x) => x.label === ${JSON.stringify(label)}); const s = S.graph.screen(n); const r = S.graph.canvas.getBoundingClientRect(); return { x: r.left + s[0], y: r.top + s[1] }; })()`;
module.exports = [
  { wait: 400, js: makeVault },
  { size: [1280, 800], wait: 300, js: `(() => { addTab({ kind: 'graph' }); return 'grafo'; })()` },
  { wait: 1500, js: `JSON.stringify({ estilo: S.settings.graph.style, classe: S.graph.constructor.name, modo: S.graph.mode, ativo: document.querySelector('#g-style .active')?.dataset.style, nos: S.graph.nodes.length, lobos: S.graph.groups.map((g) => g.map((x) => x.name)) })` },
  { shot: 'brain-2d' },
  { wait: 100, js: frame('2D') },
  // todas as notas dentro do cérebro, no lobo da sua pasta
  { js: `(() => { let fora = 0; for (const n of S.graph.nodes) { if (BrainGeo.deepLobe(n.p[0], n.p[1]) !== n.lobe) fora++; } return 'fora do lobo (2D): ' + fora; })()` },
  // passar o mouse destaca; clicar abre a nota
  { clickAt: nodeAt('Nota 2'), wait: 600, js: `JSON.stringify({ aba: activeTab()?.path, tipo: activeTab()?.kind })` },
  { js: `(() => { addTab({ kind: 'graph' }); return 'de volta ao grafo'; })()`, wait: 800 },
  // filtro
  { js: `(() => { const f = document.getElementById('graph-filter'); f.value = 'Nota 1'; f.dispatchEvent(new Event('input')); return 'filtro: ' + S.graph.filter; })()`, wait: 400, shot: 'brain-2d-filtro' },
  { js: `(() => { const f = document.getElementById('graph-filter'); f.value = ''; f.dispatchEvent(new Event('input')); return 'ok'; })()` },
  // 3D
  { click: '#g-style [data-style="brain3d"]', wait: 1500, js: `JSON.stringify({ estilo: S.settings.graph.style, modo: S.graph.mode, mesma: S.graph.constructor.name, pontos: S.graph.points?.length / 8 })` },
  { shot: 'brain-3d' },
  { wait: 100, js: frame('3D') },
  { js: `(() => { let fora = 0; for (const n of S.graph.nodes) if (!BrainLayout.inside3(n.p, 0.95) || BrainGeo.lobe3(n.p[0], n.p[1]) !== n.lobe) fora++; return 'fora do lobo (3D): ' + fora; })()` },
  // arrastar gira
  { js: `(() => { window.__yaw0 = S.graph.cam.yaw; const c = S.graph.canvas, ev = (t, x) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: 400, pointerId: 7, bubbles: true })); ev('pointerdown', 600); [650, 700, 760, 820].forEach((x) => ev('pointermove', x)); ev('pointerup', 820); return 'arrastou'; })()`, wait: 200 },
  { js: `'girou: ' + (Math.abs(S.graph.cam.yaw - window.__yaw0) > 0.3)` },
  { wait: 2600, shot: 'brain-3d-girado' },
  { clickAt: nodeAt('Nota 3'), wait: 700, js: `JSON.stringify({ aba: activeTab()?.path })` },
  { js: `(() => { addTab({ kind: 'graph' }); return 'de volta ao grafo'; })()`, wait: 800 },
  // volta para a rede clássica
  { click: '#g-style [data-style="net"]', wait: 1200, js: `JSON.stringify({ estilo: S.settings.graph.style, classe: S.graph.constructor.name, brainClass: document.getElementById('graph-view').classList.contains('brain'), canvases: document.querySelectorAll('#graph-canvas canvas').length })` },
  { shot: 'brain-net' },
  { click: '#g-style [data-style="brain2d"]', wait: 800, js: `JSON.stringify({ classe: S.graph.constructor.name, canvases: document.querySelectorAll('#graph-canvas canvas').length })` },
  // celular (tela estreita)
  { size: [400, 800], wait: 900, shot: 'brain-2d-estreito' },
  { size: [1280, 800], wait: 300, js: `'erros: ' + JSON.stringify(window.__errs || [])` },
];
