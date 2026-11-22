const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');

const { GraphView } = load(['src/js/graph.js']);

// tick de referência: a repulsão n² original + o restante do tick (sem arestas nem arraste)
function referenceTick(g) {
  const N = g.nodes, a = g.alpha;
  for (let i = 0; i < N.length; i++) {
    const p = N[i];
    for (let j = i + 1; j < N.length; j++) {
      const q = N[j];
      let dx = q.x - p.x, dy = q.y - p.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
      if (d2 > 250000) continue;
      const f = (900 / d2) * a;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * f * 10, fy = (dy / d) * f * 10;
      p.vx -= fx; p.vy -= fy; q.vx += fx; q.vy += fy;
    }
  }
  for (const n of N) {
    n.vx -= n.x * 0.012 * a; n.vy -= n.y * 0.012 * a;
    n.vx *= 0.82; n.vy *= 0.82;
    n.x += Math.max(-40, Math.min(40, n.vx));
    n.y += Math.max(-40, Math.min(40, n.vy));
  }
}

// nós em posições pseudoaleatórias (semente fixa), sem arestas
function graph(n, spread) {
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const g = Object.create(GraphView.prototype);
  g.nodes = Array.from({ length: n }, () => ({ x: (rnd() - 0.5) * spread, y: (rnd() - 0.5) * spread, vx: 0, vy: 0, deg: 1 }));
  g.edges = []; g.alpha = 1; g.drag = null;
  return g;
}

for (const [n, spread] of [[400, 3000], [300, 200], [600, 8000]]) {
  test(`repulsão em grade = laço n² (${n} nós espalhados em ${spread}px)`, () => {
    const a = graph(n, spread), b = graph(n, spread);
    for (let step = 0; step < 3; step++) { a.tick(); referenceTick(b); b.alpha *= 0.985; }
    for (let i = 0; i < n; i++) {
      const p = a.nodes[i], q = b.nodes[i];
      assert.ok(Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6, `nó ${i}: ${p.x},${p.y} vs ${q.x},${q.y}`);
    }
  });
}
