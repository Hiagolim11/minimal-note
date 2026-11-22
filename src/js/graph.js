// Visualização de grafo com simulação de forças em canvas
class GraphView {
  constructor(container, { onOpen, getActive }) {
    this.el = container;
    this.onOpen = onOpen;
    this.getActive = getActive;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.el.appendChild(this.canvas);
    this.nodes = []; this.edges = []; this.byId = new Map();
    this.view = { x: 0, y: 0, k: 1 };
    this.alpha = 1; this.hover = null; this.drag = null; this.filter = '';
    this.running = false;
    this.readColors();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.bind();
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    this.colors = { accent: v('--accent'), text: v('--text'), muted: v('--text-muted'), faint: v('--text-faint'), border: v('--border'), bg: v('--bg') };
  }

  setData({ nodes, edges }) {
    const old = this.byId;
    this.byId = new Map();
    // área inicial cresce com √N (o layout final ocupa ~45px·√N): com milhares de nós todos
    // começando no tamanho da tela, a simulação passava os primeiros segundos só separando-os
    const spread = 45 * Math.sqrt(nodes.length);
    const w = Math.max((this.width || 800) * 0.6, spread), h = Math.max((this.height || 600) * 0.6, spread);
    this.nodes = nodes.map((n) => {
      const prev = old.get(n.id);
      const node = { ...n, x: prev?.x ?? (Math.random() - 0.5) * w, y: prev?.y ?? (Math.random() - 0.5) * h, vx: 0, vy: 0, deg: 0 };
      this.byId.set(n.id, node);
      return node;
    });
    this.edges = edges.map(([a, b]) => ({ s: this.byId.get(a), t: this.byId.get(b) })).filter((e) => e.s && e.t && e.s !== e.t);
    this.edges.forEach((e) => { e.s.deg++; e.t.deg++; });
    this.neighbors = new Map(this.nodes.map((n) => [n, new Set()]));
    this.edges.forEach((e) => { this.neighbors.get(e.s).add(e.t); this.neighbors.get(e.t).add(e.s); });
    this.alpha = Math.max(this.alpha, old.size ? 0.4 : 1);
    this.start();
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = r.width; this.height = r.height;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      if (this.alpha > 0.005 || this.drag) this.tick();
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  tick() {
    const N = this.nodes, a = this.alpha;
    // repulsão só entre nós a até 500px (d² ≤ 250000). Uma grade de células de 500px compara cada
    // nó só com as 9 células em volta — mesmo resultado do laço n², mas viável com milhares de nós
    const repel = (p, q) => {
      let dx = q.x - p.x, dy = q.y - p.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
      if (d2 > 250000) return;
      const f = (900 / d2) * a;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * f * 10, fy = (dy / d) * f * 10;
      p.vx -= fx; p.vy -= fy; q.vx += fx; q.vy += fy;
    };
    const C = 500, key = (cx, cy) => cx * 1e6 + cy, grid = new Map();
    for (const n of N) {
      const k = key(Math.floor(n.x / C), Math.floor(n.y / C));
      const cell = grid.get(k);
      if (cell) cell.push(n); else grid.set(k, [n]);
    }
    for (const [k, cell] of grid) {
      for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) repel(cell[i], cell[j]);
      const cx = Math.round(k / 1e6), cy = k - cx * 1e6;
      // metade das vizinhas, para cada par de células ser visitado uma vez só
      for (const [ox, oy] of [[1, -1], [1, 0], [1, 1], [0, 1]]) {
        const other = grid.get(key(cx + ox, cy + oy));
        if (other) for (const p of cell) for (const q of other) repel(p, q);
      }
    }
    // molas
    for (const e of this.edges) {
      const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 90) * 0.04 * a;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      e.s.vx += fx; e.s.vy += fy; e.t.vx -= fx; e.t.vy -= fy;
    }
    // gravidade ao centro
    for (const n of N) {
      n.vx -= n.x * 0.012 * a; n.vy -= n.y * 0.012 * a;
      if (n === this.drag?.node) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-40, Math.min(40, n.vx));
      n.y += Math.max(-40, Math.min(40, n.vy));
    }
    this.alpha *= 0.985;
  }

  radius(n) { return (n.kind === 'tag' ? 3.5 : 4) + Math.sqrt(n.deg) * 1.8; }

  toWorld(px, py) { return { x: (px - this.width / 2 - this.view.x) / this.view.k, y: (py - this.height / 2 - this.view.y) / this.view.k }; }

  pick(px, py) {
    const p = this.toWorld(px, py);
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      const r = this.radius(n) + 4 / this.view.k;
      const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
      if (d < r * r && d < bd) { best = n; bd = d; }
    }
    return best;
  }

  draw() {
    const { ctx, width: w, height: h, view, colors: c } = this;
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + view.x, h / 2 + view.y);
    ctx.scale(view.k, view.k);
    const active = this.getActive?.();
    const focus = this.hover || null;
    const nb = focus ? this.neighbors.get(focus) : null;
    const q = this.filter.toLowerCase();

    ctx.lineWidth = 1 / view.k;
    for (const e of this.edges) {
      const lit = focus && (e.s === focus || e.t === focus);
      ctx.strokeStyle = lit ? c.accent : c.border;
      ctx.globalAlpha = focus && !lit ? 0.25 : lit ? 0.9 : 0.8;
      ctx.lineWidth = (lit ? 1.6 : 1) / view.k;
      ctx.beginPath(); ctx.moveTo(e.s.x, e.s.y); ctx.lineTo(e.t.x, e.t.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const n of this.nodes) {
      const r = this.radius(n);
      const dim = (focus && n !== focus && !nb.has(n)) || (q && !n.label.toLowerCase().includes(q));
      ctx.globalAlpha = dim ? 0.2 : 1;
      let fill = n.kind === 'tag' ? c.muted : n.kind === 'ghost' ? c.faint : c.text;
      if (n.id === active || n === focus) fill = c.accent;
      if (n.kind === 'ghost') {
        ctx.strokeStyle = fill; ctx.lineWidth = 1.2 / view.k;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.stroke();
      } else {
        if (n.id === active) {
          ctx.fillStyle = c.accent; ctx.globalAlpha = 0.18;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = dim ? 0.2 : 1;
        }
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (this.showLabels !== false) {
      const fs = 12 / Math.max(view.k, 0.6);
      ctx.font = `500 ${fs}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-ui')}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const n of this.nodes) {
        const show = view.k > 0.85 || n === focus || nb?.has(n) || n.id === active || n.deg > 4;
        if (!show) continue;
        const dim = (focus && n !== focus && !nb.has(n)) || (q && !n.label.toLowerCase().includes(q));
        ctx.globalAlpha = dim ? 0.15 : n === focus ? 1 : 0.85;
        ctx.fillStyle = n === focus ? c.text : c.muted;
        ctx.fillText(n.label, n.x, n.y + this.radius(n) + 4 / view.k);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  bind() {
    const cv = this.canvas;
    let panStart = null, moved = false;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const r = cv.getBoundingClientRect();
      const n = this.pick(e.clientX - r.left, e.clientY - r.top);
      moved = false;
      if (n) { this.drag = { node: n }; this.alpha = Math.max(this.alpha, 0.3); }
      else panStart = { x: e.clientX - this.view.x, y: e.clientY - this.view.y };
    });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (this.drag) {
        const p = this.toWorld(px, py);
        this.drag.node.x = p.x; this.drag.node.y = p.y; moved = true;
        this.alpha = Math.max(this.alpha, 0.2);
      } else if (panStart) {
        this.view.x = e.clientX - panStart.x; this.view.y = e.clientY - panStart.y; moved = true;
      } else {
        const n = this.pick(px, py);
        if (n !== this.hover) { this.hover = n; cv.style.cursor = n ? 'pointer' : 'grab'; }
      }
    });
    const end = (e) => {
      if (this.drag && !moved) this.onOpen?.(this.drag.node, e);
      this.drag = null; panStart = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointerleave', () => { this.hover = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left - this.width / 2, py = e.clientY - r.top - this.height / 2;
      const k = Math.min(4, Math.max(0.15, this.view.k * Math.exp(-e.deltaY * 0.0015)));
      this.view.x = px - ((px - this.view.x) * k) / this.view.k;
      this.view.y = py - ((py - this.view.y) * k) / this.view.k;
      this.view.k = k;
    }, { passive: false });
  }

  center() { this.view = { x: 0, y: 0, k: 1 }; this.alpha = 0.6; }
  destroy() { this.stop(); this.ro.disconnect(); this.canvas.remove(); }
}
