// Minimal Note — abas e visão da nota (editor/preview).
// Scripts comuns (sem módulos): compartilham o escopo global e são carregados em ordem pelo index.html.

// ---------- abas ----------
const activeTab = () => S.tabs.find((t) => t.id === S.active);
const activeNote = () => { const t = activeTab(); return t?.kind === 'note' ? S.notes.get(t.path) : null; };

function addTab(spec, activate = true) {
  if (spec.kind === 'graph') {
    const g = S.tabs.find((t) => t.kind === 'graph');
    if (g) { if (activate) activateTab(g.id); return g; }
  }
  const tab = { id: S.tabSeq++, mode: S.settings.defaultMode, scroll: 0, sel: 0, ...spec };
  if (!tab.mode) tab.mode = S.settings.defaultMode;
  const i = S.tabs.findIndex((t) => t.id === S.active);
  S.tabs.splice(i < 0 ? S.tabs.length : i + 1, 0, tab);
  if (activate) activateTab(tab.id); else renderTabs();
  return tab;
}

function persistTabs() {
  S.settings.openTabs = S.tabs.map((t) => ({ kind: t.kind, path: t.path, mode: t.mode }));
  S.settings.activeTab = S.tabs.findIndex((t) => t.id === S.active);
  saveSettings();
}

function stashTab() {
  const t = activeTab();
  if (t?.kind === 'note') {
    t.scroll = (t.mode === 'preview' ? $('#preview-pane') : $('#editor-pane')).scrollTop;
    t.sel = editor.ta.selectionStart;
  }
}

function activateTab(id) {
  if (id !== S.active) stashTab();
  S.active = id;
  const t = activeTab();
  showView();
  if (t?.kind === 'note') loadNoteIntoView(t);
  if (t?.kind === 'graph') { document.title = 'Grafo — Minimal Note'; updateGraph(); }
  renderTabs(); renderRight(); markTreeActive(); updateStatus(); persistTabs();
}

function closeTab(id, silent) {
  const i = S.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = S.tabs[i];
  if (t.kind === 'note') flushSave(t.path);
  S.tabs.splice(i, 1);
  if (S.active === id) {
    const next = S.tabs[i] || S.tabs[i - 1];
    S.active = null;
    if (next) activateTab(next.id);
    else { showView(); renderRight(); updateStatus(); document.title = 'Minimal Note'; }
  }
  renderTabs(); markTreeActive(); persistTabs();
  if (!silent) renderEmpty();
}

function renderTabs() {
  const el = $('#tabs');
  el.innerHTML = S.tabs.map((t) => {
    const title = t.kind === 'graph' ? 'Grafo' : baseName(t.path);
    const ic = t.kind === 'graph' ? 'graph' : 'note';
    const dirty = t.kind === 'note' && S.pending.has(t.path);
    return `<div class="tab${t.id === S.active ? ' active' : ''}${dirty ? ' dirty' : ''}" data-id="${t.id}" draggable="true" title="${esc(t.path || 'Grafo')}">
      ${icon(ic, 15)}<span class="tab-title">${esc(title)}</span>
      <button class="tab-close" title="Fechar (Ctrl+W)">${icon('x', 13)}</button></div>`;
  }).join('');
  el.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function bindTabs() {
  const el = $('#tabs');
  el.addEventListener('mousedown', (e) => {
    const tab = e.target.closest('.tab'); if (!tab) return;
    const id = Number(tab.dataset.id);
    if (e.button === 1) { e.preventDefault(); closeTab(id); return; }
    if (e.target.closest('.tab-close')) return;
    if (e.button === 0) activateTab(id);
  });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('.tab-close');
    if (c) closeTab(Number(c.closest('.tab').dataset.id));
  });
  el.addEventListener('contextmenu', (e) => {
    const tab = e.target.closest('.tab'); if (!tab) return;
    const id = Number(tab.dataset.id); const t = S.tabs.find((x) => x.id === id);
    showMenu(e.clientX, e.clientY, [
      { label: 'Fechar', icon: 'x', kbd: 'Ctrl W', run: () => closeTab(id) },
      { label: 'Fechar outras', icon: 'squares', run: () => S.tabs.filter((x) => x.id !== id).forEach((x) => closeTab(x.id)) },
      { label: 'Fechar todas', icon: 'trash', run: () => [...S.tabs].forEach((x) => closeTab(x.id)) },
      ...(t.kind === 'note' && CAN_REVEAL ? ['sep', { label: 'Mostrar no Explorer', icon: 'external', run: () => lumen.shell.reveal(t.path) }] : []),
    ]);
  });
  // reordenar arrastando
  let dragId = null;
  el.addEventListener('dragstart', (e) => { dragId = Number(e.target.closest('.tab')?.dataset.id); e.dataTransfer.effectAllowed = 'move'; });
  el.addEventListener('dragover', (e) => {
    if (dragId == null) return; e.preventDefault();
    $$('.tab', el).forEach((t) => t.classList.remove('drag-over'));
    e.target.closest('.tab')?.classList.add('drag-over');
  });
  el.addEventListener('drop', (e) => {
    const over = e.target.closest('.tab'); if (dragId == null || !over) return;
    e.preventDefault();
    const from = S.tabs.findIndex((t) => t.id === dragId);
    const [moved] = S.tabs.splice(from, 1);
    const to = S.tabs.findIndex((t) => t.id === Number(over.dataset.id));
    S.tabs.splice(to, 0, moved);
    dragId = null; renderTabs(); persistTabs();
  });
  el.addEventListener('dragend', () => { dragId = null; $$('.tab', el).forEach((t) => t.classList.remove('drag-over')); });
  el.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY; }, { passive: true });
}

// ---------- visão da nota ----------
function showView() {
  const t = activeTab();
  $('#empty-state').hidden = !!t;
  $('#note-view').hidden = t?.kind !== 'note';
  $('#graph-view').hidden = t?.kind !== 'graph';
  if (t?.kind !== 'graph') S.graph?.stop();
  if (!t) renderEmpty();
}

function openNote(path, { newTab = false, mode, heading, focusTitle = false } = {}) {
  if (!S.notes.has(path)) { toast('Nota não encontrada', 'error'); return; }
  const existing = S.tabs.find((t) => t.kind === 'note' && t.path === path);
  if (existing) { if (mode) existing.mode = mode; activateTab(existing.id); }
  else {
    const cur = activeTab();
    if (!newTab && cur?.kind === 'note') {
      stashTab();
      flushSave(cur.path);
      cur.path = path; cur.scroll = 0; cur.sel = 0; cur.focusTitle = focusTitle;
      if (mode) cur.mode = mode;
      activateTab(cur.id);
    } else addTab({ kind: 'note', path, mode: mode || S.settings.defaultMode, focusTitle });
  }
  if (heading) setTimeout(() => scrollToHeading(heading), 60);
  closeDrawersIfOverlay();
}

// título, caminho e janela da nota (sem mexer no texto do editor)
function updateNoteChrome(note) {
  if (document.activeElement !== $('#note-title')) $('#note-title').value = note.name;
  $('#preview-title').textContent = note.name;
  document.title = `${note.name} — Minimal Note`;
  const parts = note.folder ? note.folder.split('/') : [];
  $('#breadcrumbs').innerHTML = [S.vault.name, ...parts].map((p) => `<span>${esc(p)}</span>${icon('chevron', 12)}`).join('') + `<span class="cur">${esc(note.name)}</span>`;
}

function loadNoteIntoView(tab) {
  const note = S.notes.get(tab.path);
  if (!note) return;
  editor.hideSuggest();
  editor.value = note.content;
  $('#note-title').value = note.name;
  updateNoteChrome(note);
  setMode(tab.mode, true);
  requestAnimationFrame(() => {
    editor.autosize();
    const pane = tab.mode === 'preview' ? $('#preview-pane') : $('#editor-pane');
    pane.scrollTop = tab.scroll || 0;
    if (tab.mode !== 'preview') {
      const p = Math.min(tab.sel || 0, note.content.length);
      editor.ta.setSelectionRange(p, p);
      if (!note.content && tab.focusTitle) { $('#note-title').focus(); $('#note-title').select(); } else editor.ta.focus({ preventScroll: true });
      tab.focusTitle = false;
    }
  });
}

function setMode(mode, silent) {
  const t = activeTab();
  if (!t || t.kind !== 'note') return;
  t.mode = mode;
  $('#panes').dataset.mode = mode;
  $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode !== 'edit') renderPreview();
  if (mode !== 'preview') requestAnimationFrame(() => editor.autosize());
  if (!silent) { persistTabs(); if (mode !== 'preview') editor.ta.focus(); }
}

// a nota já começa com "# <nome da nota>"? (evita título duplicado na leitura e nas exportações)
function startsWithOwnTitle(note) {
  const firstLine = note.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').split('\n').find((l) => l.trim()) || '';
  const h1 = /^\s*#\s+(.+?)\s*#*\s*$/.exec(firstLine);
  return !!h1 && h1[1].trim().toLowerCase() === note.name.toLowerCase();
}

function renderPreview() {
  const note = activeNote();
  const t = activeTab();
  if (!note || t.mode === 'edit') return;
  const frag = MD.render(note.content);
  const pv = $('#preview');
  pv.replaceChildren(...frag.childNodes);
  // evita título duplicado quando a nota já começa com "# Título"
  $('#preview-title').hidden = startsWithOwnTitle(note);
  if (!note.content.trim()) pv.innerHTML = '<p style="color:var(--text-faint)">Nota vazia — pressione Ctrl+E para editar.</p>';
  MD.renderDiagrams(pv);
}
const renderPreviewSoon = debounce(renderPreview, 120);

function fileUrl(rel) {
  if (lumen.fileUrl) return lumen.fileUrl(rel); // Android: URL própria da WebView
  const full = (S.vault.root.replace(/\\/g, '/') + '/' + rel).split('/');
  return 'file:///' + full.map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).filter(Boolean).join('/');
}
MD.hooks.resolve = (t) => resolveLink(t, activeTab()?.path);
MD.hooks.remoteImages = () => S.settings?.remoteImages === true;
MD.hooks.imageSrc = (p) => {
  const key = p.toLowerCase();
  const found = S.images.get(key) || S.images.get(key.split('/').pop());
  if (found) return fileUrl(found);
  const from = dirName(activeTab()?.path || '');
  return fileUrl(joinPath(from, p));
};

function scrollToHeading(id) {
  const t = activeTab(); const note = activeNote(); if (!note) return;
  if (t.mode === 'edit') {
    const h = note.headings.find((x) => x.id === id || x.id === 'h-' + id);
    if (h) editor.scrollToLine(h.line);
  } else {
    const el = document.getElementById(id.startsWith('h-') ? id : 'h-' + id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setContent(text) {
  const note = activeNote(); if (!note) return;
  const s = editor.ta.selectionStart;
  editor.value = text;
  editor.ta.setSelectionRange(s, s);
  onEdit(text);
}

function onEdit(text) {
  const note = activeNote(); if (!note) return;
  note.content = text;
  note.version++;
  scheduleSave(note.path);
  renderPreviewSoon();
  analyzeSoon();
  updateStatus();
}
const analyzeSoon = debounce(() => {
  const note = activeNote(); if (!note) return;
  Object.assign(note, MD.analyze(note.content));
  renderRight(); renderTags();
}, 350);

function toggleTask(n) {
  const note = activeNote(); if (!note) return;
  const src = note.content;
  const fences = [];
  for (const m of src.matchAll(/^(```|~~~)[\s\S]*?^\1/gm)) fences.push([m.index, m.index + m[0].length]);
  let i = 0, out = src;
  for (const m of src.matchAll(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/gm)) {
    if (fences.some(([a, b]) => m.index >= a && m.index < b)) continue;
    if (i++ === n) {
      const pos = m.index + m[1].length + 1;
      out = src.slice(0, pos) + (m[2] === ' ' ? 'x' : ' ') + src.slice(pos + 1);
      break;
    }
  }
  if (out !== src) { const sc = $('#preview-pane').scrollTop; setContent(out); renderPreview(); $('#preview-pane').scrollTop = sc; }
}

async function renameActiveTitle() {
  const note = activeNote(); if (!note) return;
  const val = cleanName($('#note-title').value);
  if (!val) { $('#note-title').value = note.name; return; }
  if (val === note.name) return;
  const ext = note.path.match(/\.(md|markdown|txt)$/i)?.[0] || '.md';
  await renamePath(note.path, joinPath(note.folder, val + ext));
}
