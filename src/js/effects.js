// ---------- Efeitos visuais: partículas de fundo + brilhos do cursor ----------
// Um único loop requestAnimationFrame desenha duas camadas:
//   #fx-bg     → partículas ambientes (atrás ou na frente da interface)
//   #fx-cursor → brilhos/rastro do cursor (sempre por cima, sem bloquear cliques)
// O loop para sozinho quando não há nada para desenhar, quando a janela é minimizada
// ou quando o usuário desliga as animações.

const FX_STYLES = {
  dust: 'Poeira de luz',
  fireflies: 'Vaga-lumes',
  stars: 'Estrelas',
  snow: 'Neve',
  bokeh: 'Bokeh',
  bubbles: 'Bolhas',
};
const FX_CURSORS = { off: 'Desligado', sparkle: 'Brilhos em estrela', trail: 'Rastro de luz', glow: 'Aura suave', confetti: 'Confete' };
const FX_COLORS = { accent: 'Cor de destaque', theme: 'Paleta do tema', rainbow: 'Arco-íris', custom: 'Cor personalizada' };

const FX_PRESETS = {
  none: { name: 'Nenhum', fx: { fxParticles: false, fxCursor: 'off', fxClickBurst: false } },
  calm: { name: 'Calmo', fx: { fxParticles: true, fxStyle: 'dust', fxDensity: 45, fxOpacity: 55, fxSpeed: 35, fxSize: 50, fxColor: 'accent', fxCursor: 'glow', fxClickBurst: false, fxMouse: 'none', fxLayer: 'front' } },
  magic: { name: 'Mágico', fx: { fxParticles: true, fxStyle: 'stars', fxDensity: 70, fxOpacity: 60, fxSpeed: 45, fxSize: 60, fxColor: 'theme', fxCursor: 'sparkle', fxClickBurst: true, fxMouse: 'attract', fxLayer: 'front' } },
  night: { name: 'Vaga-lumes', fx: { fxParticles: true, fxStyle: 'fireflies', fxDensity: 40, fxOpacity: 75, fxSpeed: 40, fxSize: 55, fxColor: 'custom', fxCustomColor: '#facc15', fxCursor: 'trail', fxClickBurst: true, fxMouse: 'repel', fxLayer: 'front' } },
  winter: { name: 'Inverno', fx: { fxParticles: true, fxStyle: 'snow', fxDensity: 80, fxOpacity: 65, fxSpeed: 45, fxSize: 50, fxColor: 'custom', fxCustomColor: '#e0f2fe', fxCursor: 'sparkle', fxClickBurst: true, fxMouse: 'repel', fxLayer: 'front' } },
  party: { name: 'Festa', fx: { fxParticles: true, fxStyle: 'bokeh', fxDensity: 35, fxOpacity: 50, fxSpeed: 50, fxSize: 70, fxColor: 'rainbow', fxCursor: 'confetti', fxClickBurst: true, fxMouse: 'none', fxLayer: 'front' } },
};

class Effects {
  constructor(bg, top) {
    this.bg = bg; this.top = top;
    this.bctx = bg.getContext('2d'); this.tctx = top.getContext('2d');
    this.parts = []; this.sparks = []; this.trail = [];
    this.mouse = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, inside: false, moved: 0 };
    this.cfg = null; this.colors = ['#8b7bff'];
    this.raf = 0; this.last = 0; this.hidden = document.hidden; this.focused = document.hasFocus();
    this.hue = 0; this.stats = { frames: 0 };
    this.resize = this.resize.bind(this); this.frame = this.frame.bind(this);
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: true });
    window.addEventListener('pointerdown', (e) => this.onDown(e), { passive: true });
    window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { this.mouse.inside = false; this.mouse.t = performance.now(); this.kick(); } });
    document.addEventListener('visibilitychange', () => { this.hidden = document.hidden; this.kick(); });
    window.addEventListener('blur', () => { this.focused = false; });
    window.addEventListener('focus', () => { this.focused = true; this.kick(); });
    this.resize();
  }

  // s: configurações do app; colors: { accent, theme: [...], dark }
  configure(s, colors) {
    const prev = this.cfg;
    const reduce = !s.animations || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.cfg = {
      on: !!s.fxParticles && !reduce, style: FX_STYLES[s.fxStyle] ? s.fxStyle : 'dust',
      density: s.fxDensity, speed: s.fxSpeed / 50, size: s.fxSize / 50, opacity: s.fxOpacity / 100,
      color: s.fxColor, custom: s.fxCustomColor, mouse: s.fxMouse, front: s.fxLayer === 'front',
      cursor: reduce ? 'off' : s.fxCursor, burst: !!s.fxClickBurst && !reduce, dark: colors.dark,
    };
    this.colors = this.cfg.color === 'custom' ? [s.fxCustomColor || colors.accent]
      : this.cfg.color === 'theme' ? colors.theme : [colors.accent];
    this.bg.classList.toggle('front', this.cfg.front);
    // composição: em fundos escuros somamos luz ('lighter'); em fundos claros isso apagaria tudo
    this.blend = colors.dark ? 'lighter' : 'source-over';
    const rebuild = !prev || prev.style !== this.cfg.style || prev.density !== this.cfg.density || prev.on !== this.cfg.on;
    if (rebuild) this.spawnAll(); else this.parts.forEach((p) => { p.c = this.pick(); });
    if (!this.cfg.on) this.bctx.clearRect(0, 0, this.w, this.h);
    if (this.cfg.cursor === 'off' && !this.cfg.burst) { this.sparks = []; this.trail = []; this.tctx.clearRect(0, 0, this.w, this.h); }
    this.kick();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.w = window.innerWidth; this.h = window.innerHeight;
    for (const [cv, ctx] of [[this.bg, this.bctx], [this.top, this.tctx]]) {
      cv.width = Math.round(this.w * dpr); cv.height = Math.round(this.h * dpr);
      cv.style.width = this.w + 'px'; cv.style.height = this.h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (this.cfg?.on) this.spawnAll(true);
    this.kick();
  }

  pick() {
    if (this.cfg?.color === 'rainbow') return null; // cor calculada por frame
    return this.colors[Math.floor(Math.random() * this.colors.length)] || '#ffffff';
  }

  count() {
    // densidade relativa à área da janela (referência: 1440×900)
    const area = (this.w * this.h) / (1440 * 900);
    const k = { dust: 1.6, fireflies: 0.7, stars: 1.4, snow: 2, bokeh: 0.35, bubbles: 0.6 }[this.cfg.style];
    return Math.max(4, Math.min(500, Math.round(this.cfg.density * k * Math.max(0.35, area))));
  }

  spawn(p = {}, anywhere = true) {
    const st = this.cfg.style, r = Math.random, S = this.cfg.size;
    p.x = r() * this.w; p.y = anywhere ? r() * this.h : (st === 'snow' ? -10 : st === 'bubbles' || st === 'dust' ? this.h + 10 : r() * this.h);
    p.vx = 0; p.vy = 0; p.c = this.pick(); p.h = r() * 360; p.ph = r() * Math.PI * 2; p.life = 1;
    if (st === 'dust') { p.r = (0.6 + r() * 1.6) * S; p.vx = (r() - 0.5) * 0.15; p.vy = -(0.1 + r() * 0.35); p.a = 0.25 + r() * 0.5; }
    if (st === 'fireflies') { p.r = (1.4 + r() * 1.8) * S; p.a = 0.6 + r() * 0.4; p.dir = r() * Math.PI * 2; }
    if (st === 'stars') { p.r = (1.5 + r() * 3.5) * S; p.vx = (r() - 0.5) * 0.06; p.vy = (r() - 0.5) * 0.06; p.a = 0.3 + r() * 0.7; p.rot = r() * Math.PI; }
    if (st === 'snow') { p.r = (1 + r() * 2.6) * S; p.vy = 0.35 + r() * 0.8 * (p.r / 3); p.a = 0.45 + r() * 0.5; }
    if (st === 'bokeh') { p.r = (18 + r() * 46) * S; p.vx = (r() - 0.5) * 0.25; p.vy = (r() - 0.5) * 0.25; p.a = 0.05 + r() * 0.1; }
    if (st === 'bubbles') { p.r = (4 + r() * 12) * S; p.vy = -(0.25 + r() * 0.6); p.a = 0.25 + r() * 0.35; }
    return p;
  }

  spawnAll(keep) {
    if (!this.cfg?.on) { this.parts = []; return; }
    const n = this.count();
    if (keep && this.parts.length) {
      while (this.parts.length > n) this.parts.pop();
      while (this.parts.length < n) this.parts.push(this.spawn());
      this.parts.forEach((p) => { if (p.x > this.w || p.y > this.h) this.spawn(p); });
    } else this.parts = Array.from({ length: n }, () => this.spawn());
  }

  onMove(e) {
    const m = this.mouse;
    m.px = m.inside ? m.x : e.clientX; m.py = m.inside ? m.y : e.clientY;
    m.x = e.clientX; m.y = e.clientY; m.inside = true; m.t = performance.now();
    const c = this.cfg; if (!c || c.cursor === 'off') return;
    const dx = m.x - m.px, dy = m.y - m.py, sp = Math.hypot(dx, dy);
    if (c.cursor === 'sparkle') {
      const n = Math.min(3, Math.floor(sp / 9) + (Math.random() < 0.35 ? 1 : 0));
      for (let i = 0; i < n; i++) this.addSpark(m.x, m.y, dx * 0.04, dy * 0.04, 'star');
    } else if (c.cursor === 'confetti') {
      if (Math.random() < Math.min(1, sp / 14)) this.addSpark(m.x, m.y, dx * 0.05, dy * 0.05, 'confetti');
    } else if (c.cursor === 'trail') {
      this.trail.push({ x: m.x, y: m.y, life: 1, c: this.sparkColor() });
      if (this.trail.length > 40) this.trail.shift();
    }
    this.kick();
  }

  onDown(e) {
    if (!this.cfg?.burst || e.button !== 0) return;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, v = 1.6 + Math.random() * 2.2;
      this.addSpark(e.clientX, e.clientY, Math.cos(a) * v, Math.sin(a) * v, this.cfg.cursor === 'confetti' ? 'confetti' : 'star', 1.15);
    }
    this.kick();
  }

  sparkColor() {
    if (this.cfg.color === 'rainbow') return `hsl(${(this.hue + Math.random() * 60) % 360} 90% 65%)`;
    return this.colors[Math.floor(Math.random() * this.colors.length)];
  }

  addSpark(x, y, vx, vy, kind, scale = 1) {
    if (this.sparks.length > 260) this.sparks.splice(0, 40);
    const r = Math.random;
    this.sparks.push({
      x: x + (r() - 0.5) * 6, y: y + (r() - 0.5) * 6, vx: vx + (r() - 0.5) * 0.9, vy: vy + (r() - 0.5) * 0.9 - (kind === 'star' ? 0.25 : 0),
      size: (kind === 'star' ? 3 + r() * 6 : 3 + r() * 4) * scale, rot: r() * Math.PI, vr: (r() - 0.5) * 0.2,
      life: 1, decay: 0.012 + r() * 0.02, c: this.sparkColor(), kind, w: r() < 0.5 ? 1 : 0.5,
    });
  }

  kick() {
    if (this.raf || this.hidden || !this.cfg) return;
    if (!this.cfg.on && !this.sparks.length && !this.trail.length && !this.glowActive()) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  frame(now) {
    this.raf = 0;
    if (this.hidden) return;
    // fora de foco: ~24 fps para economizar energia
    if (!this.focused && now - this.last < 40) { this.raf = requestAnimationFrame(this.frame); return; }
    const dt = Math.min(3, (now - this.last) / 16.67); this.last = now;
    this.hue = (this.hue + 0.4 * dt) % 360;
    this.stats.frames++;
    if (this.cfg.on) this.drawParticles(dt, now);
    const busy = this.drawCursor(dt);
    if (this.cfg.on || busy || this.glowActive()) this.raf = requestAnimationFrame(this.frame);
  }

  // a aura só precisa ser redesenhada logo depois de o mouse se mexer
  glowActive() { return this.cfg?.cursor === 'glow' && performance.now() - (this.mouse.t || 0) < 700; }

  color(p, alpha) {
    const a = Math.max(0, Math.min(1, alpha));
    if (!p.c) return `hsla(${(p.h + this.hue) % 360} 90% 65% / ${a})`;
    return rgba(p.c, a);
  }

  drawParticles(dt, now) {
    const ctx = this.bctx, c = this.cfg, W = this.w, H = this.h, m = this.mouse, t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = this.blend;
    // atrás da interface só ~12–30% aparece (área de escrita e vidro) → compensa o brilho
    const O = c.opacity * (c.front ? 0.8 : 1.9), sp = c.speed;
    for (const p of this.parts) {
      // movimento por estilo
      if (c.style === 'fireflies') {
        p.dir += (Math.random() - 0.5) * 0.25 * dt;
        p.vx += Math.cos(p.dir) * 0.02 * dt; p.vy += Math.sin(p.dir) * 0.02 * dt;
        p.vx *= 0.97; p.vy *= 0.97;
      } else if (c.style === 'snow') p.vx = Math.sin(t * 0.8 + p.ph) * 0.35;
      else if (c.style === 'bubbles') p.vx = Math.sin(t * 1.2 + p.ph) * 0.25;
      // interação com o mouse
      if (c.mouse !== 'none' && m.inside) {
        const dx = p.x - m.x, dy = p.y - m.y, d2 = dx * dx + dy * dy, R = 140;
        if (d2 < R * R && d2 > 1) {
          const d = Math.sqrt(d2), f = (1 - d / R) * (c.mouse === 'repel' ? 1.4 : -0.6) * dt;
          p.x += (dx / d) * f; p.y += (dy / d) * f;
        }
      }
      p.x += p.vx * sp * dt; p.y += p.vy * sp * dt;
      // reciclagem nas bordas
      const pad = p.r + 20;
      if (p.y < -pad) { if (c.style === 'dust' || c.style === 'bubbles') this.spawn(p, false); else p.y = H + pad; }
      else if (p.y > H + pad) { if (c.style === 'snow') this.spawn(p, false); else p.y = -pad; }
      if (p.x < -pad) p.x = W + pad; else if (p.x > W + pad) p.x = -pad;
      // desenho
      const tw = 0.55 + 0.45 * Math.sin(t * (c.style === 'stars' ? 1.6 : 2.4) + p.ph);
      if (c.style === 'dust') dot(ctx, p.x, p.y, p.r, this.color(p, p.a * tw * O), 2.2);
      else if (c.style === 'fireflies') dot(ctx, p.x, p.y, p.r, this.color(p, p.a * (0.35 + 0.65 * tw) * O), 4.5);
      else if (c.style === 'stars') { star(ctx, p.x, p.y, p.r * (0.7 + 0.5 * tw), p.rot, this.color(p, p.a * tw * O)); }
      else if (c.style === 'snow') dot(ctx, p.x, p.y, p.r, this.color(p, p.a * O), 1.6);
      else if (c.style === 'bokeh') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, this.color(p, p.a * 1.6 * O)); g.addColorStop(0.7, this.color(p, p.a * O)); g.addColorStop(1, this.color(p, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (c.style === 'bubbles') {
        ctx.strokeStyle = this.color(p, p.a * O); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
        dot(ctx, p.x - p.r * 0.35, p.y - p.r * 0.35, Math.max(0.8, p.r * 0.14), this.color(p, p.a * 1.4 * O), 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawCursor(dt) {
    const ctx = this.tctx, c = this.cfg, m = this.mouse;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = this.blend;
    // aura
    if (c.cursor === 'glow' && m.inside) {
      const R = 90, g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, R);
      const col = this.cfg.color === 'rainbow' ? `hsl(${this.hue} 90% 65%)` : this.colors[0];
      g.addColorStop(0, rgba(col, c.dark ? 0.16 : 0.12)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, R, 0, Math.PI * 2); ctx.fill();
    }
    // rastro
    if (this.trail.length) {
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i]; p.life -= 0.035 * dt;
        const k = i / this.trail.length;
        if (p.life > 0) dot(ctx, p.x, p.y, 1 + 4.5 * k * p.life, rgbaAny(p.c, 0.55 * p.life * k), 2.5);
      }
      this.trail = this.trail.filter((p) => p.life > 0);
    }
    // brilhos e confete
    for (const s of this.sparks) {
      s.life -= s.decay * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.96; s.vy = s.vy * 0.96 + (s.kind === 'confetti' ? 0.06 : 0.015) * dt;
      s.rot += s.vr * dt;
      if (s.life <= 0) continue;
      const a = Math.min(1, s.life * 1.4);
      if (s.kind === 'star') star(ctx, s.x, s.y, s.size * (0.4 + 0.6 * s.life), s.rot, rgbaAny(s.c, a), true);
      else {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.scale(1, Math.cos(s.rot * 3));
        ctx.fillStyle = rgbaAny(s.c, a); ctx.fillRect(-s.size / 2, -s.size * s.w / 2, s.size, s.size * s.w);
        ctx.restore();
      }
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    ctx.globalCompositeOperation = 'source-over';
    return this.sparks.length > 0 || this.trail.length > 0;
  }
}

// ---------- utilidades de desenho ----------
function rgba(hex, a) {
  if (!hex || hex[0] !== '#') return rgbaAny(hex || '#fff', a);
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
function rgbaAny(c, a) {
  if (c && c[0] === '#') return rgba(c, a);
  if (c && c.startsWith('hsl(')) return c.replace(')', ` / ${a.toFixed(3)})`);
  return c;
}
function dot(ctx, x, y, r, col, glow) {
  if (glow > 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * glow);
    g.addColorStop(0, col); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * glow, 0, Math.PI * 2); ctx.fill();
  } else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
}
// estrela de 4 pontas com núcleo brilhante
function star(ctx, x, y, r, rot, col, halo) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  if (halo) { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = col; ctx.beginPath();
  const t = r * 0.22;
  ctx.moveTo(0, -r); ctx.quadraticCurveTo(t, -t, r, 0); ctx.quadraticCurveTo(t, t, 0, r);
  ctx.quadraticCurveTo(-t, t, -r, 0); ctx.quadraticCurveTo(-t, -t, 0, -r);
  ctx.fill(); ctx.restore();
}
