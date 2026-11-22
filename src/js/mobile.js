// ---------- Recursos de toque (celular/tablet) ----------
// Barra de formatação acima do teclado, gesto de abrir a lista de arquivos pela
// borda e ajustes de teclado. Só entra em ação em telas de toque (ou no Android).
(function () {
  const touch = window.lumen?.platform === 'android' || matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (!touch) return;
  const root = document.documentElement;
  root.classList.add('touch');

  // ---------- barra de formatação ----------
  // os mais usados primeiro (a barra rola para o lado)
  const TOOLS = [
    ['heading', 'H', 'Título (1 → 2 → 3 → texto)'], ['bold', 'B', 'Negrito'], ['italic', 'I', 'Itálico'],
    ['list', '•', 'Lista'], ['task', '☑', 'Tarefa'], ['wikilink', '[[ ]]', 'Link para nota'], ['sep'],
    ['undo', '↶', 'Desfazer'], ['redo', '↷', 'Refazer'], ['sep'],
    ['ordered', '1.', 'Lista numerada'], ['quote', '❝', 'Citação'], ['link', '🔗', 'Link'], ['code', '</>', 'Código'],
    ['tag', '#', 'Tag'], ['strike', 'S', 'Riscado'], ['mark', '◐', 'Destaque'], ['sep'],
    ['outdent', '⇤', 'Diminuir recuo'], ['indent', '⇥', 'Aumentar recuo'],
  ];
  const bar = document.createElement('div');
  bar.id = 'mtoolbar';
  bar.className = 'mtoolbar';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Formatação');
  bar.innerHTML = `<div class="mt-scroll">${TOOLS.map(([a, label, title]) => a === 'sep' ? '<span class="mt-sep"></span>'
    : `<button type="button" class="mt-btn mt-${a}" data-a="${a}" title="${title}" aria-label="${title}">${label}</button>`).join('')}</div>
    <button type="button" class="mt-btn mt-done" data-a="done" title="Fechar teclado" aria-label="Fechar teclado">${typeof icon === 'function' ? icon('chevron', 20) : '⌄'}</button>`;
  document.body.appendChild(bar);

  // `editor` e `S` são declarados com let/const no app.js (não ficam em window)
  const ed = () => (typeof editor !== 'undefined' ? editor : null);
  const ta = () => ed()?.ta || document.getElementById('editor');

  // alterna um prefixo de linha (lista, citação…) em todas as linhas selecionadas
  function togglePrefix(test, add, strip) {
    const t = ta(), { selectionStart: s, selectionEnd: e, value: v } = t;
    const first = v.lastIndexOf('\n', s - 1) + 1;
    let last = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); if (last < 0) last = v.length;
    const block = v.slice(first, last), lines = block.split('\n');
    const all = lines.every((l) => test.test(l));
    const out = lines.map((l, i) => all ? l.replace(strip, '$1') : test.test(l) ? l : l.replace(/^(\s*)/, '$1' + add(i))).join('\n');
    if (lines.length === 1) {
      const caret = Math.max(first, s + (out.length - block.length));
      editor.replace(first, last, out, caret);
    } else editor.replace(first, last, out, first, first + out.length);
  }

  function cycleHeading() {
    const t = ta(), line = editor.lineRange(t.selectionStart);
    const m = /^(#{1,6})\s+/.exec(line.text), level = m ? m[1].length : 0;
    const next = level >= 3 ? 0 : level + 1;
    let body = line.text.replace(/^#{1,6}\s+/, '');
    // item de lista vazio (o Enter continuou a lista): vira só o título
    if (/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s*)?$/.test(body)) body = '';
    const out = (next ? '#'.repeat(next) + ' ' : '') + body;
    editor.replace(line.start, line.end, out, Math.max(line.start, t.selectionStart + (out.length - line.text.length)));
  }

  const ACTIONS = {
    undo: () => document.execCommand('undo'),
    redo: () => document.execCommand('redo'),
    heading: cycleHeading,
    bold: () => editor.wrap('**', '**', 'negrito'),
    italic: () => editor.wrap('*', '*', 'itálico'),
    strike: () => editor.wrap('~~', '~~', 'riscado'),
    mark: () => editor.wrap('==', '==', 'destaque'),
    code: () => {
      const t = ta(), sel = t.value.slice(t.selectionStart, t.selectionEnd);
      if (sel.includes('\n')) editor.wrap('```\n', '\n```');
      else editor.wrap('`', '`', 'código');
    },
    list: () => togglePrefix(/^\s*[-*+]\s+(?!\[[ xX]\])/, () => '- ', /^(\s*)[-*+]\s+/),
    ordered: () => togglePrefix(/^\s*\d+[.)]\s+/, (i) => (i + 1) + '. ', /^(\s*)\d+[.)]\s+/),
    quote: () => togglePrefix(/^\s*>\s?/, () => '> ', /^(\s*)>\s?/),
    task: () => editor.toggleTask(),
    wikilink: () => editor.wrap('[[', ']]'),
    link: () => {
      const t = ta(), sel = t.value.slice(t.selectionStart, t.selectionEnd);
      if (/^https?:\/\/\S+$/.test(sel)) editor.wrap('[](', ')');
      else editor.wrap('[', '](https://)', 'texto');
    },
    tag: () => {
      const t = ta(), s = t.selectionStart, before = t.value[s - 1];
      editor.replace(s, t.selectionEnd, (before && !/\s/.test(before) ? ' #' : '#'));
    },
    indent: () => editor.indent(false),
    outdent: () => editor.indent(true),
    done: () => ta().blur(),
  };

  // não deixa os botões tirarem o foco do editor (o teclado continua aberto)
  bar.addEventListener('pointerdown', (e) => { if (e.target.closest('.mt-btn')) e.preventDefault(); });
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('.mt-btn')) e.preventDefault(); });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('.mt-btn'); if (!b || !ed()) return;
    if (b.dataset.a !== 'done') ta().focus();
    try { ACTIONS[b.dataset.a]?.(); } catch (err) { console.error(err); }
    ensureCaretVisible();
  });

  // ---------- teclado ----------
  const isText = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|)$/i.test(el.type || '')) || el.isContentEditable);
  function placeBar() {
    const vv = window.visualViewport;
    // se a WebView não encolhe com o teclado, usa a viewport visual
    const gap = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.bottom = gap + 'px';
  }
  function update() {
    const el = document.activeElement;
    const typing = isText(el);
    root.classList.toggle('typing', typing);
    const show = el === ta() && document.querySelector('.panes')?.dataset.mode !== 'preview';
    bar.hidden = !show;
    root.classList.toggle('mt-open', show);
    if (show) placeBar();
  }
  function ensureCaretVisible() {
    const t = ta(); if (document.activeElement !== t || !ed()) return;
    const pane = t.closest('.pane'); if (!pane) return;
    const c = editor.caretCoords(t.selectionEnd);
    const pr = pane.getBoundingClientRect();
    const barH = bar.hidden ? 0 : bar.getBoundingClientRect().height;
    const vv = window.visualViewport;
    const visibleBottom = Math.min(pr.bottom, (vv ? vv.height + vv.offsetTop : window.innerHeight) - barH) - 12;
    if (c.top + c.height > visibleBottom) pane.scrollTop += c.top + c.height - visibleBottom;
    else if (c.top < pr.top + 8) pane.scrollTop -= pr.top + 8 - c.top;
  }
  document.addEventListener('focusin', () => setTimeout(update, 0));
  document.addEventListener('focusout', () => setTimeout(update, 60));
  const onResize = () => { update(); setTimeout(ensureCaretVisible, 80); };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('scroll', placeBar);
  document.addEventListener('selectionchange', () => { if (document.activeElement === ta()) requestAnimationFrame(ensureCaretVisible); });
  // trocar para "leitura" esconde a barra
  new MutationObserver(update).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-mode'] });

  // ---------- gesto: deslizar da borda esquerda abre os arquivos ----------
  let sw = null;
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || window.innerWidth > 760) { sw = null; return; }
    const t = e.touches[0];
    const left = document.querySelector('.sidebar.left');
    const leftOpen = typeof S !== 'undefined' && !!S.settings?.leftOpen;
    const overlay = [...document.querySelectorAll('.overlay')].some((o) => !o.hidden);
    if (overlay) { sw = null; return; }
    if (!leftOpen && t.clientX < 36) sw = { x: t.clientX, y: t.clientY, open: true };
    else if (leftOpen && left?.contains(e.target)) sw = { x: t.clientX, y: t.clientY, open: false };
    else sw = null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const t = e.touches[0], dx = t.clientX - sw.x, dy = Math.abs(t.clientY - sw.y);
    if (dy > 50) { sw = null; return; }
    if (sw.open && dx > 56) { sw = null; window.toggleSide?.('left'); }
    else if (!sw.open && dx < -70) { sw = null; window.toggleSide?.('left'); }
  }, { passive: true });
  document.addEventListener('touchend', () => { sw = null; }, { passive: true });

  // ---------- economia de bateria ----------
  window.__lumenPower = () => window.applyEffects?.();
})();
