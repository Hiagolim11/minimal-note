// Grafo em forma de cérebro: "Cérebro 2D" (neon, vista lateral) e "Cérebro 3D" (nuvem de pontos que gira).
// Cada lobo recebe pastas do cofre; as notas ficam dentro do lobo, perto das notas a que se ligam.
// A geometria e o posicionamento (BrainGeo, BrainLayout) não usam DOM e são testados em test/unit/brain.test.js.

// ---------- geometria ----------
const BrainGeo = (() => {
  // ruído em grade (determinístico): dobras do córtex
  const PERM = new Uint8Array(512);
  { let s = 5; const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
  const fade = (t) => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
  const h2 = (a, b) => PERM[(PERM[a & 255] + (b & 255)) & 511] / 255;
  const h3 = (a, b, c) => PERM[(PERM[(PERM[a & 255] + (b & 255)) & 511] + (c & 255)) & 511] / 255;
  function n2(x, y) { const xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi); return L(L(h2(xi, yi), h2(xi + 1, yi), u), L(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v); }
  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v), L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
  }
  const fbm2 = (x, y) => n2(x, y) * 0.55 + n2(x * 2.1, y * 2.1) * 0.28 + n2(x * 4.3, y * 4.3) * 0.17;
  const fbm3 = (x, y, z) => n3(x, y, z) * 0.6 + n3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + n3(x * 4.2, y * 4.2, z * 4.2) * 0.1;

  // vista lateral (frente à esquerda), coordenadas normalizadas 0..1 de uma caixa com proporção 1 × 0.78
  const OUTLINE = [[0.03,0.47],[0.035,0.33],[0.09,0.19],[0.19,0.09],[0.32,0.03],[0.47,0.01],[0.61,0.025],[0.74,0.075],[0.85,0.16],[0.93,0.28],[0.975,0.41],[0.98,0.51],[0.955,0.59],[0.90,0.635],[0.83,0.645],[0.76,0.65],[0.69,0.685],[0.59,0.725],[0.48,0.74],[0.38,0.73],[0.305,0.70],[0.262,0.655],[0.255,0.60],[0.278,0.565],[0.24,0.585],[0.165,0.605],[0.095,0.59],[0.05,0.545]];
  const SYLVIAN = [[0.278,0.565],[0.36,0.53],[0.46,0.49],[0.56,0.455],[0.63,0.43],[0.675,0.40]];
  const CENTRAL = [[0.535,0.02],[0.52,0.12],[0.50,0.21],[0.485,0.30],[0.46,0.40],[0.445,0.48]];
  const PARIOCC = [[0.845,0.165],[0.83,0.25],[0.82,0.33]];
  const STEM = [[0.60,0.70],[0.615,0.78],[0.632,0.86],[0.645,0.94]];
  const CEREBELLUM = { cx: 0.79, cy: 0.735, rx: 0.155, ry: 0.1, rot: 0.1 };

  // segmentos bézier da spline Catmull-Rom (usados no desenho e no polígono de teste)
  function bezierSegs(pts, closed) {
    const n = pts.length, get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]), out = [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      out.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
    }
    return out;
  }
  const POLY = [];
  for (const [a, b, c, d] of bezierSegs(OUTLINE, true)) {
    for (let k = 0; k < 10; k++) { const t = k / 10, u = 1 - t; POLY.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]); }
  }
  function inside(x, y) {
    let c = false;
    for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
      const [xi, yi] = POLY[i], [xj, yj] = POLY[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  // ponto bem dentro (afastado da borda)
  const insideBy = (x, y, m) => inside(x, y) && inside(x - m, y) && inside(x + m, y) && inside(x, y - m) && inside(x, y + m);
  const interp = (pts, key, v) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], ka = key === 'x' ? a[0] : a[1], kb = key === 'x' ? b[0] : b[1];
      if ((v - ka) * (v - kb) <= 0 && ka !== kb) { const t = (v - ka) / (kb - ka); return key === 'x' ? a[1] + (b[1] - a[1]) * t : a[0] + (b[0] - a[0]) * t; }
    }
    return null;
  };
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  // 0 frontal · 1 parietal · 2 temporal · 3 occipital
  function lobe2(x, y) {
    const sy = interp(SYLVIAN, 'x', clamp(x, 0.279, 0.674));
    if (x > 0.26 && x < 0.8 && sy != null && y > sy + 0.01) return 2;
    if (x < (interp(CENTRAL, 'y', clamp(y, 0.021, 0.479)) ?? 0.45)) return 0;
    if (x > (interp(PARIOCC, 'y', clamp(y, 0.166, 0.329)) ?? 0.82) + (y > 0.33 ? (y - 0.33) * 0.25 : 0)) return 3;
    return 1;
  }

  // 3D: x frente(−)/nuca(+), y cima(+), z lados
  function surface3(dx, dy, dz) {
    let x = dx, y = dy * 0.74, z = dz * 0.66;
    if (y < -0.3) y = -0.3 + (y + 0.3) * 0.45;
    const fiss = Math.exp(-((z / 0.06) ** 2)) * (y > 0 ? 1 : 0.3);
    x *= 1 - fiss * 0.06; y *= 1 - fiss * 0.16;
    const tb = Math.exp(-(((x - 0.05) / 0.45) ** 2) - (((y + 0.32) / 0.14) ** 2)) * (Math.abs(z) > 0.25 ? 1 : 0);
    y -= tb * 0.08; z *= 1 + tb * 0.08;
    const syl = Math.exp(-(((y + 0.12 + (x + 0.2) * 0.25) / 0.035) ** 2)) * (x > -0.4 && x < 0.55 && Math.abs(z) > 0.35 ? 1 : 0);
    const f = Math.sin(fbm3(x * 3.2 + 10, y * 3.2, z * 3.2) * 20);
    const k = 1 + 0.028 * f - syl * 0.05 - fiss * 0.02;
    return { x: x * k, y: y * k, z: z * k, f, fiss, syl };
  }
  function lobe3(x, y) { if (y < -0.18 && x > -0.55 && x < 0.6) return 2; if (x < -0.12) return 0; if (x > 0.6) return 3; return 1; }

  // fração da área (ou volume) de cada lobo, por amostragem determinística
  const AREA2 = [0, 0, 0, 0], AREA3 = [0, 0, 0, 0];
  { let s = 17; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; let n = 0;
    for (let i = 0; i < 6000; i++) { const x = r(), y = r() * 0.78; if (inside(x, y)) { AREA2[lobe2(x, y)]++; n++; } }
    for (let l = 0; l < 4; l++) AREA2[l] /= n;
    for (let i = 0; i < 4000; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u), d = surface3(q * Math.cos(a), u, q * Math.sin(a)); AREA3[lobe3(d.x, d.y)]++; }
    for (let l = 0; l < 4; l++) AREA3[l] /= 4000; }

  // máscara em grade (feita uma vez): lobo de cada célula bem dentro do cérebro (−1 = fora/borda)
  const MR = 360, MH = Math.ceil(MR * 0.78);
  let MASK = null;
  function mask() {
    if (MASK) return MASK;
    const m = 0.012, inn = new Uint8Array(MR * MH);
    for (let j = 0; j < MH; j++) for (let i = 0; i < MR; i++) inn[j * MR + i] = inside((i + 0.5) / MR, (j + 0.5) / MR) ? 1 : 0;
    const d = Math.ceil(m * MR), at = (i, j) => (i < 0 || j < 0 || i >= MR || j >= MH ? 0 : inn[j * MR + i]);
    MASK = new Int8Array(MR * MH).fill(-1);
    for (let j = 0; j < MH; j++) for (let i = 0; i < MR; i++) {
      if (at(i, j) && at(i - d, j) && at(i + d, j) && at(i, j - d) && at(i, j + d)) MASK[j * MR + i] = lobe2((i + 0.5) / MR, (j + 0.5) / MR);
    }
    return MASK;
  }
  // lobo no ponto (x, y) se ele estiver bem dentro do cérebro; senão −1
  const deepLobe = (x, y) => { const i = Math.floor(x * MR), j = Math.floor(y * MR); return i < 0 || j < 0 || i >= MR || j >= MH ? -1 : mask()[j * MR + i]; };

  return { OUTLINE, SYLVIAN, CENTRAL, PARIOCC, STEM, CEREBELLUM, bezierSegs, inside, insideBy, deepLobe, lobe2, surface3, lobe3, fbm2, AREA2, AREA3 };
})();

// ---------- posicionamento das notas ----------
const BrainLayout = (() => {
  const LOBE_NAMES = ['Lobo frontal', 'Lobo parietal', 'Lobo temporal', 'Lobo occipital'];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => { let s = (seed % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
  // pasta de primeiro nível ("" = raiz)
  const groupOfPath = (p) => (p.includes('/') ? p.slice(0, p.indexOf('/')) : '');

  // lobos para as pastas: as maiores primeiro, sempre no lobo com menos carga para a área dele
  function assignLobes(nodes, edges, areas = BrainGeo.AREA2, { groupBy = 'folder' } = {}) {
    const groupOf = new Map(), nb = new Map(nodes.map((n) => [n.id, []]));
    for (const [a, b] of edges) { nb.get(a)?.push(b); nb.get(b)?.push(a); }
    const firstTag = (n) => { const t = (n.tags || [])[0]; return t ? '#' + t.split('/')[0] : 'Sem tag'; };
    for (const n of nodes) if (n.kind === 'note' || !n.kind) groupOf.set(n.id, groupBy === 'tag' ? firstTag(n) : groupOfPath(n.id));
    if (groupBy === 'tag') for (const n of nodes) if (n.kind === 'tag') groupOf.set(n.id, '#' + n.label.replace(/^#/, '').split('/')[0]);
    // tags e notas não criadas ficam com a pasta mais comum entre as notas ligadas
    for (const n of nodes) {
      if (groupOf.has(n.id)) continue;
      const count = new Map();
      for (const m of nb.get(n.id) || []) { const g = groupOf.get(m); if (g != null) count.set(g, (count.get(g) || 0) + 1); }
      groupOf.set(n.id, [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? '');
    }
    const sizes = new Map();
    for (const g of groupOf.values()) sizes.set(g, (sizes.get(g) || 0) + 1);
    const load = [0, 0, 0, 0], groups = [[], [], [], []], lobeOfGroup = new Map();
    const order = [...sizes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const byArea = [0, 1, 2, 3].sort((a, b) => areas[b] - areas[a]);
    order.forEach(([g, size], i) => {
      // as 4 maiores pastas ganham um lobo cada (a maior no maior lobo); as outras vão para o menos carregado
      let best = byArea[i];
      if (i >= 4) { best = 0; for (let l = 1; l < 4; l++) if ((load[l] + size) / areas[l] < (load[best] + size) / areas[best]) best = l; }
      load[best] += size; groups[best].push({ name: g || 'Notas na raiz', size }); lobeOfGroup.set(g, best);
    });
    const lobe = new Map(nodes.map((n) => [n.id, lobeOfGroup.get(groupOf.get(n.id))]));
    return { lobe, groups, load };
  }

  // ordem de colocação: busca em largura (vizinhos são colocados logo depois uns dos outros)
  function bfsOrder(nodes, nbOf) {
    const seen = new Set(), out = [];
    const sorted = [...nodes].sort((a, b) => (nbOf.get(b.id)?.length || 0) - (nbOf.get(a.id)?.length || 0) || (a.id < b.id ? -1 : 1));
    for (const s of sorted) {
      if (seen.has(s.id)) continue;
      const q = [s]; seen.add(s.id);
      while (q.length) { const n = q.shift(); out.push(n); for (const m of nbOf.get(n.id) || []) if (!seen.has(m.id)) { seen.add(m.id); q.push(m); } }
    }
    return out;
  }

  // coloca as notas: mantém as que já tinham lugar no mesmo lobo; as novas vão para o ponto livre
  // mais perto das vizinhas. `sample(lobe, r)` devolve um ponto aleatório do lobo; `dims` = 2 ou 3.
  function place(nodes, edges, lobe, { prev = new Map(), dims = 2, sample, spacing }) {
    const byId = new Map(nodes.map((n) => [n.id, n])), nbOf = new Map(nodes.map((n) => [n.id, []]));
    for (const [a, b] of edges) { const A = byId.get(a), B = byId.get(b); if (A && B && A !== B) { nbOf.get(a).push(B); nbOf.get(b).push(A); } }
    const pos = new Map(), cell = Math.max(...spacing) || 0.05, grid = new Map();
    const key = (p) => Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell) + (dims === 3 ? ',' + Math.floor(p[2] / cell) : '');
    const add = (id, p) => { pos.set(id, p); const k = key(p); (grid.get(k) || grid.set(k, []).get(k)).push(p); };
    const nearest = (p) => {
      let best = Infinity; const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = dims === 3 ? Math.floor(p[2] / cell) : 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = (dims === 3 ? -1 : 0); k <= (dims === 3 ? 1 : 0); k++) {
        for (const q of grid.get((cx + i) + ',' + (cy + j) + (dims === 3 ? ',' + (cz + k) : '')) || []) {
          let d = 0; for (let t = 0; t < dims; t++) d += (q[t] - p[t]) ** 2; if (d < best) best = d;
        }
      }
      return Math.sqrt(best);
    };
    for (const n of nodes) { const p = prev.get(n.id); if (p && p.lobe === lobe.get(n.id)) add(n.id, p.p); }
    for (const n of bfsOrder(nodes, nbOf)) {
      if (pos.has(n.id)) continue;
      const l = lobe.get(n.id), r = rng(hash(n.id)), sp = spacing[l];
      const placedNb = nbOf.get(n.id).filter((m) => pos.has(m.id) && lobe.get(m.id) === l).map((m) => pos.get(m.id));
      const centroid = placedNb.length ? placedNb[0].map((_, t) => placedNb.reduce((s, p) => s + p[t], 0) / placedNb.length) : null;
      let best = null, bestScore = -Infinity;
      for (let k = 0; k < 18; k++) {
        let p = null;
        if (centroid && k < 12) {
          // perto das vizinhas: tenta pontos em volta e fica com um que caia no lobo
          for (let tries = 0; tries < 6 && !p; tries++) { const c = sample(l, r, centroid, sp * 2.2); if (c) p = c; }
        }
        if (!p) p = sample(l, r);
        if (!p) continue;
        const free = Math.min(nearest(p), sp);
        const pull = centroid ? Math.sqrt(p.reduce((s, v, t) => s + (v - centroid[t]) ** 2, 0)) : 0;
        const score = free - pull * 0.35;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) add(n.id, best);
    }
    return pos;
  }

  // amostradores
  function sampler2(margin) {
    return (l, r, around, rad) => {
      for (let t = 0; t < 40; t++) {
        const x = around ? around[0] + (r() * 2 - 1) * rad : 0.04 + r() * 0.93;
        const y = around ? around[1] + (r() * 2 - 1) * rad : 0.02 + r() * 0.72;
        if (BrainGeo.deepLobe(x, y) === l) return [x, y];
        if (around) return null;
      }
      return null;
    };
  }
  function sampler3() {
    return (l, r, around, rad) => {
      for (let t = 0; t < 40; t++) {
        let p;
        if (around) p = around.map((v) => v + (r() * 2 - 1) * rad);
        else { const u = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - u * u), d = BrainGeo.surface3(q * Math.cos(a), u, q * Math.sin(a)), k = 0.5 + r() * 0.42; p = [d.x * k, d.y * k, d.z * k]; }
        // dentro do volume: compara com a superfície na mesma direção (desfazendo a escala do elipsoide)
        if (inside3(p, 0.93) && BrainGeo.lobe3(p[0], p[1]) === l) return p;
        if (around) return null;
      }
      return null;
    };
  }
  function inside3(p, k = 1) {
    const d = [p[0], p[1] / 0.74, p[2] / 0.66], len = Math.hypot(...d) || 1;
    const s = BrainGeo.surface3(d[0] / len, d[1] / len, d[2] / len);
    return Math.hypot(...p) < Math.hypot(s.x, s.y, s.z) * k;
  }
  function spacingFor(load, areas, dims, scale = 1) {
    return load.map((n, l) => {
      if (!n) return 0.05;
      const s = dims === 2 ? Math.sqrt((areas[l] * 0.55) / n) : Math.cbrt((areas[l] * 1.3) / n);
      return Math.max(dims === 2 ? 0.006 : 0.02, Math.min(dims === 2 ? 0.06 : 0.16, s * 0.85 * scale));
    });
  }

  const api = { LOBE_NAMES, assignLobes, place, sampler2, sampler3, spacingFor, inside3, groupOfPath, hash, rng };
  return api;
})();

// ---------- visualização ----------
class BrainView {
  static LOBE = ['#46d9ff', '#5b7bff', '#a46dff', '#e86bff'];
  constructor(container, { onOpen, getActive, mode = '2d' }) {
    this.el = container; this.onOpen = onOpen; this.getActive = getActive; this.mode = mode;
    this.canvas = document.createElement('canvas'); this.ctx = this.canvas.getContext('2d');
    this.canvas.className = 'brain-canvas';
    this.el.appendChild(this.canvas);
    this.nodes = []; this.edges = []; this.byId = new Map(); this.prev = { '2d': new Map(), '3d': new Map() };
    this.filter = ''; this.showLabels = true; this.hover = null; this.running = false;
    this.view = { x: 0, y: 0, k: 1 }; this.cam = { yaw: -0.55, pitch: 0.18, zoom: 1 };
    this.pulses = []; this.waveT = 0; this.waveFrom = null; this.lastInteract = 0;
    this.lobeRGB = BrainView.LOBE.map((h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; });
    this.sprites = this.lobeRGB.map((c) => BrainView.sprite(c)); this.whiteSprite = BrainView.sprite([200, 225, 255]);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.el);
    this.bind();
  }
  readColors() { this.font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'system-ui'; }
  get calm() { return matchMedia('(prefers-reduced-motion: reduce)').matches || (typeof S !== 'undefined' && S.settings?.animations === false) || !!window.lumen?.power?.(); }
  // brilho pré-desenhado (desenhar um gradiente por nó a cada quadro custa caro com milhares de notas)
  static sprite([r, g, b]) {
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d'), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, `rgba(${r},${g},${b},0.95)`); gr.addColorStop(0.35, `rgba(${r},${g},${b},0.25)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, s, s); return c;
  }

  setGroupBy(g) { if (g === this.groupBy) return; this.groupBy = g; this.prev = { '2d': new Map(), '3d': new Map() }; this.layout(); this.kick(); }
  setFocus(on) { this.focusMode = !!on; this.kick(); }
  setTime(t) { this.timeCut = t; this.kick(); }
  // linha do tempo: o cérebro cresce do primeiro dia até hoje em ~8 s
  play(onTick) {
    if (this.playing) { this.playing = false; return false; }
    const [a, b] = this.timeRange; if (!(b > a)) return false;
    this.playing = true; const t0 = performance.now(), dur = 8000; this.playAt = [t0, dur];
    const step = () => { if (!this.playing) return; const k = Math.min(1, (performance.now() - t0) / dur); this.setTime(a + (b - a) * k); onTick?.(this.timeCut, k); if (k < 1) setTimeout(step, 33); else { this.playing = false; this.setTime(null); onTick?.(null, 1); } };
    setTimeout(step, 33); return true; // pelo relógio: funciona mesmo com a janela em segundo plano
  }
  // corte de tempo atual (durante o ▶ vem do relógio, mesmo que os timers atrasem)
  cut() {
    if (!this.playing) return this.timeCut;
    const [a, b] = this.timeRange, k = Math.min(1, (performance.now() - this.playAt[0]) / this.playAt[1]);
    return k >= 1 ? null : a + (b - a) * k;
  }
  // visível com os filtros de tempo e de foco
  visible(n) {
    const cut = this.cut(); if (cut != null && (n.ctime || 0) > cut) return false;
    if (this.focusMode && this.waveFrom && this.hops) { const h = this.hops.get(n); return h != null && h <= 2; }
    return true;
  }

  setMode(mode) { if (mode === this.mode) return; this.mode = mode; this.layout(); this.still = null; this.points = null; this.kick(); }

  setData({ nodes, edges }) {
    this.byId = new Map();
    this.nodes = nodes.map((n) => { const node = { ...n, deg: 0 }; this.byId.set(n.id, node); return node; });
    this.rawEdges = edges.filter(([a, b]) => a !== b && this.byId.has(a) && this.byId.has(b));
    this.edges = this.rawEdges.map(([a, b]) => ({ s: this.byId.get(a), t: this.byId.get(b) }));
    this.edges.forEach((e) => { e.s.deg++; e.t.deg++; });
    this.neighbors = new Map(this.nodes.map((n) => [n, new Set()]));
    this.edges.forEach((e) => { this.neighbors.get(e.s).add(e.t); this.neighbors.get(e.t).add(e.s); });
    for (const n of this.nodes) if (n.ctime == null) { let c = Infinity; for (const m of this.neighbors.get(n)) if (m.ctime != null && m.ctime < c) c = m.ctime; n.ctime = c === Infinity ? 0 : c; }
    this.timeRange = this.nodes.length ? [Math.min(...this.nodes.map((n) => n.ctime || 0)), Math.max(...this.nodes.map((n) => n.ctime || 0))] : [0, 0];
    this.layout();
    this.waveFrom = null; this.pulses = []; this.hover = null; this.hops = null;
    this.start();
  }

  layout() {
    const dims = this.mode === '3d' ? 3 : 2, areas = dims === 3 ? BrainGeo.AREA3 : BrainGeo.AREA2;
    const { lobe, groups, load } = BrainLayout.assignLobes(this.nodes, this.rawEdges || [], areas, { groupBy: this.groupBy || 'folder' });
    this.groups = groups;
    const spacing = BrainLayout.spacingFor(load, areas, dims);
    const pos = BrainLayout.place(this.nodes, this.rawEdges || [], lobe, { prev: this.prev[this.mode], dims, spacing, sample: dims === 3 ? BrainLayout.sampler3() : BrainLayout.sampler2(0.012) });
    const keep = new Map();
    for (const n of this.nodes) {
      n.lobe = lobe.get(n.id) ?? 0;
      const p = pos.get(n.id) || (dims === 3 ? [0, 0, 0] : [0.4, 0.35]);
      n.p = p; keep.set(n.id, { lobe: n.lobe, p });
      n.r = (n.kind === 'tag' ? 1.6 : n.kind === 'ghost' ? 1.8 : 2.2) + Math.min(3.2, Math.sqrt(n.deg) * 0.9);
    }
    this.prev[this.mode] = keep;
    this.nodeScale = Math.max(0.45, Math.min(1, Math.sqrt(60 / Math.max(this.nodes.length, 1))));
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = r.width; this.height = r.height; this.dpr = dpr;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    const bw = Math.min(r.width * (r.width < 600 ? 0.96 : 0.86), (r.height - 70) / 0.95 / 0.78), bh = bw * 0.78;
    this.box = { x: (r.width - bw) / 2, y: (r.height - bh * 0.95) / 2 + 14, w: bw, h: bh };
    this.still = null; this.bg = null;
    this.stars = null;
    this.kick();
  }

  // ---- 2D ----
  P(p) { return [this.box.x + p[0] * this.box.w, this.box.y + p[1] * this.box.h]; }
  path(g, pts, closed) { const seg = BrainGeo.bezierSegs(pts, closed), P = (q) => this.P(q); g.moveTo(...P(seg[0][0])); for (const [, b, c, d] of seg) g.bezierCurveTo(...P(b), ...P(c), ...P(d)); if (closed) g.closePath(); }
  buildStill() {
    const { width: W, height: H, dpr, box } = this, B = BrainGeo;
    const off = document.createElement('canvas'); off.width = W * dpr; off.height = H * dpr;
    const g = off.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cer = () => { g.beginPath(); this.path(g, B.OUTLINE, true); };
    const cbl = () => { const c = B.CEREBELLUM; g.beginPath(); g.ellipse(box.x + c.cx * box.w, box.y + c.cy * box.h, c.rx * box.w, c.ry * box.h, c.rot, 0, Math.PI * 2); };
    const rgba = (l, a) => `rgba(${this.lobeRGB[l].join(',')},${a})`;
    const halo = g.createRadialGradient(box.x + box.w * 0.5, box.y + box.h * 0.4, box.w * 0.1, box.x + box.w * 0.5, box.y + box.h * 0.42, box.w * 0.7);
    halo.addColorStop(0, 'rgba(70,120,255,0.28)'); halo.addColorStop(0.6, 'rgba(90,60,220,0.10)'); halo.addColorStop(1, 'rgba(40,40,120,0)'); g.fillStyle = halo; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    cer(); const body = g.createRadialGradient(box.x + box.w * 0.4, box.y + box.h * 0.3, 0, box.x + box.w * 0.5, box.y + box.h * 0.4, box.w * 0.6);
    body.addColorStop(0, 'rgba(70,130,255,0.30)'); body.addColorStop(0.7, 'rgba(70,60,200,0.16)'); body.addColorStop(1, 'rgba(120,60,255,0.10)'); g.fillStyle = body; g.fill();
    cbl(); g.fillStyle = 'rgba(80,100,255,0.16)'; g.fill();
    g.beginPath(); this.path(g, B.STEM, false); g.lineCap = 'round';
    for (const [w, a] of [[box.w * 0.05, 0.08], [box.w * 0.032, 0.12], [box.w * 0.016, 0.18], [1.4, 0.6]]) { g.strokeStyle = `rgba(90,150,255,${a})`; g.lineWidth = w; g.stroke(); }
    g.save(); cer(); g.clip();
    // malha fina (plexo)
    const r = BrainLayout.rng(7), mesh = [];
    for (let t = 0; mesh.length < 420 && t < 12000; t++) { const x = r() * 0.98, y = r() * 0.76; if (!B.inside(x, y)) continue; mesh.push([x, y]); }
    g.lineWidth = 0.6;
    mesh.forEach((m, i) => {
      mesh.map((o, j) => [j, (o[0] - m[0]) ** 2 + (o[1] - m[1]) ** 2]).filter((q) => q[0] > i).sort((a, b) => a[1] - b[1]).slice(0, 3)
        .forEach(([j, d2]) => { if (d2 > 0.0056) return; const o = mesh[j]; g.strokeStyle = rgba(B.lobe2(m[0], m[1]), 0.2); g.beginPath(); g.moveTo(...this.P(m)); g.lineTo(...this.P(o)); g.stroke(); });
    });
    // giros: curvas de nível do ruído, como tubos de luz
    const res = 2.6, sc = 7.5 / box.w, cols = Math.ceil(box.w / res) + 2, rows = Math.ceil(box.h / res) + 2, F = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = box.x + i * res, y = box.y + j * res; F[j * cols + i] = Math.sin(B.fbm2(x * sc * 1.05, y * sc * 1.2) * 21 + B.fbm2(y * sc * 3, x * sc * 3) * 2.4); }
    const segs = [[], [], [], []], lerp = (a, b) => a / (a - b);
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = F[j * cols + i], b = F[j * cols + i + 1], c = F[(j + 1) * cols + i + 1], d = F[(j + 1) * cols + i], x = box.x + i * res, y = box.y + j * res, pts = [];
      if ((a > 0) !== (b > 0)) pts.push([x + res * lerp(a, b), y]); if ((b > 0) !== (c > 0)) pts.push([x + res, y + res * lerp(b, c)]);
      if ((d > 0) !== (c > 0)) pts.push([x + res * lerp(d, c), y + res]); if ((a > 0) !== (d > 0)) pts.push([x, y + res * lerp(a, d)]);
      if (pts.length < 2) continue;
      const l = B.lobe2((x - box.x) / box.w, (y - box.y) / box.h);
      segs[l].push(pts[0], pts[1]); if (pts.length === 4) segs[l].push(pts[2], pts[3]);
    }
    const tube = (white, w, a, blur) => segs.forEach((s, l) => { g.beginPath(); for (let k = 0; k < s.length; k += 2) { g.moveTo(...s[k]); g.lineTo(...s[k + 1]); } g.strokeStyle = white ? `rgba(228,247,255,${a})` : rgba(l, a); g.lineWidth = w; g.lineCap = 'round'; g.shadowColor = rgba(l, 0.9); g.shadowBlur = blur; g.stroke(); g.shadowBlur = 0; });
    tube(false, 7, 0.12, 0); tube(false, 3, 0.42, 12); tube(true, 1, 0.8, 0);
    g.beginPath(); this.path(g, B.SYLVIAN, false); g.strokeStyle = 'rgba(120,170,255,0.30)'; g.lineWidth = 6; g.stroke(); g.strokeStyle = 'rgba(220,240,255,0.75)'; g.lineWidth = 1.6; g.shadowColor = '#7fb2ff'; g.shadowBlur = 12; g.stroke(); g.shadowBlur = 0;
    g.restore();
    g.save(); cbl(); g.clip(); { const c = B.CEREBELLUM, cx = box.x + c.cx * box.w, cy = box.y + c.cy * box.h, rx = c.rx * box.w, ry = c.ry * box.h;
      for (let k = -9; k <= 9; k++) { g.beginPath(); for (let i = 0; i <= 60; i++) { const t = i / 60, x = cx - rx * 1.1 + t * rx * 2.2, y = cy + k * ry * 0.12 + Math.sin(t * Math.PI) * ry * 0.3 * (k / 9) - Math.sin(t * Math.PI) * ry * 0.14 + Math.sin(t * 26 + k); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokeStyle = 'rgba(140,170,255,0.55)'; g.lineWidth = 1.1; g.shadowColor = '#6f8cff'; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0; } }
    g.restore();
    for (const p of [cer, cbl]) { p(); g.strokeStyle = 'rgba(110,190,255,0.35)'; g.lineWidth = 7; g.shadowColor = '#5aa8ff'; g.shadowBlur = 24; g.stroke(); p(); g.strokeStyle = 'rgba(220,245,255,0.9)'; g.lineWidth = 1.6; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0; }
    this.still = off;
  }
  buildBg() {
    const { width: W, height: H, dpr } = this, off = document.createElement('canvas'); off.width = W * dpr; off.height = H * dpr;
    const g = off.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#0b1636'); bg.addColorStop(0.5, '#070c22'); bg.addColorStop(1, '#03050c'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    this.bg = off;
    const r = BrainLayout.rng(3);
    this.stars = [...Array(this.mode === '3d' ? 420 : 200)].map(() => {
      const u = r() * 2 - 1, a = r() * 6.28, s = Math.sqrt(1 - u * u), d = 1.4 + r() * 2.4;
      return { x: r() * W, y: r() * H, v: [s * Math.cos(a) * d, u * d * 0.7, s * Math.sin(a) * d], r: 0.5 + r() * 1.3, ph: r() * 6.28, c: r() < 0.7 ? '120,210,255' : '196,139,255', vx: (r() - 0.5) * 0.08, vy: (r() - 0.5) * 0.08 };
    });
  }

  // ---- 3D ----
  buildPoints() {
    // menos pontos em telas pequenas (celular) e no modo de economia/sem animações
    const small = this.width * this.height < 450000 || !!window.lumen?.power?.();
    const target = small ? 8000 : 17000, r = BrainLayout.rng(9), pts = [];
    for (let i = 0; i < target * 20 && pts.length < target * 8; i++) { // 8 números por ponto
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = BrainGeo.surface3(s * Math.cos(a), u, s * Math.sin(a));
      if (d.fiss > 0.7 && d.y > 0.2) continue;
      const line = Math.abs(d.f) < 0.16;
      if (!line && r() > 0.05) continue;
      const c = this.lobeRGB[BrainGeo.lobe3(d.x, d.y)];
      pts.push(d.x, d.y, d.z, c[0], c[1], c[2], line ? (d.syl > 0.5 ? 0.5 : 1) : 0.3, line ? 1.3 : 0.9);
    }
    for (let i = 0; i < (small ? 2500 : 5000); i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), stripe = Math.abs(Math.sin(u * 26)) > 0.8 ? 1 : 0.12;
      pts.push(0.62 + s * Math.cos(a) * 0.3, -0.42 + u * 0.17, s * Math.sin(a) * 0.48, 120, 150, 255, stripe, 1.1);
    }
    for (let i = 0; i < 700; i++) { const t = r(), a = r() * 6.28, rr = 0.09 - t * 0.03; pts.push(0.32 + t * 0.12 + Math.cos(a) * rr, -0.38 - t * 0.5, Math.sin(a) * rr, 90, 140, 255, 0.5, 0.9); }
    this.points = new Float32Array(pts);
  }
  proj(x, y, z) {
    const { yaw, pitch, zoom } = this.cam, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const f = 3.2 / (3.2 + z2), s = Math.min(this.width * (this.width < 600 ? 1.15 : 1), this.height * 1.3) * 0.38 * zoom * f;
    return [this.width / 2 + x1 * s, this.height * 0.5 - y2 * s, z2, f];
  }

  // posição de tela de cada nó (2D: com pan/zoom; 3D: projeção)
  screen(n) {
    if (this.mode === '3d') return this.proj(n.p[0], n.p[1], n.p[2]);
    const [x, y] = this.P(n.p), { view, width: W, height: H } = this;
    return [(x - W / 2) * view.k + W / 2 + view.x, (y - H / 2) * view.k + H / 2 + view.y, 0, view.k];
  }

  start() { if (this.running) return; this.running = true; const loop = (t) => { if (!this.running) return; this.draw(t); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  kick() { this.dirty = true; }

  wave(from) {
    const dist = new Map([[from, 0]]), q = [from];
    while (q.length) { const u = q.shift(); for (const v of this.neighbors.get(u) || []) if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); q.push(v); } }
    this.hops = dist; this.waveT = performance.now();
  }

  draw(now = performance.now()) {
    const { ctx, width: W, height: H } = this;
    if (!W) return;
    const calm = this.calm;
    // modo calmo: só redesenha quando algo muda
    if (calm && !this.dirty) return;
    this.dirty = false;
    if (!this.bg) this.buildBg();
    if (this.mode === '2d' && !this.still) this.buildStill();
    if (this.mode === '3d' && !this.points) this.buildPoints();
    const t = now / 1000, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bg, 0, 0, W, H);
    // nota aberta: onda de luz pelas notas ligadas
    const activeId = this.getActive?.(), active = activeId ? this.byId.get(activeId) : null;
    if (active && (active !== this.waveFrom || (!calm && now - this.waveT > 5000))) { this.waveFrom = active; this.wave(active); }
    if (!active) this.waveFrom = null;
    if (!active) this.hops = null;
    const lit = (n) => { if (calm || !this.hops?.has(n)) return 0; const s = (now - this.waveT) / 1000 - this.hops.get(n) * 0.42; return s > 0 && s < 1.5 ? 1 - s / 1.5 : 0; };
    ctx.globalCompositeOperation = 'lighter';
    // estrelas
    for (const s of this.stars) {
      let x = s.x, y = s.y, f = 1;
      if (this.mode === '3d') { const p = this.proj(...s.v); x = p[0]; y = p[1]; f = p[3]; } else if (!calm) { s.x = (s.x + s.vx + W) % W; s.y = (s.y + s.vy + H) % H; }
      ctx.fillStyle = `rgba(${s.c},${(0.25 + (calm ? 0.2 : 0.3 * Math.sin(t * 1.2 + s.ph))) * f})`; ctx.fillRect(x, y, s.r * f, s.r * f);
    }
    if (this.mode === '3d') {
      if (!calm && performance.now() - this.lastInteract > 2500) { this.cam.yaw += 0.0025; }
      // projeção inline e pontos agrupados por cor × 8 níveis de brilho: uma troca de cor por grupo
      const P = this.points, { yaw, pitch, zoom } = this.cam, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const base = Math.min(W * (W < 600 ? 1.15 : 1), H * 1.3) * 0.38 * zoom, cx0 = W / 2, cy0 = H * 0.5, rz = zoom * 0.9 + 0.3;
      const buckets = this.buckets || (this.buckets = new Map());
      for (const b of buckets.values()) b.n = 0;
      for (let i = 0; i < P.length; i += 8) {
        const x = P[i], y = P[i + 1], z = P[i + 2], x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        const depth = Math.max(0.15, Math.min(1, 0.75 - z2 * 0.55)), a = P[i + 6] * depth * 0.8;
        if (a < 0.03) continue;
        const f = 3.2 / (3.2 + z2), s = base * f, key = P[i + 3] * 65536 + P[i + 4] * 256 + P[i + 5] + Math.min(7, Math.floor(a * 8)) * 16777216;
        let b = buckets.get(key);
        if (!b) { b = { a: (Math.min(7, Math.floor(a * 8)) + 0.5) / 8, c: `${P[i + 3]},${P[i + 4]},${P[i + 5]}`, xs: new Float32Array(4096), n: 0 }; buckets.set(key, b); }
        if (b.n * 3 + 3 > b.xs.length) { const nx = new Float32Array(b.xs.length * 2); nx.set(b.xs); b.xs = nx; }
        b.xs[b.n * 3] = cx0 + x1 * s; b.xs[b.n * 3 + 1] = cy0 - y2 * s; b.xs[b.n * 3 + 2] = P[i + 7] * f * rz; b.n++;
      }
      for (const b of buckets.values()) {
        if (!b.n) continue;
        ctx.fillStyle = `rgba(${b.c},${b.a})`; ctx.beginPath();
        for (let k = 0; k < b.n; k++) { const r = b.xs[k * 3 + 2]; ctx.rect(b.xs[k * 3] - r / 2, b.xs[k * 3 + 1] - r / 2, r, r); }
        ctx.fill();
      }
    } else {
      const { view } = this;
      ctx.save(); ctx.translate(W / 2 + view.x, H / 2 + view.y); ctx.scale(view.k, view.k); ctx.translate(-W / 2, -H / 2);
      ctx.drawImage(this.still, 0, 0, W, H); ctx.restore();
    }
    // posições de tela
    const focus = this.hover, nb = focus ? this.neighbors.get(focus) : null, q = this.filter.trim().toLowerCase();
    const scr = new Map(); for (const n of this.nodes) scr.set(n, this.screen(n));
    const dimmed = (n) => (focus && n !== focus && !nb.has(n)) || (q && !n.label.toLowerCase().includes(q));
    // links: os normais num caminho só; os acesos à parte
    // com muitas notas o brilho somado estoura: links e notas ficam mais suaves conforme a quantidade
    const dens = Math.min(1, Math.sqrt(180 / Math.max(1, this.edges.length))), ndens = Math.min(1, Math.sqrt(160 / Math.max(1, this.nodes.length)));
    ctx.lineWidth = 0.8; ctx.strokeStyle = `rgba(150,210,255,${(0.16 * dens).toFixed(3)})`; ctx.beginPath();
    const hot = [];
    const vis = new Set(this.nodes.filter((n) => this.visible(n)));
    for (const n of this.nodes) { if (vis.has(n)) { if (!n.shownAt) n.shownAt = now; } else n.shownAt = 0; }
    for (const e of this.edges) {
      if (!vis.has(e.s) || !vis.has(e.t)) continue;
      const a = scr.get(e.s), b = scr.get(e.t);
      const on = (focus && (e.s === focus || e.t === focus)) || Math.max(lit(e.s), lit(e.t)) > 0.05;
      if (on) { hot.push(e); continue; }
      if (focus || q) continue;
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    for (const e of hot) {
      const a = scr.get(e.s), b = scr.get(e.t), k = focus && (e.s === focus || e.t === focus) ? 1 : Math.max(lit(e.s), lit(e.t));
      const k3 = this.mode === '3d' && !(focus && (e.s === focus || e.t === focus)) ? k * 0.55 : k;
      ctx.strokeStyle = `rgba(170,220,255,${0.22 + 0.6 * k3})`; ctx.lineWidth = 0.8 + k3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // pulsos correndo pelos links
    if (!calm && this.edges.length && Math.random() < 0.25) { const e = this.edges[Math.floor(Math.random() * this.edges.length)]; if (vis.has(e.s) && vis.has(e.t)) this.pulses.push({ e, s: now, rev: Math.random() < 0.5 }); }
    this.pulses = this.pulses.filter((p) => now - p.s < 1000);
    for (const p of this.pulses) {
      const a = scr.get(p.rev ? p.e.t : p.e.s), b = scr.get(p.rev ? p.e.s : p.e.t);
      if (!a || !b) continue;
      const k = (now - p.s) / 1000, sz = 14 * this.nodeScale * (a[3] || 1);
      ctx.drawImage(this.sprites[(p.rev ? p.e.t : p.e.s).lobe], a[0] + (b[0] - a[0]) * k - sz / 2, a[1] + (b[1] - a[1]) * k - sz / 2, sz, sz);
    }
    // notas (de trás para a frente no 3D)
    const shown = this.nodes.filter((n) => vis.has(n));
    const order = this.mode === '3d' ? shown.sort((a, b) => scr.get(b)[2] - scr.get(a)[2]) : shown;
    for (const n of order) {
      const s = scr.get(n), L = lit(n), isA = n === active, depth = this.mode === '3d' ? Math.max(0.35, Math.min(1, 0.85 - s[2] * 0.5)) : 1;
      const pulse = calm ? 0 : 0.12 * Math.sin(t * 2 + (n.id.length % 7));
      const grow = Math.min(1, (now - (n.shownAt || 0)) / 450), pop = grow < 1 ? 1 - (1 - grow) ** 3 : 1;
      let k = (1 + pulse + L * 0.9 + (isA ? 1.1 : 0) + (n === focus ? 0.8 : 0) + (grow < 1 ? (1 - grow) * 1.5 : 0)) * pop * (this.mode === '3d' ? s[3] : Math.sqrt(this.view.k));
      ctx.globalAlpha = (dimmed(n) ? 0.18 : depth) * (isA || n === focus || L > 0 ? 1 : 0.35 + 0.65 * ndens);
      const size = n.r * 7 * k * this.nodeScale, spr = n.kind === 'ghost' ? this.whiteSprite : this.sprites[n.lobe];
      ctx.drawImage(spr, s[0] - size / 2, s[1] - size / 2, size, size);
      if (isA && !dimmed(n)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 4 + 0.2, Lr = size * 1.1; ctx.beginPath(); ctx.moveTo(s[0] - Math.cos(ang) * Lr, s[1] - Math.sin(ang) * Lr); ctx.lineTo(s[0] + Math.cos(ang) * Lr, s[1] + Math.sin(ang) * Lr); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // rótulos: sem sobreposição; prioridade para foco, nota aberta, vizinhas e as mais ligadas
    if (this.showLabels !== false || focus || q) {
      ctx.font = `500 11.5px ${this.font || 'system-ui'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const placed = [], cand = shown.filter((n) => {
        if (n === focus || n === active || nb?.has(n)) return true;
        if (q) return n.label.toLowerCase().includes(q);
        if (this.showLabels === false || focus) return false;
        return n.deg >= 3 || this.nodes.length < 40 || (this.mode === '2d' && this.view.k > 1.6);
      }).sort((a, b) => (b === focus) - (a === focus) || (b === active) - (a === active) || b.deg - a.deg).slice(0, Math.max(12, Math.round((W * H) / 14000)));
      for (const n of cand) {
        const s = scr.get(n); if (this.mode === '3d' && s[2] > 0.4 && n !== focus) continue;
        const w = ctx.measureText(n.label).width + 8, x = s[0] - w / 2, y = s[1] + 8;
        if (placed.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + 16 && y + 16 > r.y)) continue;
        placed.push({ x, y, w });
        ctx.fillStyle = 'rgba(6,10,30,0.62)'; ctx.beginPath(); ctx.roundRect(x, y, w, 16, 4); ctx.fill();
        ctx.fillStyle = n === focus || n === active ? '#fff' : 'rgba(220,235,255,0.88)'; ctx.fillText(n.label, s[0], y + 2);
      }
    }
    // legenda dos lobos
    ctx.font = `12px ${this.font || 'system-ui'}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const rows = this.groups.map((g, l) => [l, g]).filter(([, g]) => g.length);
    rows.forEach(([l, g], i) => {
      const y = H - 18 - (rows.length - 1 - i) * 20, names = g.slice(0, 2).map((x) => x.name).join(', ') + (g.length > 2 ? ` +${g.length - 2}` : '');
      ctx.fillStyle = BrainView.LOBE[l]; ctx.beginPath(); ctx.arc(20, y, 5, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(230,236,255,0.85)'; ctx.fillText(`${BrainLayout.LOBE_NAMES[l]} · ${names}`, 32, y);
    });
    if (!calm) this.dirty = true;
  }

  pick(px, py) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (!this.visible(n)) continue;
      const s = this.screen(n), r = Math.max(9, n.r * 2.2 * this.nodeScale * (s[3] || 1)), d = (s[0] - px) ** 2 + (s[1] - py) ** 2;
      if (d < r * r && d < bd && (this.mode !== '3d' || s[2] < 0.9)) { best = n; bd = d; }
    }
    return best;
  }

  bind() {
    const cv = this.canvas;
    let start = null, moved = false;
    const touches = new Map();
    const zoomBy = (f, cx, cy) => {
      if (this.mode === '3d') this.cam.zoom = Math.max(0.6, Math.min(2.4, this.cam.zoom * f));
      else {
        const px = cx - this.width / 2, py = cy - this.height / 2, k = Math.min(4, Math.max(0.5, this.view.k * f));
        this.view.x = px - ((px - this.view.x) * k) / this.view.k; this.view.y = py - ((py - this.view.y) * k) / this.view.k; this.view.k = k;
      }
      this.lastInteract = performance.now(); this.kick();
    };
    cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touches.set(e.pointerId, [e.clientX, e.clientY]); });
    cv.addEventListener('pointermove', (e) => {
      if (!touches.has(e.pointerId)) return;
      const prev = [...touches.values()]; touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size !== 2) return;
      const now = [...touches.values()], d0 = Math.hypot(prev[0][0] - prev[1][0], prev[0][1] - prev[1][1]), d1 = Math.hypot(now[0][0] - now[1][0], now[0][1] - now[1][1]);
      const r = cv.getBoundingClientRect();
      if (d0 > 0) zoomBy(d1 / d0, (now[0][0] + now[1][0]) / 2 - r.left, (now[0][1] + now[1][1]) / 2 - r.top);
      moved = true; start = null;
    });
    const lift = (e) => touches.delete(e.pointerId);
    cv.addEventListener('pointerup', lift); cv.addEventListener('pointercancel', lift);
    cv.addEventListener('pointerdown', (e) => { try { cv.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético */ } start = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, yaw: this.cam.yaw, pitch: this.cam.pitch }; moved = false; this.lastInteract = performance.now(); });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (touches.size > 1) return;
      if (start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (this.mode === '3d') { this.cam.yaw = start.yaw + dx * 0.008; this.cam.pitch = Math.max(-1.2, Math.min(1.2, start.pitch + dy * 0.006)); }
        else { this.view.x = start.vx + dx; this.view.y = start.vy + dy; }
        this.lastInteract = performance.now(); this.kick(); return;
      }
      const n = this.pick(px, py);
      if (n !== this.hover) { this.hover = n; cv.style.cursor = n ? 'pointer' : 'grab'; this.kick(); }
    });
    cv.addEventListener('pointerup', (e) => {
      if (start && !moved) { const r = cv.getBoundingClientRect(), n = this.pick(e.clientX - r.left, e.clientY - r.top); if (n) this.onOpen?.(n, e); }
      start = null;
    });
    cv.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.kick(); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  center() { this.view = { x: 0, y: 0, k: 1 }; this.cam = { yaw: -0.55, pitch: 0.18, zoom: 1 }; this.lastInteract = 0; this.kick(); }
  destroy() { this.stop(); this.ro.disconnect(); this.canvas.remove(); }
}
