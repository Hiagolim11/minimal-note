// ---------- Sugestões de links ----------
// - menções sem link: o nome de outra nota aparece no texto mas sem [[ ]];
// - notas que citam esta sem link;
// - notas parecidas (mesmas palavras e tags) que ainda não estão ligadas.
const LinkSuggest = (() => {
  // mesmo fold da busca (rápido) e o mesmo cache do conteúdo dobrado de cada nota
  const fold = SmartSearch.fold, foldedOf = SmartSearch.foldedOf;
  // palavras comuns que não viram sugestão nem contam como "parecidas"
  const STOP = new Set(('a o e é de da do das dos em no na nos nas um uma uns umas para por com sem que se como mais mas ou ao aos à às' +
    ' isso isto esse essa este esta ele ela eles elas eu tu nós vós você vocês meu minha seu sua nosso nossa foi ser ter tem está estão era' +
    ' também já não sim muito pouco quando onde porque pois então sobre entre até depois antes hoje ontem amanhã aqui ali lá cada todo toda' +
    ' todos todas outro outra outros outras mesmo mesma coisa coisas fazer feito vai vou pode podem deve devem nota notas ideia ideias' +
    ' tarefa tarefas sem título').split(/\s+/));
  const LETTER = /[\p{L}\p{N}]/u;

  // trechos que não são texto corrido (código, links, tags…): usa as regras do corretor
  const skipOf = (text) => (typeof SpellText !== 'undefined' ? SpellText.skipRanges(text) : []);
  const inRanges = (r, p) => (typeof SpellText !== 'undefined' ? SpellText.inRanges(r, p) : false);

  // primeira menção (fora de links e código) de cada nome: [{ path, name, index, length, text }]
  function mentions(text, targets, f = fold(text)) {
    const skip = skipOf(text), out = [];
    for (const t of targets) {
      const k = fold(t.name);
      if (k.length < 3 || STOP.has(k) || /^\d+$/.test(k)) continue;
      let i = f.indexOf(k);
      while (i >= 0) {
        const before = f[i - 1] || ' ', after = f[i + k.length] || ' ';
        if (!LETTER.test(before) && !LETTER.test(after) && !inRanges(skip, i)) {
          out.push({ path: t.path, name: t.name, index: i, length: k.length, text: text.slice(i, i + k.length) });
          break;
        }
        i = f.indexOf(k, i + 1);
      }
    }
    return out.sort((a, b) => a.index - b.index);
  }

  // texto com a menção virando link ([[Nome]] ou [[Nome|texto]] se a grafia for diferente)
  function linkAt(text, m) {
    const label = text.slice(m.index, m.index + m.length);
    const link = label === m.name ? `[[${m.name}]]` : `[[${m.name}|${label}]]`;
    return text.slice(0, m.index) + link + text.slice(m.index + m.length);
  }

  // vetores de palavras (TF-IDF) para "parecidas"
  function terms(text, f = fold(text)) {
    const m = new Map();
    for (const w of f.match(/[\p{L}]{4,}/gu) || []) if (!STOP.has(w)) m.set(w, (m.get(w) || 0) + 1);
    return m;
  }
  // palavras de cada nota em cache até o conteúdo mudar (refazer todas a cada tecla custava >1 s)
  const termCache = new WeakMap();
  function termsOf(n) {
    const c = termCache.get(n);
    if (c && c.content === n.content) return c.t;
    const t = terms(n.content, foldedOf(n));
    termCache.set(n, { content: n.content, t });
    return t;
  }
  function similar(target, notes, { k = 5, exclude = new Set() } = {}) {
    const vec = new Map(), df = new Map();
    for (const n of notes) { const t = termsOf(n); vec.set(n, t); for (const w of t.keys()) df.set(w, (df.get(w) || 0) + 1); }
    const N = notes.length, idf = (w) => Math.log(1 + N / (df.get(w) || 1));
    const weigh = (t) => { const o = new Map(); let norm = 0; for (const [w, c] of t) { const v = (1 + Math.log(c)) * idf(w); o.set(w, v); norm += v * v; } return { o, norm: Math.sqrt(norm) || 1 }; };
    const A = weigh(vec.get(target) || termsOf(target)), tagsA = new Set(target.tags || []);
    const out = [];
    for (const n of notes) {
      if (n === target || exclude.has(n.path)) continue;
      const B = weigh(vec.get(n)); let dot = 0;
      for (const [w, v] of A.o) { const u = B.o.get(w); if (u) dot += v * u; }
      let score = dot / (A.norm * B.norm);
      const shared = (n.tags || []).filter((t) => tagsA.has(t));
      score += shared.length * 0.08;
      if (score > 0.12) out.push({ note: n, score, shared });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }

  const api = { mentions, linkAt, similar, fold, STOP };
  if (typeof module === 'object' && module.exports) { module.exports = api; return api; }

  // ---------------- interface (painel "Backlinks") ----------------
  const panel = document.querySelector('.rpanel[data-rpanel="backlinks"]');
  const box = document.createElement('div'); box.id = 'link-suggest';
  panel.appendChild(box);

  const others = (note) => [...S.notes.values()].filter((n) => n !== note && !n.path.startsWith((S.settings.templatesFolder || 'Modelos') + '/'));
  const linkedPaths = (note) => {
    const s = new Set(note.links.map((l) => resolveLink(l, note.path)).filter(Boolean));
    for (const b of backlinksOf(note.path)) s.add(b.path);
    return s;
  };

  let simCache = { key: '', list: [] };
  function render(note = activeNote()) {
    if (!note) { box.innerHTML = ''; return; }
    const linked = linkedPaths(note);
    // 1) esta nota cita outras sem link
    const mine = mentions(note.content, others(note).filter((n) => !linked.has(n.path)).map((n) => ({ path: n.path, name: n.name }))).slice(0, 8);
    // 2) outras notas citam esta sem link
    const theirs = [];
    for (const n of others(note)) {
      if (n.links.some((l) => resolveLink(l, n.path) === note.path)) continue;
      const m = mentions(n.content, [{ path: note.path, name: note.name }], foldedOf(n))[0];
      if (m) theirs.push({ n, m });
      if (theirs.length >= 8) break;
    }
    // 3) parecidas (cache por versão do cofre)
    const key = note.path + ':' + note.content.length + ':' + S.notes.size + ':' + [...linked].sort().join('|');
    if (simCache.key !== key) simCache = { key, list: similar(note, [...others(note), note], { exclude: linked }) };
    const ctx = (text, i, len) => { const a = Math.max(0, i - 30), b = Math.min(text.length, i + len + 40); return (a ? '…' : '') + esc(text.slice(a, i)) + '<mark>' + esc(text.slice(i, i + len)) + '</mark>' + esc(text.slice(i + len, b)).replace(/\n/g, ' ') + (b < text.length ? '…' : ''); };
    box.innerHTML = `
      <div class="rp-title">Menções sem link nesta nota</div>
      ${mine.length ? mine.map((m) => `<div class="ls-item"><div class="ls-snip">${ctx(note.content, m.index, m.length)}</div><button class="ls-btn" data-act="mine" data-path="${esc(m.path)}" data-i="${m.index}" data-len="${m.length}">Ligar a [[${esc(m.name)}]]</button></div>`).join('') : '<div class="rp-empty">Nenhuma.</div>'}
      <div class="rp-title">Notas que citam esta sem link</div>
      ${theirs.length ? theirs.map(({ n, m }) => `<div class="ls-item"><div class="bl-name" data-open="${esc(n.path)}">${icon('note', 14)}${esc(n.name)}</div><div class="ls-snip">${ctx(n.content, m.index, m.length)}</div><button class="ls-btn" data-act="theirs" data-path="${esc(n.path)}" data-i="${m.index}" data-len="${m.length}">Ligar</button></div>`).join('') : '<div class="rp-empty">Nenhuma.</div>'}
      <div class="rp-title">Notas parecidas</div>
      ${simCache.list.length ? simCache.list.map(({ note: n, shared }) => `<div class="ls-item ls-sim"><div class="bl-name" data-open="${esc(n.path)}">${icon('note', 14)}${esc(n.name)}${shared.length ? `<span class="ls-tags">${shared.map((t) => '#' + esc(t)).join(' ')}</span>` : ''}</div><button class="ls-btn" data-act="add" data-path="${esc(n.path)}">+ link</button></div>`).join('') : '<div class="rp-empty">Nada parecido ainda.</div>'}`;
  }

  box.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]'); if (open) { openNote(open.dataset.open); return; }
    const b = e.target.closest('.ls-btn'); if (!b) return;
    const note = activeNote(); if (!note) return;
    const target = S.notes.get(b.dataset.path); if (!target) return;
    if (b.dataset.act === 'mine') {
      const i = Number(b.dataset.i), len = Number(b.dataset.len);
      const label = note.content.slice(i, i + len);
      const ins = label === target.name ? `[[${target.name}]]` : `[[${target.name}|${label}]]`;
      if (editor.ta.value === note.content) editor.replace(i, i + len, ins);
      toast(`Ligado a [[${target.name}]]`, 'success', 1400);
    } else if (b.dataset.act === 'theirs') {
      const neu = linkAt(target.content, { index: Number(b.dataset.i), length: Number(b.dataset.len), name: note.name });
      indexNote(target.path, neu); target.version = (target.version || 0) + 1; S.pending.add(target.path); await saveNote(target.path);
      toast(`“${target.name}” agora tem link para esta nota`, 'success', 1800);
    } else if (b.dataset.act === 'add') {
      // acrescenta no fim da nota atual, numa seção "Ver também"
      const v = editor.ta.value, link = `[[${target.name}]]`;
      const has = /\n## Ver também\n/.test(v);
      const add = has ? `\n- ${link}` : `${v.endsWith('\n') ? '' : '\n'}\n## Ver também\n- ${link}`;
      const at = has ? v.length : v.length;
      editor.replace(at, at, add);
      toast(`Link para [[${target.name}]] adicionado`, 'success', 1400);
    }
    setTimeout(() => { renderRight(); }, 60);
  });

  return { ...api, render };
})();
