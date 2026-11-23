// Busca inteligente (sem DOM): filtros, termos com erro de digitação, frases exatas e trechos.
//   tag:viagem  #viagem  pasta:Projetos  -excluir  "frase exata"
//   tarefa:pendente | tarefa:feita    editada:hoje | ontem | semana | mês | 7d | 2026-11-01
//   criada:...  nome:texto
const SmartSearch = (() => {
  // minúsculas sem acento, mantendo o mesmo comprimento (as posições valem no texto original)
  const fold = (s) => { let o = ''; for (const ch of String(s)) { const b = ch.normalize('NFD')[0]; o += b.length === ch.length ? b.toLowerCase() : ch.toLowerCase(); } return o.length === s.length ? o : String(s).toLowerCase(); };
  const DAY = 86400000;
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  function parse(raw) {
    const q = { terms: [], phrases: [], not: [], tags: [], folders: [], names: [], task: null, edited: null, created: null };
    const re = /(-?)(?:(\w+):)?("([^"]*)"|(\S+))/gu;
    let m;
    while ((m = re.exec(raw))) {
      const neg = m[1] === '-', key = (m[2] || '').toLowerCase(), val = m[4] ?? m[5] ?? '';
      if (!val) continue;
      if (!key && val.startsWith('#') && val.length > 1) { q.tags.push(fold(val.slice(1))); continue; }
      if (key === 'tag') q.tags.push(fold(val.replace(/^#/, '')));
      else if (key === 'pasta' || key === 'path' || key === 'folder') q.folders.push(fold(val.replace(/^\/|\/$/g, '')));
      else if (key === 'nome' || key === 'titulo' || key === 'título') q.names.push(fold(val));
      else if (key === 'tarefa' || key === 'tarefas' || key === 'task') q.task = /feit|done|conclu/i.test(val) ? 'done' : /tod|all/i.test(val) ? 'any' : 'open';
      else if (key === 'editada' || key === 'modificada' || key === 'edited') q.edited = val;
      else if (key === 'criada' || key === 'created') q.created = val;
      else if (neg) q.not.push(fold(m[4] ?? val));
      else if (m[4] != null) q.phrases.push(fold(m[4]));
      else q.terms.push(fold(key ? key + ':' + val : val));
    }
    return q;
  }

  // período: devolve [início, fim) em ms
  function range(val, now = Date.now()) {
    const v = fold(val), today = startOfDay(now);
    if (v === 'hoje' || v === 'today') return [today, today + DAY];
    if (v === 'ontem' || v === 'yesterday') return [today - DAY, today];
    if (v === 'semana' || v === 'week') return [today - 6 * DAY, today + DAY];
    if (v === 'mes' || v === 'month') return [today - 29 * DAY, today + DAY];
    if (v === 'ano' || v === 'year') return [today - 364 * DAY, today + DAY];
    let m = /^(\d+)d$/.exec(v); if (m) return [today - (Number(m[1]) - 1) * DAY, today + DAY];
    m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
    if (m) { const s = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1)).getTime(); const e = m[3] ? s + DAY : new Date(Number(m[1]), Number(m[2]), 1).getTime(); return [s, e]; }
    return null;
  }

  // distância de edição limitada (com transposição) — "exenplo" ~ "exemplo"
  function close(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    const n = a.length, m = b.length; let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j);
    for (let i = 1; i <= n; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= m; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v); if (v < best) best = v;
      }
      if (best > max) return false;
      prev2 = prev; prev = cur;
    }
    return prev[m] <= max;
  }
  const tolerance = (t) => (t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0);

  // palavras (dobradas) de cada nota, em cache pela versão do conteúdo
  const wordCache = new WeakMap();
  function wordsOf(note) {
    const c = wordCache.get(note);
    if (c && c.content === note.content) return c.words;
    const words = new Map(), f = fold(note.content);
    for (const m of f.matchAll(/[\p{L}\p{N}]{2,}/gu)) if (!words.has(m[0])) words.set(m[0], m.index);
    wordCache.set(note, { content: note.content, words });
    return words;
  }

  const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/;

  // notes: [{path, name, content, tags, mtime, ctime}]
  function run(notes, raw, { now = Date.now(), limit = 200 } = {}) {
    const q = parse(raw);
    const edited = q.edited ? range(q.edited, now) : null, created = q.created ? range(q.created, now) : null;
    const results = [];
    for (const n of notes) {
      const fname = fold(n.name), fpath = fold(n.path), fc = fold(n.content);
      if (q.tags.length && !q.tags.every((t) => (n.tags || []).some((x) => { const fx = fold(x); return fx === t || fx.startsWith(t + '/'); }))) continue;
      if (q.folders.length && !q.folders.some((f) => fpath.startsWith(f + '/') || fpath.split('/').slice(0, -1).some((part) => part === f))) continue;
      if (q.names.length && !q.names.every((t) => fname.includes(t))) continue;
      if (edited && !(n.mtime >= edited[0] && n.mtime < edited[1])) continue;
      if (created && !(n.ctime >= created[0] && n.ctime < created[1])) continue;
      if (q.not.some((t) => fc.includes(t) || fname.includes(t))) continue;
      if (q.phrases.some((p) => !fc.includes(p) && !fname.includes(p))) continue;
      // tarefas
      let taskHits = null;
      if (q.task) {
        taskHits = [];
        n.content.split('\n').forEach((line, i) => { const m = TASK.exec(line); if (m && (q.task === 'any' || (q.task === 'done') === (m[1] !== ' '))) taskHits.push({ line: i, text: line.trim() }); });
        if (!taskHits.length) continue;
      }
      // termos: exatos (substring) ou aproximados (palavra com até 1–2 letras diferentes)
      let score = 0, ok = true;
      const marks = []; // [início, fim) no conteúdo
      for (const t of q.terms) {
        let hit = false;
        if (fname.includes(t)) { score += 40; hit = true; }
        let i = fc.indexOf(t), count = 0;
        while (i >= 0 && count < 50) { if (count < 6) marks.push([i, i + t.length]); count++; i = fc.indexOf(t, i + t.length); }
        if (count) { score += 10 + Math.min(count, 20); hit = true; }
        if (!hit) {
          const tol = tolerance(t);
          if (tol) {
            if (fname.split(/[^\p{L}\p{N}]+/u).some((w) => w && close(t, w, tol))) { score += 25; hit = true; }
            for (const [w, pos] of wordsOf(n)) if (close(t, w, tol)) { score += 6; hit = true; if (marks.length < 12) marks.push([pos, pos + w.length]); }
          }
        }
        if (!hit) { ok = false; break; }
      }
      if (!ok) continue;
      for (const p of q.phrases) { const i = fc.indexOf(p); if (i >= 0) { marks.push([i, i + p.length]); score += 15; } }
      score += Math.max(0, 5 - (now - (n.mtime || 0)) / (7 * DAY)); // recentes primeiro no empate
      results.push({ note: n, score, marks: marks.sort((a, b) => a[0] - b[0]), tasks: taskHits });
    }
    results.sort((a, b) => b.score - a.score || (b.note.mtime || 0) - (a.note.mtime || 0));
    return { query: q, results: results.slice(0, limit), total: results.length };
  }

  // trechos com as marcas: [{text, marks: [[s,e]] relativos, pos}]
  function snippets(content, marks, { max = 3, before = 40, after = 80 } = {}) {
    const out = [];
    for (const [s, e] of marks) {
      if (out.length >= max) break;
      if (out.some((o) => s >= o.from && s < o.to)) continue;
      const from = Math.max(0, s - before), to = Math.min(content.length, e + after);
      out.push({ from, to, pos: s });
    }
    return out.map((o) => ({
      pos: o.pos,
      text: (o.from > 0 ? '…' : '') + content.slice(o.from, o.to).replace(/\n/g, ' ') + (o.to < content.length ? '…' : ''),
      marks: marks.filter(([s, e]) => s >= o.from && e <= o.to).map(([s, e]) => [s - o.from + (o.from > 0 ? 1 : 0), e - o.from + (o.from > 0 ? 1 : 0)]),
    }));
  }

  const api = { parse, range, run, snippets, fold, close };
  if (typeof module === 'object' && module.exports) module.exports = api;
  return api;
})();
