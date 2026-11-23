// ---------- Localizar e substituir dentro da nota (Ctrl+F / Ctrl+H) ----------
// As ocorrências são marcadas numa camada própria, entre o realce e o textarea, com o mesmo
// texto em transparente: assim cada <mark> cai exatamente sobre a palavra do editor.
(function () {
  const ta = document.getElementById('editor');
  const pane = document.getElementById('editor-pane');
  if (!ta || !pane) return;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
  const MAX = 5000;

  const layer = document.createElement('div');
  layer.className = 'editor-find';
  layer.setAttribute('aria-hidden', 'true');
  const hl = document.getElementById('editor-hl');
  hl.after(layer);

  const bar = document.createElement('div');
  bar.id = 'findbar';
  bar.className = 'findbar';
  bar.hidden = true;
  bar.setAttribute('role', 'search');
  bar.innerHTML = `
    <div class="fb-row">
      <button type="button" class="fb-btn fb-more" data-a="more" title="Substituir (Ctrl+H)" aria-label="Mostrar substituir" aria-expanded="false">${ic('chevron', 15)}</button>
      <input class="fb-input" id="fb-find" type="text" placeholder="Localizar na nota" spellcheck="false" autocomplete="off" enterkeyhint="search" aria-label="Localizar na nota">
      <span class="fb-count" id="fb-count" aria-live="polite"></span>
      <button type="button" class="fb-btn fb-case" data-a="case" title="Diferenciar maiúsculas e minúsculas" aria-label="Diferenciar maiúsculas e minúsculas" aria-pressed="false">Aa</button>
      <button type="button" class="fb-btn fb-prev" data-a="prev" title="Anterior (Shift+Enter)" aria-label="Ocorrência anterior">${ic('chevron', 15)}</button>
      <button type="button" class="fb-btn fb-next" data-a="next" title="Próxima (Enter)" aria-label="Próxima ocorrência">${ic('chevron', 15)}</button>
      <button type="button" class="fb-btn" data-a="close" title="Fechar (Esc)" aria-label="Fechar">${ic('x', 15)}</button>
    </div>
    <div class="fb-row fb-rep" hidden>
      <span class="fb-gap"></span>
      <input class="fb-input" id="fb-rep" type="text" placeholder="Substituir por" spellcheck="false" autocomplete="off" aria-label="Substituir por">
      <button type="button" class="fb-btn fb-txt" data-a="one" title="Substituir esta (Enter)">Substituir</button>
      <button type="button" class="fb-btn fb-txt" data-a="all" title="Substituir todas (Ctrl+Alt+Enter)">Todas</button>
    </div>`;
  pane.prepend(bar);
  const $f = bar.querySelector('#fb-find'), $r = bar.querySelector('#fb-rep');
  const $count = bar.querySelector('#fb-count'), $repRow = bar.querySelector('.fb-rep');
  const $case = bar.querySelector('.fb-case'), $more = bar.querySelector('.fb-more');

  let matches = [], cur = -1, caseSens = false, timer = 0;
  const isOpen = () => !bar.hidden;

  function compute(anchor) {
    const q = $f.value, v = ta.value;
    matches = [];
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSens ? 'gu' : 'giu');
      let m;
      while ((m = re.exec(v)) && matches.length < MAX) {
        matches.push([m.index, m.index + m[0].length]);
        if (!m[0].length) re.lastIndex++;
      }
    }
    if (!matches.length) cur = -1;
    else if (anchor != null) { cur = matches.findIndex(([s]) => s >= anchor); if (cur < 0) cur = 0; }
    else cur = Math.min(Math.max(cur, 0), matches.length - 1);
    paint();
  }

  function paint() {
    const v = ta.value;
    $count.textContent = !$f.value ? '' : matches.length ? `${cur + 1}/${matches.length}${matches.length >= MAX ? '+' : ''}` : 'Nenhuma';
    bar.classList.toggle('fb-none', !!$f.value && !matches.length);
    if (!isOpen() || !matches.length || v.length > 300000) { layer.textContent = ''; return; }
    let out = '', last = 0;
    matches.forEach(([s, e], i) => {
      out += esc(v.slice(last, s)) + `<mark${i === cur ? ' class="cur"' : ''}>${esc(v.slice(s, e))}</mark>`;
      last = e;
    });
    layer.innerHTML = out + esc(v.slice(last)) + '\n';
  }

  function reveal() {
    const m = matches[cur]; if (!m) return;
    ta.setSelectionRange(m[0], m[1]);
    const el = layer.querySelector('mark.cur');
    if (el) {
      const pr = pane.getBoundingClientRect(), er = el.getBoundingClientRect();
      const top = pr.top + bar.offsetHeight + 12, bottom = pr.bottom - 24;
      if (er.top < top || er.bottom > bottom) pane.scrollTop += er.top - (pr.top + pr.height / 3);
    }
  }

  function go(d) {
    if (!matches.length) return;
    cur = (cur + d + matches.length) % matches.length;
    paint(); reveal();
  }

  function showReplace(on) {
    $repRow.hidden = !on;
    bar.classList.toggle('fb-replacing', on);
    $more.setAttribute('aria-expanded', String(on));
  }

  function open(replace = false) {
    const t = typeof activeTab === 'function' ? activeTab() : null;
    if (!t || t.kind !== 'note') return false;
    if (t.mode === 'preview' && typeof setMode === 'function') setMode('edit', true);
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = ta.value.slice(s, e);
    if (sel && !sel.includes('\n') && sel.length <= 200) $f.value = sel;
    const keepReplace = isOpen() && !$repRow.hidden;
    bar.hidden = false;
    showReplace(replace || keepReplace);
    compute(s);
    paint();
    const target = replace && $f.value ? $r : $f;
    target.focus(); target.select();
    if (matches.length) reveal();
    return true;
  }

  function close() {
    if (!isOpen()) return false;
    bar.hidden = true;
    layer.textContent = '';
    const m = matches[cur];
    ta.focus({ preventScroll: true });
    if (m) ta.setSelectionRange(m[0], m[1]);
    return true;
  }

  // troca o texto sem perder o desfazer e sem pular a rolagem
  function edit(start, end, text, caret) {
    const st = pane.scrollTop;
    editor.replace(start, end, text, caret);
    pane.scrollTop = st;
  }

  function replaceOne() {
    const m = matches[cur]; if (!m) return;
    const rep = $r.value;
    edit(m[0], m[1], rep, m[0] + rep.length);
    compute(m[0] + rep.length);
    if (matches.length) reveal();
    $r.focus();
  }

  function replaceAll() {
    if (!matches.length) return;
    const rep = $r.value, v = ta.value, n = matches.length;
    let out = '', last = 0;
    for (const [s, e] of matches) { out += v.slice(last, s) + rep; last = e; }
    out += v.slice(last);
    edit(0, v.length, out, 0);
    compute(0);
    $r.focus();
    if (typeof toast === 'function') toast(n === 1 ? '1 substituição' : `${n} substituições`, 'success', 1600);
  }

  const ACTIONS = {
    more: () => { showReplace($repRow.hidden); ($repRow.hidden ? $f : $r).focus(); },
    case: () => { caseSens = !caseSens; $case.setAttribute('aria-pressed', String(caseSens)); $case.classList.toggle('on', caseSens); compute(matches[cur]?.[0] ?? ta.selectionStart); reveal(); },
    prev: () => go(-1),
    next: () => go(1),
    close: () => close(),
    one: replaceOne,
    all: replaceAll,
  };
  // o toque nos botões não tira o foco do campo (o teclado do celular não fecha)
  bar.addEventListener('pointerdown', (e) => { if (e.target.closest('.fb-btn')) e.preventDefault(); });
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('.fb-btn')) e.preventDefault(); });
  bar.addEventListener('click', (e) => { const b = e.target.closest('.fb-btn'); if (b) ACTIONS[b.dataset.a]?.(); });

  $f.addEventListener('input', () => { compute(matches[cur]?.[0] ?? ta.selectionStart); reveal(); });
  bar.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.target === $r) { if (mod && e.altKey) replaceAll(); else replaceOne(); } else go(e.shiftKey ? -1 : 1);
      return;
    }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); e.stopPropagation(); showReplace(true); $r.focus(); $r.select(); }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); $f.focus(); $f.select(); }
  });

  // atalhos globais (fase de captura: antes do editor e dos outros atalhos)
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.shiftKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'f' && k !== 'h') return;
    if (!document.getElementById('palette')?.hidden || !document.getElementById('settings')?.hidden) return;
    if (open(k === 'h')) e.preventDefault();
  }, true);

  // o texto mudou (digitação ou outra nota aberta): refaz as marcas
  ta.addEventListener('input', () => {
    if (!isOpen()) return;
    clearTimeout(timer);
    timer = setTimeout(() => compute(matches[cur]?.[0] ?? ta.selectionStart), 120);
  });
  ta.addEventListener('lumen-load', () => { if (isOpen()) { compute(0); pane.scrollTop = 0; } });
  // a largura do texto mudou (janela, fonte): o navegador refaz o layout das marcas sozinho

  window.__lumenFind = { open, close, isOpen };
  // botão voltar do Android fecha a barra antes de tudo
  const prevBack = window.__lumenBack;
  window.__lumenBack = () => close() || !!prevBack?.();
})();
