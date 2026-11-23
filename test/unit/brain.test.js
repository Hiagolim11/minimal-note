const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');

const { BrainGeo: G, BrainLayout: L } = load(['src/js/brain.js']);

// cofre de exemplo: pastas de tamanhos diferentes, links dentro e entre pastas, uma tag e uma nota não criada
function vault(n = 120) {
  const folders = ['Projetos', 'Estudos', 'Diário', 'Ideias', 'Receitas', ''];
  const nodes = [], edges = [];
  for (let i = 0; i < n; i++) {
    const f = folders[i % 7 === 0 ? 5 : i % 5];
    nodes.push({ id: (f ? f + '/' : '') + 'Nota ' + i + '.md', label: 'Nota ' + i, kind: 'note' });
  }
  for (let i = 1; i < n; i++) { edges.push([nodes[i].id, nodes[i - 1].id]); if (i % 4 === 0) edges.push([nodes[i].id, nodes[(i * 7) % n].id]); }
  nodes.push({ id: 'tag:viagem', label: '#viagem', kind: 'tag' });
  edges.push([nodes[0].id, 'tag:viagem'], [nodes[5].id, 'tag:viagem'], [nodes[10].id, 'tag:viagem']);
  nodes.push({ id: 'ghost:futuro', label: 'Futuro', kind: 'ghost' });
  edges.push([nodes[1].id, 'ghost:futuro']);
  return { nodes, edges };
}
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

test('geometria: contorno, lobos e áreas fazem sentido', () => {
  assert.ok(G.inside(0.5, 0.35) && !G.inside(0.01, 0.01) && !G.inside(0.5, 0.95));
  const sum = G.AREA2.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  G.AREA2.forEach((a) => assert.ok(a > 0.06, 'todo lobo tem área'));
  assert.equal(G.lobe2(0.15, 0.3), 0); // frontal
  assert.equal(G.lobe2(0.65, 0.2), 1); // parietal
  assert.equal(G.lobe2(0.45, 0.65), 2); // temporal
  assert.equal(G.lobe2(0.93, 0.45), 3); // occipital
  assert.equal(G.lobe3(-0.6, 0.2), 0);
  assert.equal(G.lobe3(0.8, 0.1), 3);
});

test('assignLobes: pastas inteiras por lobo, carga equilibrada, tags seguem as notas', () => {
  const { nodes, edges } = vault();
  const { lobe, groups, load } = L.assignLobes(nodes, edges);
  // todas as notas de uma pasta no mesmo lobo
  const byFolder = new Map();
  for (const n of nodes.filter((x) => x.kind === 'note')) { const f = L.groupOfPath(n.id); const l = lobe.get(n.id); if (byFolder.has(f)) assert.equal(byFolder.get(f), l, f); else byFolder.set(f, l); }
  // a tag fica no lobo da pasta mais comum entre as notas ligadas (notas 5 e 10 em Projetos; a 0 na raiz)
  assert.equal(lobe.get('tag:viagem'), lobe.get(nodes[5].id));
  assert.equal(lobe.get('ghost:futuro'), lobe.get(nodes[1].id));
  // nenhum lobo com mais que o dobro da carga média (proporcional à área)
  const dens = load.map((x, i) => x / G.AREA2[i]), avg = dens.reduce((a, b) => a + b) / 4;
  dens.forEach((d) => assert.ok(d < avg * 2.5, 'carga ' + d.toFixed(0) + ' vs média ' + avg.toFixed(0)));
  assert.equal(groups.flat().reduce((s, g) => s + g.size, 0), nodes.length);
  assert.ok(groups.flat().some((g) => g.name === 'Notas na raiz'));
  groups.forEach((g, l) => assert.ok(g.length > 0, 'lobo ' + l + ' sem pasta'));
});

test('place 2D: dentro do cérebro, no lobo certo, espaçadas e com vizinhas perto', () => {
  const { nodes, edges } = vault();
  const { lobe, load } = L.assignLobes(nodes, edges);
  const spacing = L.spacingFor(load, G.AREA2, 2);
  const pos = L.place(nodes, edges, lobe, { dims: 2, spacing, sample: L.sampler2(0.012) });
  assert.equal(pos.size, nodes.length);
  for (const n of nodes) { const [x, y] = pos.get(n.id); assert.ok(G.inside(x, y), n.id + ' fora do cérebro'); assert.equal(G.lobe2(x, y), lobe.get(n.id), n.id + ' fora do lobo'); }
  const ps = [...pos.values()];
  let minD = Infinity; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) minD = Math.min(minD, dist(ps[i], ps[j]));
  assert.ok(minD > 0.004, 'notas sobrepostas: ' + minD);
  // vizinhas (mesmo lobo) mais perto que pares aleatórios do mesmo lobo
  const same = edges.filter(([a, b]) => lobe.get(a) === lobe.get(b)).map(([a, b]) => dist(pos.get(a), pos.get(b)));
  const rand = []; for (let i = 0; i < nodes.length; i++) for (let j = i + 3; j < nodes.length; j += 11) if (lobe.get(nodes[i].id) === lobe.get(nodes[j].id)) rand.push(dist(pos.get(nodes[i].id), pos.get(nodes[j].id)));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(same) < mean(rand) * 0.8, `vizinhas ${mean(same).toFixed(3)} vs aleatórias ${mean(rand).toFixed(3)}`);
});

test('place 2D: estável (mesmo resultado; nota nova não move as outras)', () => {
  const { nodes, edges } = vault(80);
  const run = (ns, es, prev) => { const { lobe, load } = L.assignLobes(ns, es); return { pos: L.place(ns, es, lobe, { dims: 2, prev, spacing: L.spacingFor(load, G.AREA2, 2), sample: L.sampler2(0.012) }), lobe }; };
  const a = run(nodes, edges), b = run(nodes, edges);
  for (const n of nodes) assert.deepEqual(a.pos.get(n.id), b.pos.get(n.id));
  const prev = new Map(nodes.map((n) => [n.id, { lobe: a.lobe.get(n.id), p: a.pos.get(n.id) }]));
  const nodes2 = [...nodes, { id: 'Projetos/Nova.md', label: 'Nova', kind: 'note' }], edges2 = [...edges, ['Projetos/Nova.md', nodes[5].id]];
  const c = run(nodes2, edges2, prev);
  let moved = 0; for (const n of nodes) if (c.lobe.get(n.id) === a.lobe.get(n.id) && c.pos.get(n.id) !== a.pos.get(n.id)) moved++;
  assert.equal(moved, 0);
  assert.ok(c.pos.get('Projetos/Nova.md'));
});

test('place 3D: dentro do volume e no lobo certo', () => {
  const { nodes, edges } = vault();
  const { lobe, load } = L.assignLobes(nodes, edges, G.AREA3);
  const pos = L.place(nodes, edges, lobe, { dims: 3, spacing: L.spacingFor(load, G.AREA3, 3), sample: L.sampler3() });
  assert.equal(pos.size, nodes.length);
  for (const n of nodes) { const p = pos.get(n.id); assert.ok(L.inside3(p, 0.94), n.id + ' fora do volume'); assert.equal(G.lobe3(p[0], p[1]), lobe.get(n.id)); }
});

test('desempenho: 3.000 notas posicionadas em menos de 3 s', () => {
  const { nodes, edges } = vault(3000);
  const t0 = Date.now();
  const { lobe, load } = L.assignLobes(nodes, edges);
  const pos = L.place(nodes, edges, lobe, { dims: 2, spacing: L.spacingFor(load, G.AREA2, 2), sample: L.sampler2(0.012) });
  const ms = Date.now() - t0;
  assert.equal(pos.size, nodes.length);
  assert.ok(ms < 3000, ms + ' ms');
});
