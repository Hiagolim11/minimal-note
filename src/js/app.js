// ===== Minimal Note — lógica principal do app =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = MD.esc;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const baseName = (p) => p.split('/').pop().replace(/\.(md|markdown|txt)$/i, '');
const dirName = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
const joinPath = (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');
const cleanName = (n) => n.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();

const S = {
  settings: null,
  vault: null,
  tree: [],
  notes: new Map(),      // caminho -> nota
  names: new Map(),      // nome em minúsculas -> [caminhos]
  pathsLower: new Map(), // caminho minúsculo -> caminho
  images: new Map(),     // nome/caminho minúsculo -> caminho
  tabs: [],
  active: null,
  pending: new Set(),
  timers: new Map(),
  graph: null,
  tabSeq: 1,
};

// ---------- utilidades de interface ----------
function toast(msg, type = 'info', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-dot"></span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, ms);
}

function dialog({ title, msg = '', input = null, ok = 'OK', cancel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const ov = $('#dialog'), inp = $('#dialog-input'), okBtn = $('#dialog-ok');
    $('#dialog-title').textContent = title;
    $('#dialog-msg').textContent = msg;
    inp.hidden = input === null;
    inp.value = input ?? '';
    okBtn.textContent = ok;
    $('#dialog-cancel').textContent = cancel;
    okBtn.classList.toggle('danger', danger);
    ov.hidden = false;
    setTimeout(() => { if (input !== null) { inp.focus(); inp.select(); } else okBtn.focus(); }, 30);
    const done = (val) => { ov.hidden = true; cleanup(); resolve(val); };
    const onOk = () => done(input === null ? true : inp.value);
    const onCancel = () => done(input === null ? false : null);
    const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); onOk(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); } };
    const onBg = (e) => { if (e.target === ov) onCancel(); };
    okBtn.addEventListener('click', onOk);
    $('#dialog-cancel').addEventListener('click', onCancel);
    ov.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', onBg);
    function cleanup() {
      okBtn.removeEventListener('click', onOk);
      $('#dialog-cancel').removeEventListener('click', onCancel);
      ov.removeEventListener('keydown', onKey, true);
      ov.removeEventListener('mousedown', onBg);
    }
  });
}
const promptName = (title, value, msg) => dialog({ title, input: value, msg, ok: 'Salvar' });
const confirmBox = (title, msg, ok = 'Excluir') => dialog({ title, msg, ok, danger: true });

function showMenu(x, y, items) {
  const m = $('#ctx-menu');
  m.innerHTML = items.map((it, i) => it === 'sep' ? '<div class="ctx-sep"></div>'
    : `<button class="ctx-item${it.danger ? ' danger' : ''}" data-i="${i}">${icon(it.icon || 'dot', 16)}<span>${esc(it.label)}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}</button>`).join('');
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  m.querySelectorAll('.ctx-item').forEach((b) => b.addEventListener('click', () => { m.hidden = true; items[b.dataset.i].run(); }));
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctx-menu')) $('#ctx-menu').hidden = true; });
window.addEventListener('blur', () => { $('#ctx-menu').hidden = true; });

function relTime(ms) {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return 'agora';
  if (d < 3600) return `${Math.floor(d / 60)} min`;
  if (d < 86400) return `${Math.floor(d / 3600)} h`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} d`;
  return new Date(ms).toLocaleDateString('pt-BR');
}

function fuzzy(q, text) {
  if (!q) return { score: 0, idx: [] };
  const t = text.toLowerCase(); q = q.toLowerCase();
  let ti = 0, score = 0, last = -2; const idx = [];
  for (const ch of q) {
    if (ch === ' ') continue;
    const f = t.indexOf(ch, ti);
    if (f < 0) return null;
    idx.push(f);
    score += (f === last + 1 ? 8 : 1) + (f === 0 || /[\s/\-_]/.test(t[f - 1]) ? 6 : 0);
    last = f; ti = f + 1;
  }
  if (t.includes(q)) score += 20 + (t.startsWith(q) ? 15 : 0);
  return { score: score - t.length * 0.03, idx };
}
function hlIdx(text, idx) {
  const set = new Set(idx);
  return [...text].map((c, i) => (set.has(i) ? `<b>${esc(c)}</b>` : esc(c))).join('');
}

// ---------- configurações ----------
function merge(base, extra) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = { ...out[k], ...v };
    else if (v !== undefined) out[k] = v;
  }
  return out;
}
const saveSettings = debounce(() => lumen.settings.set(S.settings).catch((e) => console.error(e)), 400);
function setSetting(key, val) {
  S.settings[key] = val;
  applyAppearance(S.settings);
  applyEffects();
  S.graph?.readColors();
  saveSettings();
  updateStatus();
}

// ---------- partículas e cursor ----------
function applyEffects() {
  if (!S.fx) return;
  const cs = getComputedStyle(document.documentElement);
  const v = (k) => cs.getPropertyValue(k).trim();
  const accent = v('--accent') || '#8b7bff';
  const theme = [...new Set([accent, v('--link'), v('--tag'), v('--heading'), v('--text-muted')].filter((c) => /^#[0-9a-f]{6,8}$/i.test(c)))];
  // no celular: menos partículas; no modo de economia de bateria, efeitos desligados
  let cfg = S.settings;
  if (IS_ANDROID) cfg = lumen.power?.() ? { ...cfg, fxParticles: false, fxCursor: 'off', fxClickBurst: false } : { ...cfg, fxDensity: Math.round(cfg.fxDensity * 0.7) };
  S.fx.configure(cfg, { accent, theme, dark: document.documentElement.dataset.mode !== 'light' });
}
const FX_KEYS = ['fxParticles', 'fxStyle', 'fxDensity', 'fxSpeed', 'fxSize', 'fxOpacity', 'fxColor', 'fxCustomColor', 'fxMouse', 'fxLayer', 'fxCursor', 'fxClickBurst', 'workspaceOpacity'];
function applyFxPreset(id) {
  const pr = FX_PRESETS[id]; if (!pr) return;
  Object.assign(S.settings, pr.fx);
  if (pr.fx.fxParticles) S.settings.animations = true;
  setSetting('fxParticles', S.settings.fxParticles);
}
const presetActive = (id) => Object.entries(FX_PRESETS[id].fx).every(([k, val]) => S.settings[k] === val);

// "Mostrar no Explorer" só existe no computador
const IS_ANDROID = window.lumen?.platform === 'android';
const CAN_REVEAL = !IS_ANDROID;

// ---------- índice do cofre ----------
function indexNote(path, content, mtime, ctime) {
  const prev = S.notes.get(path);
  const note = prev || { path };
  note.name = baseName(path);
  note.folder = dirName(path);
  note.content = content;
  note.mtime = mtime ?? note.mtime ?? Date.now();
  note.ctime = ctime ?? note.ctime ?? note.mtime;
  note.version = note.version || 0;
  Object.assign(note, MD.analyze(content));
  S.notes.set(path, note);
  return note;
}

function rebuildLookups() {
  S.names.clear(); S.pathsLower.clear(); S.images.clear();
  for (const p of S.notes.keys()) {
    const n = baseName(p).toLowerCase();
    if (!S.names.has(n)) S.names.set(n, []);
    S.names.get(n).push(p);
    S.pathsLower.set(p.toLowerCase().replace(/\.(md|markdown|txt)$/i, ''), p);
  }
  const walk = (items) => items.forEach((it) => {
    if (it.type === 'folder') walk(it.children);
    else if (it.type === 'image') { S.images.set(it.path.toLowerCase(), it.path); S.images.set(it.name.toLowerCase(), it.path); }
  });
  walk(S.tree);
}

function resolveLink(target, from) {
  if (!target) return null;
  const t = target.trim().replace(/\.(md|markdown|txt)$/i, '').toLowerCase();
  if (t.includes('/')) return S.pathsLower.get(t) || S.pathsLower.get(t.replace(/^\//, '')) || null;
  const cands = S.names.get(t);
  if (!cands?.length) return null;
  if (cands.length === 1 || !from) return cands[0];
  const dir = dirName(from);
  return cands.find((c) => dirName(c) === dir) || cands[0];
}

function backlinksOf(path) {
  const out = [];
  for (const n of S.notes.values()) {
    if (n.path === path) continue;
    if (n.links.some((l) => resolveLink(l, n.path) === path)) out.push(n);
  }
  return out;
}

async function refreshVault() {
  try {
    const [tree, all] = await Promise.all([lumen.fs.tree(), lumen.fs.readAll()]);
    S.tree = tree;
    const seen = new Set();
    for (const f of all) {
      seen.add(f.path);
      const cur = S.notes.get(f.path);
      if (cur && S.pending.has(f.path)) continue; // edição local mais nova
      if (cur && cur.content === f.content) { cur.mtime = f.mtime; continue; }
      indexNote(f.path, f.content, f.mtime, f.ctime);
      // nota aberta alterada fora do app
      const tab = activeTab();
      if (tab?.kind === 'note' && tab.path === f.path && cur) {
        const s = editor.ta.selectionStart;
        editor.value = f.content;
        editor.ta.setSelectionRange(Math.min(s, f.content.length), Math.min(s, f.content.length));
        renderPreview();
      }
    }
    for (const p of [...S.notes.keys()]) if (!seen.has(p) && !S.pending.has(p)) S.notes.delete(p);
    rebuildLookups();
    // fecha abas de notas apagadas
    for (const t of [...S.tabs]) if (t.kind === 'note' && !S.notes.has(t.path)) closeTab(t.id, true);
    renderTree(); renderTags(); renderRight(); renderEmpty();
    if ($('#search-input').value) runSearch();
    if (activeTab()?.kind === 'graph') updateGraph();
    renderTabs();
  } catch (err) {
    console.error(err);
    toast('Erro ao ler o cofre: ' + err.message, 'error');
  }
}

async function openVault(dir) {
  for (const p of [...S.pending]) await flushSave(p);
  const v = await lumen.vault.open(dir);
  const switched = S.vault && S.vault.root !== v.root;
  S.vault = v;
  S.notes.clear();
  $('#vault-name .txt').textContent = v.name;
  if (switched) { S.tabs = []; S.active = null; S.settings.openTabs = []; }
  const firstRun = !S.settings.vaultPath;
  S.settings.vaultPath = v.root;
  saveSettings();
  await refreshVault();
  // reabrir o mesmo cofre (ex.: escolher a mesma pasta) não duplica as abas
  if (!switched && S.tabs.length) { /* mantém as abas atuais */ }
  else if (!switched && S.settings.openTabs?.length) {
    for (const t of S.settings.openTabs) {
      if (t.kind === 'graph') addTab({ kind: 'graph' }, false);
      else if (S.notes.has(t.path)) addTab({ kind: 'note', path: t.path, mode: t.mode }, false);
    }
    const idx = Math.min(S.settings.activeTab ?? 0, S.tabs.length - 1);
    if (S.tabs[idx]) activateTab(S.tabs[idx].id);
  } else if (firstRun || switched) {
    const welcome = resolveLink('Bem-vindo') || [...S.notes.keys()][0];
    if (welcome) openNote(welcome, { mode: 'preview' });
  }
  renderTabs(); showView();
}

// ---------- salvamento ----------
function scheduleSave(path) {
  S.pending.add(path);
  clearTimeout(S.timers.get(path));
  S.timers.set(path, setTimeout(() => saveNote(path), S.settings.autosaveDelay));
  setSaveStatus('saving');
  renderTabs();
}
async function saveNote(path) {
  clearTimeout(S.timers.get(path));
  const note = S.notes.get(path);
  if (!note) { S.pending.delete(path); return; }
  const v = note.version;
  try {
    await lumen.fs.write(path, note.content);
    note.mtime = Date.now();
    if (note.version === v) S.pending.delete(path);
    if (!S.pending.size) setSaveStatus('saved');
  } catch (err) {
    setSaveStatus('error');
    toast('Falha ao salvar: ' + err.message, 'error', 5000);
  }
  renderTabs();
}
async function flushSave(path) { if (S.pending.has(path)) await saveNote(path); }
async function flushAll() { await Promise.all([...S.pending].map(saveNote)); }

function setSaveStatus(st) {
  const el = $('#st-save');
  el.className = 'st-item ' + st;
  el.textContent = st === 'saving' ? 'Salvando…' : st === 'error' ? 'Erro ao salvar' : 'Salvo';
}

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
}
const renderPreviewSoon = debounce(renderPreview, 120);

function fileUrl(rel) {
  if (lumen.fileUrl) return lumen.fileUrl(rel); // Android: URL própria da WebView
  const full = (S.vault.root.replace(/\\/g, '/') + '/' + rel).split('/');
  return 'file:///' + full.map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).filter(Boolean).join('/');
}
MD.hooks.resolve = (t) => resolveLink(t, activeTab()?.path);
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

// ---------- operações de arquivos ----------
async function createNote({ folder = S.settings.newNoteFolder, name = 'Sem título', content = '', newTab = false, focusTitle = true } = {}) {
  try {
    const rel = await lumen.fs.create(joinPath(folder, cleanName(name) + '.md'), content);
    indexNote(rel, content);
    await refreshVault();
    if (folder && !S.settings.expanded.includes(folder)) { S.settings.expanded.push(folder); renderTree(); }
    openNote(rel, { newTab, mode: 'edit', focusTitle: focusTitle && !content });
    return rel;
  } catch (err) { toast('Não foi possível criar: ' + err.message, 'error'); }
}

async function openOrCreateByName(name, opts = {}) {
  const found = resolveLink(name, activeTab()?.path);
  if (found) return openNote(found, opts);
  const parts = name.split('/');
  const n = parts.pop();
  const folder = parts.length ? parts.join('/') : S.settings.newNoteFolder;
  await createNote({ folder, name: n, content: '', newTab: opts.newTab, focusTitle: false });
}

async function dailyNote() {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const path = joinPath(S.settings.dailyFolder, ymd + '.md');
  if (S.notes.has(path)) return openNote(path);
  const title = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  await createNote({ folder: S.settings.dailyFolder, name: ymd, content: `# ${title.charAt(0).toUpperCase() + title.slice(1)}\n\n## Tarefas\n- [ ] \n\n## Notas\n\n#diário\n` });
}

async function renamePath(from, to, isFolder = false) {
  if (from === to) return;
  try {
    if (isFolder) {
      for (const p of [...S.pending]) if (p.startsWith(from + '/')) await flushSave(p);
    } else {
      await flushSave(from);
    }
    await lumen.fs.rename(from, to);
    // edições feitas enquanto o arquivo era renomeado continuam pendentes, agora no novo caminho
    const moved = (p) => (p === from ? to : isFolder && p.startsWith(from + '/') ? to + p.slice(from.length) : null);
    const carry = [...S.pending].filter((p) => moved(p));
    for (const p of carry) { clearTimeout(S.timers.get(p)); S.timers.delete(p); S.pending.delete(p); }
    // atualiza abas
    for (const t of S.tabs) {
      if (t.kind !== 'note') continue;
      if (t.path === from) t.path = to;
      else if (isFolder && t.path.startsWith(from + '/')) t.path = to + t.path.slice(from.length);
    }
    // move o índice
    for (const [p, n] of [...S.notes]) {
      let np = null;
      if (p === from) np = to; else if (isFolder && p.startsWith(from + '/')) np = to + p.slice(from.length);
      if (np) { S.notes.delete(p); n.path = np; n.name = baseName(np); n.folder = dirName(np); S.notes.set(np, n); }
    }
    for (const p of carry) scheduleSave(moved(p));
    if (isFolder) S.settings.expanded = S.settings.expanded.map((e) => (e === from || e.startsWith(from + '/') ? to + e.slice(from.length) : e));
    // atualiza [[links]] quando o nome muda
    let updated = 0;
    if (!isFolder && baseName(from) !== baseName(to)) {
      const oldN = baseName(from), newN = baseName(to);
      const re = new RegExp(`(!?\\[\\[)${escRe(oldN)}(?=[\\]|#])`, 'gi');
      for (const n of S.notes.values()) {
        if (!n.links.some((l) => l.toLowerCase() === oldN.toLowerCase())) continue;
        const nc = n.content.replace(re, `$1${newN}`);
        if (nc !== n.content) { n.content = nc; n.version++; scheduleSave(n.path); updated++; }
      }
    }
    await refreshVault();
    const t = activeTab(), an = activeNote();
    if (an) {
      updateNoteChrome(an);
      // o texto só é trocado se mudou (ex.: links atualizados nesta nota), mantendo o cursor
      if (editor.value !== an.content) {
        const a = editor.ta.selectionStart, b = editor.ta.selectionEnd;
        editor.value = an.content;
        editor.ta.setSelectionRange(Math.min(a, an.content.length), Math.min(b, an.content.length));
        if (t.mode !== 'edit') renderPreview();
      }
    }
    renderTabs(); persistTabs(); markTreeActive();
    toast(updated ? `Renomeado · ${updated} nota(s) com links atualizados` : 'Renomeado', 'success');
  } catch (err) {
    toast(err.message, 'error');
    const n = activeNote(); if (n) $('#note-title').value = n.name;
  }
}

async function deletePath(path, isFolder) {
  const ok = await confirmBox(isFolder ? 'Excluir pasta?' : 'Excluir nota?', `“${path}” será movido para ${lumen.platform === 'android' ? 'a pasta .lixeira do cofre' : 'a lixeira do sistema'}.`);
  if (!ok) return;
  try {
    for (const t of [...S.tabs]) if (t.kind === 'note' && (t.path === path || t.path.startsWith(path + '/'))) { S.pending.delete(t.path); closeTab(t.id, true); }
    await lumen.fs.remove(path);
    await refreshVault();
    toast('Movido para a lixeira', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function duplicateNote(path) {
  const n = S.notes.get(path); if (!n) return;
  await createNote({ folder: n.folder, name: n.name + ' (cópia)', content: n.content });
}

async function newFolder(parent = '') {
  const name = await promptName('Nova pasta', 'Nova pasta');
  if (!name || !cleanName(name)) return;
  try {
    const rel = await lumen.fs.mkdir(joinPath(parent, cleanName(name)));
    if (parent && !S.settings.expanded.includes(parent)) S.settings.expanded.push(parent);
    await refreshVault();
    toast(`Pasta “${baseName(rel)}” criada`, 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function pasteImages(files) {
  for (const f of files) {
    try {
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const name = f.name && f.name !== 'image.png' ? f.name : `Colado-${stamp}.${ext}`;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const rel = await lumen.fs.saveImage(S.settings.attachmentsFolder, name, bytes);
      const s = editor.ta.selectionStart;
      editor.replace(s, editor.ta.selectionEnd, `![[${rel}]]`);
      await refreshVault();
      renderPreview();
    } catch (err) { toast('Falha ao colar imagem: ' + err.message, 'error'); }
  }
}

// ---------- árvore de arquivos ----------
function renderTree() {
  const el = $('#file-tree');
  const exp = new Set(S.settings.expanded);
  const activePath = activeTab()?.path;
  const sortItems = (items) => {
    if (S.settings.sort !== 'mtime') return items;
    const isF = (x) => (x.type === 'folder' ? 0 : 1);
    return [...items].sort((a, b) => isF(a) - isF(b)
      || (isF(a) ? (S.notes.get(b.path)?.mtime || 0) - (S.notes.get(a.path)?.mtime || 0) : a.name.localeCompare(b.name, 'pt-BR')));
  };
  const build = (items, depth) => sortItems(items).map((it) => {
    const pad = 8 + depth * 14;
    if (it.type === 'folder') {
      const open = exp.has(it.path);
      return `<div class="tree-item folder${open ? ' open' : ''}" data-path="${esc(it.path)}" data-type="folder" draggable="true" style="padding-left:${pad}px">
        <span class="ti-chev">${icon('chevron', 13)}</span><span class="ti-icon">${icon(open ? 'folderOpen' : 'folder', 16)}</span><span class="ti-name">${esc(it.name)}</span></div>
        <div class="tree-children${open ? '' : ' collapsed'}" style="--guide:${pad + 7}px">${open ? build(it.children, depth + 1) : ''}</div>`;
    }
    const name = it.type === 'note' ? baseName(it.path) : it.name;
    return `<div class="tree-item ${it.type}${it.path === activePath ? ' active' : ''}" data-path="${esc(it.path)}" data-type="${it.type}" draggable="true" style="padding-left:${pad + 16}px">
      <span class="ti-icon">${icon(it.type === 'image' ? 'image' : 'note', 15)}</span><span class="ti-name">${esc(name)}</span></div>`;
  }).join('');
  el.innerHTML = S.tree.length ? build(S.tree, 0)
    : `<div class="tree-empty">Seu cofre está vazio.<br><button class="btn primary" style="margin-top:12px" data-cmd="new-note">${icon('notePlus', 16)}Criar primeira nota</button></div>`;
}

function markTreeActive() {
  const p = activeTab()?.path;
  // abre as pastas da nota ativa para ela aparecer na árvore
  if (p && activeTab()?.kind === 'note' && p.includes('/')) {
    const parts = p.split('/').slice(0, -1);
    const need = parts.map((_, i) => parts.slice(0, i + 1).join('/')).filter((f) => !S.settings.expanded.includes(f));
    if (need.length) { S.settings.expanded.push(...need); saveSettings(); renderTree(); return; }
  }
  $$('#file-tree .tree-item').forEach((el) => el.classList.toggle('active', el.dataset.path === p && el.dataset.type === 'note'));
}

function bindTree() {
  const el = $('#file-tree');
  el.addEventListener('click', (e) => {
    const it = e.target.closest('.tree-item'); if (!it) return;
    const { path, type } = it.dataset;
    if (type === 'folder') {
      const exp = new Set(S.settings.expanded);
      exp.has(path) ? exp.delete(path) : exp.add(path);
      S.settings.expanded = [...exp]; saveSettings(); renderTree();
    } else if (type === 'note') openNote(path, { newTab: e.ctrlKey || e.metaKey });
    else if (type === 'image') lumen.shell.reveal(path);
  });
  el.addEventListener('auxclick', (e) => {
    const it = e.target.closest('.tree-item[data-type="note"]');
    if (it && e.button === 1) openNote(it.dataset.path, { newTab: true });
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const it = e.target.closest('.tree-item');
    if (!it) {
      showMenu(e.clientX, e.clientY, [
        { label: 'Nova nota', icon: 'notePlus', run: () => createNote({ folder: '' }) },
        { label: 'Nova pasta', icon: 'folderPlus', run: () => newFolder('') },
      ]);
      return;
    }
    const { path, type } = it.dataset;
    if (type === 'folder') {
      showMenu(e.clientX, e.clientY, [
        { label: 'Nova nota aqui', icon: 'notePlus', run: () => createNote({ folder: path }) },
        { label: 'Nova subpasta', icon: 'folderPlus', run: () => newFolder(path) },
        'sep',
        { label: 'Renomear', icon: 'edit', run: async () => { const n = await promptName('Renomear pasta', baseName(path)); if (n && cleanName(n)) renamePath(path, joinPath(dirName(path), cleanName(n)), true); } },
        ...(CAN_REVEAL ? [{ label: 'Mostrar no Explorer', icon: 'external', run: () => lumen.shell.reveal(path) }] : []),
        'sep',
        { label: 'Excluir pasta', icon: 'trash', danger: true, run: () => deletePath(path, true) },
      ]);
    } else {
      const items = [];
      if (type === 'note') items.push(
        { label: 'Abrir em nova aba', icon: 'plus', run: () => openNote(path, { newTab: true }) },
        { label: 'Renomear', icon: 'edit', run: async () => { const n = await promptName('Renomear nota', baseName(path)); if (n && cleanName(n)) renamePath(path, joinPath(dirName(path), cleanName(n) + (path.match(/\.\w+$/)?.[0] || '.md'))); } },
        { label: 'Duplicar', icon: 'copy', run: () => duplicateNote(path) },
        ...(IS_ANDROID ? [{ label: 'Compartilhar', icon: 'external', run: () => shareNote(path) }] : []),
      );
      else items.push({ label: 'Copiar link de incorporação', icon: 'link', run: () => { navigator.clipboard.writeText(`![[${path}]]`); toast('Link copiado'); } });
      items.push(
        ...(CAN_REVEAL ? [{ label: 'Mostrar no Explorer', icon: 'external', run: () => lumen.shell.reveal(path) }] : []),
        'sep',
        { label: 'Excluir', icon: 'trash', danger: true, run: () => deletePath(path, false) },
      );
      showMenu(e.clientX, e.clientY, items);
    }
  });
  // arrastar para mover
  let drag = null;
  el.addEventListener('dragstart', (e) => {
    const it = e.target.closest('.tree-item'); if (!it) return;
    drag = { path: it.dataset.path, type: it.dataset.type };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', drag.type === 'note' ? `[[${baseName(drag.path)}]]` : drag.type === 'image' ? `![[${drag.path}]]` : drag.path);
  });
  el.addEventListener('dragover', (e) => {
    if (!drag) return;
    e.preventDefault();
    $$('.drop-target', el).forEach((x) => x.classList.remove('drop-target'));
    const f = e.target.closest('.tree-item.folder');
    if (f && f.dataset.path !== drag.path) f.classList.add('drop-target');
  });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) $$('.drop-target', el).forEach((x) => x.classList.remove('drop-target')); });
  el.addEventListener('drop', (e) => {
    if (!drag) return;
    e.preventDefault();
    $$('.drop-target', el).forEach((x) => x.classList.remove('drop-target'));
    const f = e.target.closest('.tree-item.folder');
    const target = f ? f.dataset.path : '';
    const name = drag.path.split('/').pop();
    const dest = joinPath(target, name);
    if (dest !== drag.path && !(drag.type === 'folder' && (target === drag.path || target.startsWith(drag.path + '/')))) {
      renamePath(drag.path, dest, drag.type === 'folder');
      if (target && !S.settings.expanded.includes(target)) S.settings.expanded.push(target);
    }
    drag = null;
  });
  el.addEventListener('dragend', () => { drag = null; });
}

// ---------- busca e tags ----------
function runSearch() {
  const raw = $('#search-input').value.trim();
  const out = $('#search-results'), meta = $('#search-meta');
  if (!raw) { out.innerHTML = ''; meta.textContent = 'Digite para buscar em títulos e conteúdo. Use #tag para filtrar.'; return; }
  const tagQ = /^(#|tag:)(\S+)$/.exec(raw);
  const results = [];
  if (tagQ) {
    const tq = tagQ[2].replace(/^#/, '').toLowerCase();
    for (const n of S.notes.values()) if (n.tags.some((t) => t.toLowerCase() === tq || t.toLowerCase().startsWith(tq + '/'))) results.push({ n, hits: [] });
  } else {
    const q = raw.toLowerCase();
    const re = new RegExp(escRe(raw), 'gi');
    for (const n of S.notes.values()) {
      const inName = n.name.toLowerCase().includes(q);
      const lc = n.content.toLowerCase();
      const hits = [];
      let i = lc.indexOf(q);
      while (i >= 0 && hits.length < 4) {
        const s = Math.max(0, i - 40), e = Math.min(n.content.length, i + q.length + 70);
        const snip = (s > 0 ? '…' : '') + n.content.slice(s, e).replace(/\n/g, ' ') + (e < n.content.length ? '…' : '');
        hits.push({ html: esc(snip).replace(new RegExp(escRe(esc(raw)), 'gi'), (m) => `<mark>${m}</mark>`), pos: i });
        i = lc.indexOf(q, i + q.length);
      }
      const count = (n.content.match(re) || []).length;
      if (inName || hits.length) results.push({ n, hits, count, score: (inName ? 100 : 0) + count });
    }
    results.sort((a, b) => b.score - a.score);
  }
  meta.textContent = `${results.length} nota(s) encontrada(s)`;
  out.innerHTML = results.slice(0, 80).map(({ n, hits, count }) => `
    <div class="sr-file">
      <div class="sr-name" data-path="${esc(n.path)}">${icon('note', 15)}<span>${esc(n.name)}</span>${count ? `<span class="count">${count}</span>` : ''}</div>
      ${hits.map((h) => `<div class="sr-hit" data-path="${esc(n.path)}" data-pos="${h.pos}">${h.html}</div>`).join('')}
    </div>`).join('');
}

function renderTags() {
  const counts = new Map();
  for (const n of S.notes.values()) for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
  const list = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $('#tag-list').innerHTML = list.length
    ? list.map(([t, c]) => `<span class="tag-chip" data-tag="${esc(t)}">#${esc(t)}<span class="n">${c}</span></span>`).join('')
    : '<div class="rp-empty">Nenhuma tag ainda. Escreva #algo em uma nota.</div>';
}

function searchTag(tag) {
  showLeftPanel('search');
  $('#search-input').value = '#' + tag;
  runSearch();
}

// ---------- painel direito ----------
function renderRight() {
  const note = activeNote();
  const p = S.settings.rightPanel;
  $$('#right-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.rpanel === p));
  $$('.rpanel').forEach((el) => { el.hidden = el.dataset.rpanel !== p; });
  if (!note) {
    ['#outline', '#backlinks', '#note-info'].forEach((s) => { $(s).innerHTML = '<div class="rp-empty">Abra uma nota para ver detalhes.</div>'; });
    $('#outlinks').innerHTML = '';
    return;
  }
  if (p === 'outline') {
    const min = Math.min(...note.headings.map((h) => h.level), 6);
    $('#outline').innerHTML = note.headings.length
      ? note.headings.map((h) => `<button class="outline-item" data-id="${esc(h.id)}" style="padding-left:${8 + (h.level - min) * 14}px">${esc(h.text)}</button>`).join('')
      : '<div class="rp-empty">Sem títulos. Use # Título para criar um sumário.</div>';
  }
  if (p === 'backlinks') {
    const bl = backlinksOf(note.path);
    const re = new RegExp(`\\[\\[${escRe(note.name)}(?=[\\]|#])`, 'i');
    $('#backlinks').innerHTML = bl.length ? bl.map((n) => {
      const line = n.content.split('\n').find((l) => re.test(l)) || '';
      return `<div class="bl-item" data-path="${esc(n.path)}"><div class="bl-name">${icon('note', 14)}${esc(n.name)}</div><div class="bl-snip">${esc(line.trim().slice(0, 160))}</div></div>`;
    }).join('') : '<div class="rp-empty">Nenhuma nota aponta para esta.</div>';
    const outs = [...new Set(note.links)];
    $('#outlinks').innerHTML = outs.length ? outs.map((l) => {
      const r = resolveLink(l, note.path);
      return `<div class="bl-item${r ? '' : ' ghost'}" data-target="${esc(l)}"><div class="bl-name">${icon(r ? 'link' : 'plus', 14)}${esc(l)}</div>${r ? '' : '<div class="bl-snip">Ainda não criada — clique para criar</div>'}</div>`;
    }).join('') : '<div class="rp-empty">Nenhum link de saída.</div>';
  }
  if (p === 'info') {
    const chars = note.content.length;
    const mins = Math.max(1, Math.round(note.words / 200));
    $('#note-info').innerHTML = `
      <div class="info-grid">
        <div class="info-card"><div class="v">${note.words.toLocaleString('pt-BR')}</div><div class="k">palavras</div></div>
        <div class="info-card"><div class="v">${chars.toLocaleString('pt-BR')}</div><div class="k">caracteres</div></div>
        <div class="info-card"><div class="v">${mins} min</div><div class="k">de leitura</div></div>
        <div class="info-card"><div class="v">${backlinksOf(note.path).length}</div><div class="k">backlinks</div></div>
      </div>
      <div style="margin-top:12px">
        <div class="info-row"><span>Caminho</span><span>${esc(note.path)}</span></div>
        <div class="info-row"><span>Modificada</span><span>${new Date(note.mtime).toLocaleString('pt-BR')}</span></div>
        <div class="info-row"><span>Criada</span><span>${new Date(note.ctime).toLocaleString('pt-BR')}</span></div>
      </div>
      <div class="rp-title">Tags</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${note.tags.map((t) => `<span class="tag-chip" data-tag="${esc(t)}">#${esc(t)}</span>`).join('') || '<div class="rp-empty">Sem tags</div>'}</div>`;
  }
}

// ---------- tela inicial ----------
function renderEmpty() {
  if (activeTab()) return;
  const recent = [...S.notes.values()].sort((a, b) => b.mtime - a.mtime).slice(0, 6);
  $('#recent-list').innerHTML = recent.length ? `<div class="recent-title">Recentes</div>` + recent.map((n) =>
    `<div class="recent-item" data-path="${esc(n.path)}">${icon('note', 16)}<span>${esc(n.name)}</span><span class="when">${relTime(n.mtime)}</span></div>`).join('') : '';
}

// ---------- grafo ----------
function updateGraph() {
  const g = S.settings.graph;
  ['tags', 'orphans', 'ghosts', 'labels'].forEach((k) => { $('#g-' + k).checked = !!g[k]; });
  if (!S.graph) {
    S.graph = new GraphView($('#graph-canvas'), {
      getActive: () => S.lastNote,
      onOpen: (n, e) => {
        if (n.kind === 'note') openNote(n.id, { newTab: true });
        else if (n.kind === 'ghost') openOrCreateByName(n.label, { newTab: true });
        else if (n.kind === 'tag') searchTag(n.label.slice(1));
      },
    });
  }
  const nodes = [], edges = [], ids = new Set();
  const deg = new Map();
  for (const n of S.notes.values()) {
    for (const l of n.links) {
      const r = resolveLink(l, n.path);
      const id = r || (g.ghosts ? 'ghost:' + l.toLowerCase() : null);
      if (!id) continue;
      edges.push([n.path, id]);
      deg.set(n.path, (deg.get(n.path) || 0) + 1);
      deg.set(id, (deg.get(id) || 0) + 1);
      if (!r && !ids.has(id)) { ids.add(id); nodes.push({ id, label: l, kind: 'ghost' }); }
    }
    if (g.tags) for (const t of n.tags) {
      const id = 'tag:' + t.toLowerCase();
      edges.push([n.path, id]);
      deg.set(n.path, (deg.get(n.path) || 0) + 1);
      if (!ids.has(id)) { ids.add(id); nodes.push({ id, label: '#' + t, kind: 'tag' }); }
    }
  }
  for (const n of S.notes.values()) {
    if (!g.orphans && !deg.get(n.path)) continue;
    nodes.push({ id: n.path, label: n.name, kind: 'note' });
  }
  S.graph.showLabels = g.labels;
  S.graph.readColors();
  S.graph.setData({ nodes, edges });
  requestAnimationFrame(() => S.graph.resize());
  $('#graph-stats').textContent = `${S.notes.size} notas · ${edges.length} conexões`;
}

// ---------- paleta de comandos ----------
const COMMANDS = [
  { id: 'new-note', name: 'Nova nota', icon: 'notePlus', key: 'Ctrl N', run: () => createNote() },
  { id: 'new-folder', name: 'Nova pasta', icon: 'folderPlus', run: () => newFolder('') },
  { id: 'daily', name: 'Abrir nota diária', icon: 'calendar', key: 'Ctrl Shift D', run: dailyNote },
  { id: 'graph', name: 'Abrir grafo', icon: 'graph', key: 'Ctrl G', run: () => addTab({ kind: 'graph' }) },
  { id: 'search', name: 'Buscar no cofre', icon: 'search', key: 'Ctrl Shift F', run: () => { showLeftPanel('search'); $('#search-input').focus(); } },
  { id: 'toggle-mode', name: 'Alternar edição / leitura', icon: 'eye', key: 'Ctrl E', run: () => toggleMode() },
  { id: 'split', name: 'Modo dividido', icon: 'columns', key: 'Ctrl \\', run: () => setMode(activeTab()?.mode === 'split' ? 'edit' : 'split') },
  { id: 'toggle-left', name: 'Alternar barra lateral esquerda', icon: 'panelLeft', run: () => toggleSide('left') },
  { id: 'toggle-right', name: 'Alternar painel direito', icon: 'panelRight', run: () => toggleSide('right') },
  { id: 'zen', name: 'Modo foco', icon: 'focus', key: 'F11', run: () => toggleZen() },
  { id: 'settings', name: 'Abrir configurações', icon: 'settings', key: 'Ctrl ,', run: () => openSettings() },
  { id: 'theme-cycle', name: 'Próximo tema', icon: 'palette', run: () => cycleTheme() },
  { id: 'rename', name: 'Renomear nota atual', icon: 'edit', run: () => { if (activeNote()) { setMode(activeTab().mode === 'preview' ? 'edit' : activeTab().mode); $('#note-title').focus(); $('#note-title').select(); } } },
  { id: 'delete', name: 'Excluir nota atual', icon: 'trash', run: () => { const n = activeNote(); if (n) deletePath(n.path); } },
  { id: 'duplicate', name: 'Duplicar nota atual', icon: 'copy', run: () => { const n = activeNote(); if (n) duplicateNote(n.path); } },
  ...(CAN_REVEAL ? [{ id: 'reveal', name: 'Mostrar nota no Explorer', icon: 'external', run: () => { const n = activeNote(); if (n) lumen.shell.reveal(n.path); } }] : []),
  { id: 'export-html', name: 'Exportar nota como HTML', icon: 'download', run: () => exportHtml() },
  { id: 'export-pdf', name: 'Exportar nota como PDF', icon: 'download', run: () => exportPdf() },
  { id: 'switch-vault', name: IS_ANDROID ? 'Escolher pasta do cofre' : 'Trocar de cofre', icon: 'vault', run: () => chooseVault() },
  ...(IS_ANDROID ? [
    { id: 'share-note', name: 'Compartilhar nota', icon: 'external', run: () => shareNote() },
    { id: 'backup', name: 'Fazer backup do cofre (.zip)', icon: 'download', run: () => backupVault() },
  ] : []),
  { id: 'reload', name: 'Recarregar cofre', icon: 'refresh', run: () => refreshVault().then(() => toast('Cofre recarregado')) },
  { id: 'font-up', name: 'Aumentar fonte', icon: 'type', key: 'Ctrl +', run: () => setSetting('fontSize', Math.min(26, S.settings.fontSize + 1)) },
  { id: 'font-down', name: 'Diminuir fonte', icon: 'type', key: 'Ctrl -', run: () => setSetting('fontSize', Math.max(11, S.settings.fontSize - 1)) },
  { id: 'theme-creator', name: 'Criador de temas', icon: 'wand', run: () => openSettings('creator') },
  { id: 'fx-settings', name: 'Partículas e cursor', icon: 'sparkles', run: () => openSettings('effects') },
  { id: 'fx-toggle', name: 'Ligar/desligar partículas', icon: 'sparkles', run: () => { setSetting('fxParticles', !S.settings.fxParticles); toast(S.settings.fxParticles ? 'Partículas ligadas' : 'Partículas desligadas'); } },
  ...Object.entries(FX_PRESETS).map(([id, p]) => ({ id: 'fx-' + id, name: `Efeitos: ${p.name}`, icon: 'sparkles', run: () => { applyFxPreset(id); toast(`Efeitos: ${p.name}`); } })),
  { id: 'theme-new', name: 'Criar novo tema', icon: 'wand', run: () => { tcNew(); openSettings('creator'); } },
];
const themeCommands = () => Object.entries(allThemes(S.settings)).map(([k, t]) => ({ id: 'theme-' + k, name: `Tema: ${t.name}`, icon: 'palette', run: () => { S.settings.accent = null; setSetting('theme', k); } }));

const PAL = { items: [], sel: 0 };
function openPalette(prefix = '') {
  $('#palette').hidden = false;
  const inp = $('#palette-input');
  inp.value = prefix;
  renderPalette();
  setTimeout(() => inp.focus(), 10);
}
function closePalette() { $('#palette').hidden = true; }
function renderPalette() {
  const raw = $('#palette-input').value;
  const list = $('#palette-list');
  let html = '';
  PAL.items = []; PAL.sel = 0;
  if (raw.startsWith('>')) {
    const q = raw.slice(1).trim();
    const scored = [...COMMANDS, ...themeCommands()].map((c) => ({ c, f: fuzzy(q, c.name) })).filter((x) => x.f).sort((a, b) => b.f.score - a.f.score);
    PAL.items = scored.map(({ c, f }) => ({ run: c.run, html: `<span class="pl-icon">${icon(c.icon, 17)}</span><span class="pl-main">${hlIdx(c.name, f.idx)}</span>${c.key ? `<kbd>${c.key}</kbd>` : ''}` }));
  } else {
    const q = raw.trim();
    let notes = [...S.notes.values()];
    let scored;
    if (!q) scored = notes.sort((a, b) => b.mtime - a.mtime).slice(0, 30).map((n) => ({ n, f: { idx: [] } }));
    else scored = notes.map((n) => ({ n, f: fuzzy(q, n.name) || (fuzzy(q, n.path) && { score: fuzzy(q, n.path).score - 10, idx: [] }) })).filter((x) => x.f).sort((a, b) => b.f.score - a.f.score).slice(0, 50);
    PAL.items = scored.map(({ n, f }) => ({
      run: (e) => openNote(n.path, { newTab: e?.ctrlKey }),
      html: `<span class="pl-icon">${icon('note', 17)}</span><span class="pl-main">${hlIdx(n.name, f.idx)}${n.folder ? `<span class="pl-sub">${esc(n.folder)}</span>` : ''}</span>`,
    }));
    if (q && !S.names.has(q.toLowerCase())) {
      PAL.items.push({ create: true, run: () => openOrCreateByName(cleanName(q) || q), html: `<span class="pl-icon">${icon('plus', 17)}</span><span class="pl-main">Criar nota “${esc(q)}”</span><kbd>Shift Enter</kbd>` });
    }
    if (!q) html = '<div class="pl-group">Recentes</div>';
  }
  list.innerHTML = html + (PAL.items.length ? PAL.items.map((it, i) => `<div class="pl-item${i === 0 ? ' sel' : ''}" data-i="${i}">${it.html}</div>`).join('') : '<div class="rp-empty" style="padding:16px">Nada encontrado.</div>');
}
function movePalette(d) {
  if (!PAL.items.length) return;
  PAL.sel = (PAL.sel + d + PAL.items.length) % PAL.items.length;
  $$('#palette-list .pl-item').forEach((el, i) => el.classList.toggle('sel', i === PAL.sel));
  $('#palette-list .pl-item.sel')?.scrollIntoView({ block: 'nearest' });
}
function runPalette(i, e) {
  const it = PAL.items[i]; if (!it) return;
  closePalette(); it.run(e);
}
function bindPalette() {
  const inp = $('#palette-input');
  inp.addEventListener('input', renderPalette);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && !inp.value.startsWith('>')) { const q = inp.value.trim(); if (q) { closePalette(); openOrCreateByName(cleanName(q)); } return; }
      runPalette(PAL.sel, e);
    } else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  $('#palette-list').addEventListener('click', (e) => { const it = e.target.closest('.pl-item'); if (it) runPalette(Number(it.dataset.i), e); });
  $('#palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') closePalette(); });
}

// ---------- configurações (modal) ----------
const SECTIONS = [
  { id: 'appearance', name: 'Aparência', icon: 'palette' },
  { id: 'creator', name: 'Criador de temas', icon: 'wand' },
  { id: 'effects', name: 'Partículas e cursor', icon: 'sparkles' },
  { id: 'typography', name: 'Tipografia', icon: 'type' },
  { id: 'editor', name: 'Editor', icon: 'edit' },
  { id: 'vault', name: 'Cofre e arquivos', icon: 'vault' },
  { id: 'css', name: 'CSS personalizado', icon: 'code' },
  { id: 'keys', name: 'Atalhos', icon: 'command' },
  { id: 'about', name: 'Sobre', icon: 'info' },
];
let curSection = 'appearance';

function openSettings(section) {
  if (section) curSection = section;
  if (curSection !== 'creator') tcStopLive();
  $('#settings').hidden = false;
  $('#settings-nav').innerHTML = '<div class="sn-title">Configurações</div>' + SECTIONS.map((s) => `<button data-sec="${s.id}" class="${s.id === curSection ? 'active' : ''}">${icon(s.icon, 17)}<span>${s.name}</span></button>`).join('');
  renderSection();
}
function closeSettings() { tcStopLive(); $('#settings').hidden = true; }

const row = (label, hint, ctl) => `<div class="set-row"><div class="lbl"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div><div class="ctl">${ctl}</div></div>`;
const toggleCtl = (key) => `<label class="toggle"><input type="checkbox" data-key="${key}" ${S.settings[key] ? 'checked' : ''}><span></span></label>`;
const rangeCtl = (key, min, max, step, fmt = (v) => v) => `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${S.settings[key]}"><span class="val" data-val="${key}">${fmt(S.settings[key])}</span>`;
const selectCtl = (key, opts) => `<select data-key="${key}">${Object.entries(opts).map(([v, l]) => `<option value="${v}" ${String(S.settings[key]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const FMT = { fontSize: (v) => v + 'px', lineHeight: (v) => Number(v).toFixed(2), contentWidth: (v) => (v >= 1400 ? 'Total' : v + 'px'), radius: (v) => v + 'px', autosaveDelay: (v) => v + 'ms' };

function renderSection() {
  const s = S.settings;
  const c = $('#settings-content');
  const fontOpts = Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.name]));
  if (curSection === 'appearance') {
    const t = { ...themeOf(s), ...(s.overrides[s.theme] || {}) };
    c.innerHTML = `<h2>Aparência</h2><p class="sub">Temas, cores e efeitos visuais. As mudanças são aplicadas na hora.</p>
      <div class="set-group"><h4>Tema</h4><div class="theme-grid">${Object.entries(allThemes(s)).map(([k, th]) => `
        <button class="theme-card${k === s.theme ? ' active' : ''}${s.customThemes[k] ? ' custom' : ''}" data-theme="${k}">${s.customThemes[k] ? `<span class="tc-badge" data-edit-theme="${k}" title="Editar no criador">${icon('edit', 13)}</span>` : ''}
          <div class="tc-prev" style="background:${th.bg}">
            <div class="tc-side" style="background:${th.bg2}"></div>
            <div class="tc-main" style="background:${th.bg3}">
              <div class="tc-line" style="background:${th.text};width:60%;opacity:.8"></div>
              <div class="tc-line" style="background:${th.muted};width:85%;opacity:.5"></div>
              <div class="tc-line" style="background:${th.accent};width:40%"></div>
            </div>
          </div>
          <div class="tc-name" style="background:${th.bg2};color:${th.text}"><span>${esc(th.name)}</span><span style="opacity:.6;font-weight:500">${th.dark ? 'Escuro' : 'Claro'}</span></div>
        </button>`).join('')}
        <button class="theme-card new-theme" id="tc-open-creator"><div class="nt-inner">${icon('wand', 22)}<span>Criar tema</span></div></button></div></div>
      <div class="set-group"><h4>Cor de destaque</h4>
        <div class="swatches">
          <button class="swatch auto${!s.accent ? ' active' : ''}" data-accent="" title="Cor do tema"></button>
          ${ACCENTS.map((a) => `<button class="swatch${s.accent === a ? ' active' : ''}" data-accent="${a}" style="background:${a}" title="${a}"></button>`).join('')}
          <input type="color" class="color-input" id="accent-custom" value="${s.accent || t.accent}" title="Cor personalizada">
        </div></div>
      <div class="set-group"><h4>Ajustar cores do tema “${esc(themeOf(s).name)}”</h4>
        <div class="color-overrides">${[['bg', 'Fundo'], ['bg2', 'Barras laterais'], ['bg3', 'Elementos'], ['border', 'Bordas'], ['text', 'Texto'], ['muted', 'Texto secundário']].map(([k, l]) =>
          `<label class="co-item"><input type="color" class="color-input" data-override="${k}" value="${String(t[k]).slice(0, 7)}">${l}</label>`).join('')}</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="reset-overrides">Restaurar cores do tema</button><button class="btn" id="export-theme">${icon('copy', 15)}Copiar tema (JSON)</button><button class="btn" id="import-theme">${icon('download', 15)}Importar tema</button></div>
      </div>
      <div class="set-group"><h4>Efeitos</h4>
        ${row('Fundo', 'Brilho suave da cor de destaque atrás da interface.', selectCtl('background', { plain: 'Liso', glow: 'Brilho', mesh: 'Aurora animada' }))}
        ${row('Vidro (translucidez)', 'Desfoque nas barras e janelas.', toggleCtl('glass'))}
        ${row('Arredondamento', '', rangeCtl('radius', 0, 20, 1, FMT.radius))}
        ${row('Densidade', '', selectCtl('density', { comfortable: 'Confortável', compact: 'Compacta' }))}
        ${row('Animações', '', toggleCtl('animations'))}
        ${row('Faixa de ícones', 'Barra vertical à esquerda.', toggleCtl('ribbon'))}
      </div>`;
  } else if (curSection === 'creator') {
    renderCreator(c);
    return;
  } else if (curSection === 'effects') {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const pct = (v) => v + '%';
    c.innerHTML = `<h2>Partículas e cursor</h2><p class="sub">Dê vida ao fundo e ao ponteiro do mouse. Tudo roda num único loop leve, que pausa quando a janela é minimizada.</p>
      ${!s.animations ? `<p class="fx-hint warn">As animações estão desligadas em Aparência — os efeitos ficam pausados. <button class="btn" id="fx-enable-anim" style="margin-left:6px">Ligar animações</button></p>` : ''}
      ${reduce ? '<p class="fx-hint warn">O sistema pediu “reduzir movimento”, então os efeitos ficam desligados.</p>' : ''}
      <div class="set-group"><h4>Estilos prontos</h4><div class="fx-presets">${Object.entries(FX_PRESETS).map(([id, p]) => `
        <button class="fx-preset${presetActive(id) ? ' active' : ''}" data-fx-preset="${id}"><span class="fx-ic">${icon(id === 'none' ? 'x' : 'sparkles', 16)}</span><b>${p.name}</b><small>${id === 'none' ? 'Sem efeitos' : `${FX_STYLES[p.fx.fxStyle]} · ${FX_CURSORS[p.fx.fxCursor]}`}</small></button>`).join('')}</div></div>
      <div class="set-group"><h4>Partículas de fundo</h4>
        ${row('Mostrar partículas', '', toggleCtl('fxParticles'))}
        ${row('Estilo', '', selectCtl('fxStyle', FX_STYLES))}
        ${row('Quantidade', '', rangeCtl('fxDensity', 5, 150, 5))}
        ${row('Velocidade', '', rangeCtl('fxSpeed', 5, 150, 5, pct))}
        ${row('Tamanho', '', rangeCtl('fxSize', 20, 150, 5, pct))}
        ${row('Intensidade', 'Brilho e opacidade das partículas.', rangeCtl('fxOpacity', 10, 100, 5, pct))}
        ${row('Cor', '', `<div class="fx-color-row">${selectCtl('fxColor', FX_COLORS)}<input type="color" class="color-input" data-key="fxCustomColor" value="${s.fxCustomColor}" title="Cor personalizada" ${s.fxColor === 'custom' ? '' : 'hidden'}></div>`)}
        ${row('Reação ao mouse', 'As partículas fogem ou são atraídas pelo ponteiro.', selectCtl('fxMouse', { none: 'Nenhuma', repel: 'Fugir', attract: 'Atrair' }))}
        ${row('Camada', 'Na frente: as partículas passam por cima das notas (sem bloquear cliques).', selectCtl('fxLayer', { back: 'Atrás da interface', front: 'Na frente' }))}
        ${row('Transparência da área de escrita', 'Quanto menor, mais o fundo e as partículas aparecem atrás do texto.', rangeCtl('workspaceOpacity', 40, 100, 2, pct))}
      </div>
      <div class="set-group"><h4>Cursor</h4>
        ${row('Efeito ao mover', '', selectCtl('fxCursor', FX_CURSORS))}
        ${row('Explosão ao clicar', 'Um estouro de brilhos a cada clique.', toggleCtl('fxClickBurst'))}
      </div>`;
  } else if (curSection === 'typography') {
    c.innerHTML = `<h2>Tipografia</h2><p class="sub">Fontes e medidas do texto.</p>
      <div class="set-group">
        ${row('Fonte da interface', '', selectCtl('fontUi', fontOpts))}
        ${row('Fonte do texto', 'Usada no editor e na leitura.', selectCtl('fontEditor', fontOpts))}
        ${row('Fonte personalizada', 'Nome de qualquer fonte instalada no sistema (sobrepõe a fonte do texto).', `<input type="text" data-key="customFont" value="${esc(s.customFont)}" placeholder="ex.: Segoe UI, Calibri">`)}
        ${row('Fonte de código', '', selectCtl('fontMono', fontOpts))}
        ${row('Tamanho', 'Ctrl + / Ctrl − também funcionam.', rangeCtl('fontSize', 11, 26, 1, FMT.fontSize))}
        ${row('Altura da linha', '', rangeCtl('lineHeight', 1.2, 2.2, 0.05, FMT.lineHeight))}
        ${row('Largura do texto', 'Linha legível; arraste ao máximo para largura total.', rangeCtl('contentWidth', 520, 1400, 20, FMT.contentWidth))}
      </div>
      <div class="font-preview"><div class="fp-h">O rápido gato marrom</div><div class="fp-p">Escrever é pensar com clareza. Este é um exemplo do seu texto com <code>código</code>, <b>negrito</b> e <i>itálico</i> — 0123456789.</div></div>`;
  } else if (curSection === 'editor') {
    c.innerHTML = `<h2>Editor</h2><p class="sub">Comportamento ao escrever.</p>
      <div class="set-group">
        ${row('Modo padrão de novas abas', '', selectCtl('defaultMode', { edit: 'Edição', split: 'Dividido', preview: 'Leitura' }))}
        ${row('Listas inteligentes', 'Enter continua listas, numeração e tarefas.', toggleCtl('smartLists'))}
        ${row('Fechar pares automaticamente', 'Parênteses, colchetes, aspas e crases.', toggleCtl('autoPair'))}
        ${row('Corretor ortográfico', '', toggleCtl('spellcheck'))}
        ${row('Atraso do salvamento automático', '', rangeCtl('autosaveDelay', 200, 3000, 100, FMT.autosaveDelay))}
      </div>`;
  } else if (curSection === 'vault') {
    c.innerHTML = `<h2>Cofre e arquivos</h2><p class="sub">Suas notas são arquivos .md comuns nesta pasta.</p>
      <div class="set-group">
        ${IS_ANDROID
          ? row('Cofre atual', esc(S.vault?.root || '') + (S.vault?.kind === 'app' ? ' — pasta privada: é apagada se o app for desinstalado. Faça backups ou escolha uma pasta do aparelho.' : ''), `<button class="btn primary" id="set-switch">${icon('vault', 15)}Escolher pasta</button>`)
            + row('Backup', 'Gera um .zip com todas as notas e anexos para salvar no Drive, enviar por e-mail etc.', `<button class="btn" id="set-backup">${icon('download', 15)}Fazer backup (.zip)</button>`)
            + row('Lixeira do cofre', 'Notas excluídas ficam na pasta .lixeira até você esvaziá-la.', `<span class="val" id="trash-count">…</span><button class="btn" id="set-empty-trash">${icon('trash', 15)}Esvaziar</button>`)
          : row('Cofre atual', esc(S.vault?.root || ''), `<button class="btn" id="set-reveal">${icon('external', 15)}Abrir pasta</button><button class="btn primary" id="set-switch">${icon('vault', 15)}Trocar</button>`)}
        ${row('Pasta para novas notas', 'Vazio = raiz do cofre.', `<input type="text" data-key="newNoteFolder" value="${esc(s.newNoteFolder)}" placeholder="(raiz)">`)}
        ${row('Pasta de anexos', 'Onde imagens coladas são salvas.', `<input type="text" data-key="attachmentsFolder" value="${esc(s.attachmentsFolder)}">`)}
        ${row('Pasta das notas diárias', '', `<input type="text" data-key="dailyFolder" value="${esc(s.dailyFolder)}">`)}
        ${row('Ordenação da árvore', '', selectCtl('sort', { name: 'Nome (A–Z)', mtime: 'Modificação recente' }))}
      </div>`;
  } else if (curSection === 'css') {
    c.innerHTML = `<h2>CSS personalizado</h2><p class="sub">Ajuste qualquer detalhe. Variáveis úteis: <code>--accent</code>, <code>--bg</code>, <code>--text</code>, <code>--font-editor</code>, <code>--radius</code>.</p>
      <textarea class="css-editor" id="css-editor" spellcheck="false" placeholder=".markdown h1 { color: var(--accent); }\n.tree-item { font-size: 14px; }">${esc(s.customCss)}</textarea>`;
  } else if (curSection === 'keys') {
    const keys = [['Nova nota', 'Ctrl N'], ['Paleta / abrir nota', 'Ctrl P'], ['Comandos', 'Ctrl Shift P'], ['Buscar no cofre', 'Ctrl Shift F'], ['Edição ↔ leitura', 'Ctrl E'], ['Modo dividido', 'Ctrl \\'], ['Grafo', 'Ctrl G'], ['Nota diária', 'Ctrl Shift D'], ['Fechar aba', 'Ctrl W'], ['Próxima aba', 'Ctrl Tab'], ['Salvar agora', 'Ctrl S'], ['Configurações', 'Ctrl ,'], ['Modo foco', 'F11'], ['Negrito / itálico', 'Ctrl B / Ctrl I'], ['Link', 'Ctrl K'], ['Tarefa', 'Ctrl L'], ['Riscado', 'Ctrl Shift X'], ['Destaque', 'Ctrl Shift H'], ['Indentar', 'Tab / Shift Tab'], ['Fonte maior / menor', 'Ctrl + / Ctrl −']];
    c.innerHTML = `<h2>Atalhos</h2><p class="sub">Atalhos de teclado disponíveis.</p><div class="set-group">${keys.map(([a, k]) => row(a, '', `<kbd>${k}</kbd>`)).join('')}</div>`;
  } else {
    c.innerHTML = `<div class="about"><div class="empty-logo">${icon('sparkles', 34)}</div><h2>Minimal Note</h2><p class="sub">Versão 1.4 · notas em Markdown, locais e suas.</p>
      <p class="sub">${S.notes.size} notas · ${[...S.notes.values()].reduce((a, n) => a + n.words, 0).toLocaleString('pt-BR')} palavras no cofre</p></div>`;
  }
  bindSection();
}

function bindSection() {
  const c = $('#settings-content');
  c.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'range') v = Number(v);
      if (['newNoteFolder', 'attachmentsFolder', 'dailyFolder'].includes(key)) v = v.split('/').map(cleanName).filter(Boolean).join('/');
      setSetting(key, v);
      const out = c.querySelector(`[data-val="${key}"]`);
      if (out) out.textContent = (FMT[key] || ((x) => x))(v);
      if (key === 'spellcheck') editor.ta.spellcheck = v;
      if (key === 'sort') renderTree();
      requestAnimationFrame(() => editor.autosize());
    });
  });
  c.querySelectorAll('[data-fx-preset]').forEach((b) => b.addEventListener('click', () => { applyFxPreset(b.dataset.fxPreset); renderSection(); }));
  $('#fx-enable-anim', c)?.addEventListener('click', () => { setSetting('animations', true); renderSection(); });
  c.querySelectorAll('select[data-key="fxColor"], select[data-key="fxStyle"], select[data-key="fxCursor"], select[data-key="fxMouse"], select[data-key="fxLayer"], input[data-key="fxParticles"], input[data-key="fxClickBurst"]').forEach((el) => el.addEventListener('change', () => renderSection()));
  c.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', (e) => {
    if (e.target.closest('[data-edit-theme]')) { tcEdit(b.dataset.theme); curSection = 'creator'; openSettings(); return; }
    S.settings.accent = null; setSetting('theme', b.dataset.theme); renderSection();
  }));
  $('#tc-open-creator', c)?.addEventListener('click', () => { tcNew(); curSection = 'creator'; openSettings(); });
  c.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => { setSetting('accent', b.dataset.accent || null); renderSection(); }));
  $('#accent-custom', c)?.addEventListener('input', (e) => { setSetting('accent', e.target.value); c.querySelectorAll('.swatch').forEach((x) => x.classList.remove('active')); });
  c.querySelectorAll('[data-override]').forEach((inp) => inp.addEventListener('input', () => {
    const th = S.settings.theme;
    S.settings.overrides = { ...S.settings.overrides, [th]: { ...(S.settings.overrides[th] || {}), [inp.dataset.override]: inp.value } };
    setSetting('overrides', S.settings.overrides);
  }));
  $('#reset-overrides', c)?.addEventListener('click', () => { const o = { ...S.settings.overrides }; delete o[S.settings.theme]; setSetting('overrides', o); renderSection(); });
  $('#export-theme', c)?.addEventListener('click', () => {
    const s = S.settings;
    const data = { theme: s.theme, accent: s.accent, overrides: s.overrides[s.theme] || {}, fontUi: s.fontUi, fontEditor: s.fontEditor, fontMono: s.fontMono, fontSize: s.fontSize, lineHeight: s.lineHeight, radius: s.radius, background: s.background, glass: s.glass, customCss: s.customCss, ...Object.fromEntries(FX_KEYS.map((k) => [k, s[k]])) };
    if (s.customThemes[s.theme]) data.customTheme = s.customThemes[s.theme];
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)); toast('Tema copiado para a área de transferência', 'success');
  });
  $('#import-theme', c)?.addEventListener('click', async () => {
    const txt = await dialog({ title: 'Importar tema', msg: 'Cole o JSON exportado de um tema.', input: '', ok: 'Importar' });
    if (!txt) return;
    try {
      const d = JSON.parse(txt);
      const allowed = ['theme', 'accent', 'fontUi', 'fontEditor', 'fontMono', 'fontSize', 'lineHeight', 'radius', 'background', 'glass', 'customCss', ...FX_KEYS];
      // só aceita valores do mesmo tipo que o padrão (evita configurações quebradas)
      allowed.forEach((k) => { if (d[k] !== undefined && (DEFAULT_SETTINGS[k] === null || typeof d[k] === typeof DEFAULT_SETTINGS[k])) S.settings[k] = d[k]; });
      if (d.customTheme && String(d.theme).startsWith('custom-')) S.settings.customThemes = { ...S.settings.customThemes, [d.theme]: normalizeTheme(d.customTheme) };
      if (!allThemes(S.settings)[S.settings.theme]) S.settings.theme = 'midnight';
      if (d.overrides) S.settings.overrides = { ...S.settings.overrides, [S.settings.theme]: d.overrides };
      setSetting('theme', S.settings.theme); renderSection(); toast('Tema importado', 'success');
    } catch { toast('JSON inválido', 'error'); }
  });
  $('#css-editor', c)?.addEventListener('input', debounce((e) => setSetting('customCss', e.target.value), 250));
  $('#css-editor', c)?.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } });
  $('#set-switch', c)?.addEventListener('click', async () => { await chooseVault(); renderSection(); });
  $('#set-reveal', c)?.addEventListener('click', () => lumen.shell.reveal(''));
  $('#set-backup', c)?.addEventListener('click', backupVault);
  if ($('#trash-count', c)) {
    const upd = async () => { const n = await lumen.vault.trashCount(); const el = $('#trash-count', c); if (el) el.textContent = n ? `${n} ${n > 1 ? 'itens' : 'item'}` : 'vazia'; $('#set-empty-trash', c).disabled = !n; };
    upd();
    $('#set-empty-trash', c).addEventListener('click', async () => {
      if (!await confirmBox('Esvaziar lixeira?', 'Os itens da pasta .lixeira serão apagados de vez. Isso não pode ser desfeito.', 'Esvaziar')) return;
      try { await lumen.vault.emptyTrash(); toast('Lixeira esvaziada', 'success'); } catch (e) { toast(e.message, 'error'); }
      upd();
    });
  }
}

async function chooseVault() {
  const dir = await lumen.vault.choose();
  if (!dir) return;
  await openVault(dir);
  toast(`Cofre “${S.vault.name}” aberto`, 'success');
}

function cycleTheme() {
  const all = allThemes(S.settings), keys = Object.keys(all);
  const next = keys[(keys.indexOf(S.settings.theme) + 1) % keys.length];
  S.settings.accent = null;
  setSetting('theme', next);
  toast(`Tema: ${all[next].name}`);
}

// ---------- Android: compartilhar, backup, textos recebidos ----------
async function shareNote(path = activeNote()?.path) {
  const n = path && S.notes.get(path); if (!n) return toast('Abra uma nota primeiro', 'error');
  await flushSave(n.path);
  lumen.share?.(n.name, n.content);
}
async function backupVault() {
  await flushAll();
  try { const r = await lumen.vault.backup(); toast(`Backup pronto: ${r.files} arquivos`, 'success'); } catch (e) { toast('Não foi possível criar o backup: ' + e.message, 'error'); }
}
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
async function handleIntent(it) {
  if (!it || !S.vault) return;
  if (it.type === 'new') return createNote({});
  if (it.type === 'daily') return dailyNote();
  if (it.type === 'search') return showLeftPanel('search');
  if (it.type === 'error') return toast('Não foi possível abrir: ' + it.message, 'error', 5000);
  // arquivo .md/.txt enviado por "Compartilhar" (como anexo): importa com o nome dele
  if (it.type === 'share' && it.name && /\.(md|markdown|txt)$/i.test(it.name)) it = { ...it, type: 'file' };
  const text = String(it.text || '').replace(/\r\n?/g, '\n');
  if (it.type === 'file') {
    const name = safeName(String(it.name || '').replace(/\.(md|markdown|txt)$/i, '')) || 'Nota importada';
    const same = [...S.notes.values()].find((n) => n.content === text);
    if (same) { openNote(same.path, { mode: 'preview' }); return toast('Essa nota já está no cofre'); }
    const rel = await createNote({ name, content: text, focusTitle: false });
    if (rel) toast('Nota importada para o cofre', 'success');
    return;
  }
  if (it.type === 'share') {
    const t = text.trim();
    if (!t) return;
    const url = /^https?:\/\/\S+$/.test(t) ? t : null;
    const subject = safeName(it.subject);
    let name = subject;
    if (!name && url) { try { name = 'Link ' + new URL(url).hostname.replace(/^www\./, ''); } catch { name = 'Link'; } }
    if (!name) name = safeName(t.split('\n').find((l) => l.trim()).replace(/^[#>*\-\s]+/, '').slice(0, 60));
    const content = url ? `[${subject || url}](${url})\n` : t + '\n';
    const rel = await createNote({ name: name || 'Compartilhado', content, focusTitle: false });
    if (rel) toast('Nota criada a partir do compartilhamento', 'success');
  }
}

// ---------- exportação ----------
function collectCss() {
  let css = '';
  for (const sh of document.styleSheets) {
    try { if (sh.href && sh.href.includes('content.css')) css += [...sh.cssRules].map((r) => r.cssText).join('\n'); } catch { /* bloqueado */ }
  }
  const cs = getComputedStyle(document.documentElement);
  const vars = ['--bg', '--bg-3', '--border', '--text', '--text-muted', '--text-faint', '--code-bg', '--accent', '--accent-soft', '--accent-softer', '--hover', '--font-editor', '--font-mono', '--font-size', '--line-height', '--radius', '--radius-sm'].map((v) => `${v}:${cs.getPropertyValue(v)}`).join(';');
  const extra = ['--heading', '--link', '--tag', '--highlight'].map((v) => [v, cs.getPropertyValue(v).trim()]).filter(([, x]) => x).map(([v, x]) => `${v}:${x}`).join(';');
  return `:root{${vars};${extra};color-scheme:${document.documentElement.dataset.mode || 'dark'}} body{margin:0;background:var(--bg);color:var(--text)} .wrap{max-width:780px;margin:0 auto;padding:48px 24px} ${css}`;
}
async function exportHtml() {
  const n = activeNote(); if (!n) return toast('Abra uma nota primeiro', 'error');
  const frag = MD.render(n.content);
  frag.querySelectorAll('.copy-code').forEach((b) => b.remove());
  const body = frag.innerHTML;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.name)}</title><style>${collectCss()}</style></head><body><div class="wrap">${startsWithOwnTitle(n) ? '' : `<h1 class="note-title-static">${esc(n.name)}</h1>`}<article class="markdown">${body}</article></div></body></html>`;
  const out = await lumen.fs.exportHtml(n.name + '.html', html).catch((e) => toast(e.message, 'error'));
  if (out) toast('Exportado: ' + out, 'success', 4000);
}
async function exportPdf() {
  const n = activeNote(); if (!n) return toast('Abra uma nota primeiro', 'error');
  const root = $('#print-root');
  root.innerHTML = startsWithOwnTitle(n) ? '' : `<h1 class="print-title">${esc(n.name)}</h1>`;
  const art = document.createElement('article'); art.className = 'markdown';
  art.append(...MD.render(n.content).childNodes);
  root.appendChild(art);
  try {
    const out = await lumen.fs.exportPdf(n.name + '.pdf');
    if (out) toast('PDF salvo: ' + out, 'success', 4000);
  } catch (e) { toast(e.message, 'error'); }
  root.innerHTML = '';
}

// ---------- layout ----------
function applyLayout() {
  const s = S.settings;
  const app = $('#app');
  app.classList.toggle('left-closed', !s.leftOpen);
  app.classList.toggle('right-closed', !s.rightOpen);
  $('#btn-toggle-left').classList.toggle('on', s.leftOpen);
  $('#btn-toggle-right').classList.toggle('on', s.rightOpen);
  showLeftPanel(s.leftPanel, true);
  updateBackdrop();
}
function updateBackdrop() {
  const w = window.innerWidth;
  const overlayOpen = (w <= 1100 && S.settings.rightOpen) || (w <= 760 && S.settings.leftOpen);
  $('#drawer-backdrop').classList.toggle('show', overlayOpen);
}
function closeDrawersIfOverlay() {
  const w = window.innerWidth;
  let changed = false;
  if (w <= 760 && S.settings.leftOpen) { S.settings.leftOpen = false; changed = true; }
  if (w <= 1100 && S.settings.rightOpen) { S.settings.rightOpen = false; changed = true; }
  if (changed) { applyLayout(); saveSettings(); }
}
function toggleSide(side) {
  const k = side === 'left' ? 'leftOpen' : 'rightOpen';
  S.settings[k] = !S.settings[k];
  // em telas estreitas, só um painel por vez
  if (window.innerWidth <= 760 && S.settings[k]) S.settings[side === 'left' ? 'rightOpen' : 'leftOpen'] = false;
  applyLayout(); saveSettings();
  setTimeout(() => S.graph?.resize(), 300);
}
function showLeftPanel(p, silent) {
  S.settings.leftPanel = p;
  $$('.ribbon .rb-btn[data-panel]').forEach((b) => b.classList.toggle('active', b.dataset.panel === p));
  $$('#sidebar-left .panel').forEach((el) => { el.hidden = el.dataset.panel !== p; });
  if (!silent) {
    if (!S.settings.leftOpen) { S.settings.leftOpen = true; applyLayout(); }
    saveSettings();
  }
  // só foca a busca quando o usuário abre o painel (não a cada atualização do layout)
  if (p === 'search') { runSearch(); if (!silent) setTimeout(() => $('#search-input').focus(), 20); }
  if (p === 'tags') renderTags();
}
function toggleMode() {
  const t = activeTab(); if (t?.kind !== 'note') return;
  setMode(t.mode === 'preview' ? 'edit' : 'preview');
}
function toggleZen() {
  $('#app').classList.toggle('zen');
  lumen.win.fullscreen();
}

function bindResizers() {
  $$('.resizer').forEach((r) => {
    r.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      r.setPointerCapture(e.pointerId); r.classList.add('dragging');
      const side = r.dataset.side;
      const startX = e.clientX, startW = side === 'left' ? S.settings.leftWidth : S.settings.rightWidth;
      const move = (ev) => {
        const dx = ev.clientX - startX;
        const w = Math.max(190, Math.min(560, startW + (side === 'left' ? dx : -dx)));
        S.settings[side === 'left' ? 'leftWidth' : 'rightWidth'] = w;
        document.documentElement.style.setProperty(side === 'left' ? '--left-width' : '--right-width', w + 'px');
      };
      const up = () => { r.classList.remove('dragging'); r.removeEventListener('pointermove', move); r.removeEventListener('pointerup', up); saveSettings(); S.graph?.resize(); };
      r.addEventListener('pointermove', move); r.addEventListener('pointerup', up);
    });
    r.addEventListener('dblclick', () => { const k = r.dataset.side === 'left' ? 'leftWidth' : 'rightWidth'; setSetting(k, k === 'leftWidth' ? 270 : 280); });
  });
}

function updateStatus() {
  const n = activeNote();
  $('#st-words').textContent = n ? `${n.words.toLocaleString('pt-BR')} palavras` : '';
  $('#st-chars').textContent = n ? `${n.content.length.toLocaleString('pt-BR')} caracteres` : '';
  if (!n) $('#st-cursor').textContent = '';
  $('#st-theme').innerHTML = `<span class="swatch-dot"></span>${esc(themeOf(S.settings).name || '')}`;
  if (n) S.lastNote = n.path;
}
const wordsSoon = debounce(() => { const n = activeNote(); if (n) { n.words = MD.analyze(n.content).words; updateStatus(); } }, 300);

// ---------- eventos globais ----------
let editor;
function bindUI() {
  editor = new MarkdownEditor($('#editor'), {
    onChange: (v) => { onEdit(v); wordsSoon(); },
    onCursor: ({ line, col, sel }) => { $('#st-cursor').textContent = `Ln ${line}, Col ${col}${sel ? ` (${sel} sel.)` : ''}`; },
    suggest: (q) => {
      const ql = q.toLowerCase().trim();
      const cur = activeTab()?.path;
      const res = [...S.notes.values()].filter((n) => n.path !== cur).map((n) => ({ n, f: fuzzy(ql, n.name) })).filter((x) => x.f).sort((a, b) => b.f.score - a.f.score || b.n.mtime - a.n.mtime).slice(0, 8)
        .map(({ n }) => ({ label: n.name, sub: n.folder, insert: (S.names.get(n.name.toLowerCase())?.length > 1 ? n.path.replace(/\.md$/i, '') : n.name) }));
      if (ql && !S.names.has(ql)) res.push({ label: `Criar “${q.trim()}”`, insert: q.trim(), create: true });
      return res;
    },
    onPasteFiles: pasteImages,
    getSettings: () => S.settings,
  });
  editor.ta.spellcheck = S.settings.spellcheck;

  // título
  const title = $('#note-title');
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); editor.ta.focus(); editor.ta.setSelectionRange(0, 0); }
    if (e.key === 'Escape') { title.value = activeNote()?.name || ''; editor.ta.focus(); }
  });
  title.addEventListener('blur', renameActiveTitle);

  // modos
  $$('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // preview: links, tarefas, código
  const pv = $('#preview');
  pv.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) {
      e.preventDefault();
      if (a.classList.contains('wikilink')) {
        const target = a.dataset.target;
        const r = resolveLink(target, activeTab()?.path);
        if (r) openNote(r, { newTab: e.ctrlKey || e.metaKey, heading: a.dataset.heading || null });
        else openOrCreateByName(target, { newTab: e.ctrlKey });
      } else if (a.classList.contains('tag')) searchTag(a.dataset.tag);
      else if (a.dataset.external) lumen.shell.external(a.getAttribute('href'));
      else if (a.getAttribute('href')?.startsWith('#')) scrollToHeading(a.getAttribute('href').slice(1));
      else if (a.getAttribute('href')) openOrCreateByName(decodeURIComponent(a.getAttribute('href')));
      return;
    }
    const cp = e.target.closest('.copy-code');
    if (cp) { navigator.clipboard.writeText(cp.closest('.code-block').querySelector('code').textContent); cp.textContent = 'Copiado!'; setTimeout(() => { cp.textContent = 'Copiar'; }, 1200); return; }
    const ct = e.target.closest('.callout-title');
    if (ct) ct.parentElement.classList.toggle('collapsed');
  });
  pv.addEventListener('change', (e) => { if (e.target.matches('input[data-task]')) toggleTask(Number(e.target.dataset.task)); });
  $('#preview-pane').addEventListener('dblclick', (e) => { if (activeTab()?.mode === 'preview' && !e.target.closest('a,input,button')) setMode('edit'); });

  // rolagem sincronizada no modo dividido
  let syncing = false;
  const sync = (from, to) => from.addEventListener('scroll', () => {
    if (activeTab()?.mode !== 'split' || syncing) return;
    syncing = true;
    const ratio = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
    to.scrollTop = ratio * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => { syncing = false; });
  });
  sync($('#editor-pane'), $('#preview-pane'));
  sync($('#preview-pane'), $('#editor-pane'));
  // clicar na área vazia do editor foca o texto
  $('#editor-pane').addEventListener('mousedown', (e) => {
    if (e.target.id === 'editor-pane' || e.target.classList.contains('doc')) { e.preventDefault(); editor.ta.focus(); const l = editor.ta.value.length; editor.ta.setSelectionRange(l, l); }
  });

  // botões
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    if (b.dataset.cmd === 'palette') openPalette();
    else COMMANDS.find((c) => c.id === b.dataset.cmd)?.run();
  });
  $$('.ribbon [data-panel]').forEach((b) => b.addEventListener('click', () => {
    if (S.settings.leftPanel === b.dataset.panel && S.settings.leftOpen) toggleSide('left');
    else showLeftPanel(b.dataset.panel);
  }));
  $('#btn-toggle-left').addEventListener('click', () => toggleSide('left'));
  $('#btn-toggle-right').addEventListener('click', () => toggleSide('right'));
  $('#btn-new-tab').addEventListener('click', () => createNote({ newTab: true }));
  $('#btn-new-note').addEventListener('click', () => createNote());
  $('#btn-new-folder').addEventListener('click', () => newFolder(''));
  $('#btn-sort').addEventListener('click', (e) => showMenu(e.clientX, e.clientY + 10, [
    { label: 'Nome (A–Z)', icon: S.settings.sort === 'name' ? 'check' : 'dot', run: () => { S.settings.sort = 'name'; saveSettings(); renderTree(); } },
    { label: 'Modificação recente', icon: S.settings.sort === 'mtime' ? 'check' : 'dot', run: () => { S.settings.sort = 'mtime'; saveSettings(); renderTree(); } },
  ]));
  $('#btn-collapse').addEventListener('click', () => { S.settings.expanded = []; saveSettings(); renderTree(); });
  $('#vault-name').addEventListener('click', chooseVault);
  $('#drawer-backdrop').addEventListener('click', () => {
    if (window.innerWidth <= 760) S.settings.leftOpen = false;
    S.settings.rightOpen = false;
    applyLayout(); saveSettings();
  });
  $('#st-theme').addEventListener('click', cycleTheme);

  // painel direito
  $('#right-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-rpanel]'); if (b) { S.settings.rightPanel = b.dataset.rpanel; saveSettings(); renderRight(); } });
  $('#outline').addEventListener('click', (e) => { const b = e.target.closest('.outline-item'); if (b) scrollToHeading(b.dataset.id); });
  $('#sidebar-right').addEventListener('click', (e) => {
    const bl = e.target.closest('.bl-item');
    if (bl?.dataset.path) openNote(bl.dataset.path, { newTab: e.ctrlKey });
    else if (bl?.dataset.target) openOrCreateByName(bl.dataset.target);
    const tg = e.target.closest('.tag-chip'); if (tg) searchTag(tg.dataset.tag);
  });

  // busca/tags/recentes
  $('#search-input').addEventListener('input', debounce(runSearch, 120));
  $('#search-results').addEventListener('click', (e) => {
    const el = e.target.closest('[data-path]'); if (!el) return;
    openNote(el.dataset.path, { newTab: e.ctrlKey });
    if (el.dataset.pos) setTimeout(() => {
      const t = activeTab();
      if (t.mode === 'preview') setMode('edit');
      const pos = Number(el.dataset.pos);
      const q = $('#search-input').value.trim();
      editor.ta.focus(); editor.ta.setSelectionRange(pos, pos + q.length);
      editor.scrollToLine(editor.ta.value.slice(0, pos).split('\n').length - 1);
      editor.ta.setSelectionRange(pos, pos + q.length);
    }, 80);
  });
  $('#tag-list').addEventListener('click', (e) => { const t = e.target.closest('.tag-chip'); if (t) searchTag(t.dataset.tag); });
  $('#recent-list').addEventListener('click', (e) => { const r = e.target.closest('[data-path]'); if (r) openNote(r.dataset.path); });

  // grafo
  ['tags', 'orphans', 'ghosts', 'labels'].forEach((k) => $('#g-' + k).addEventListener('change', (e) => { S.settings.graph = { ...S.settings.graph, [k]: e.target.checked }; saveSettings(); updateGraph(); }));
  $('#graph-filter').addEventListener('input', (e) => { if (S.graph) S.graph.filter = e.target.value; });
  $('#g-center').addEventListener('click', () => S.graph?.center());

  // configurações
  $('#settings-nav').addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) { curSection = b.dataset.sec; openSettings(); } });
  $('#settings-close').addEventListener('click', closeSettings);
  $('#settings').addEventListener('mousedown', (e) => { if (e.target.id === 'settings') closeSettings(); });

  // janela
  $('#win-min').addEventListener('click', () => lumen.win.minimize());
  $('#win-max').addEventListener('click', () => lumen.win.maximize());
  $('#win-close').addEventListener('click', () => lumen.win.close());
  $('.titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('button,.tab')) lumen.win.maximize(); });
  lumen.win.onState(({ maximized, minimized }) => {
    $('#win-max').innerHTML = icon(maximized ? 'squares' : 'square', 14);
    S.fx?.setMinimized(!!minimized);
  });

  let lastW = window.innerWidth;
  window.addEventListener('resize', debounce(() => {
    const w = window.innerWidth;
    // ao estreitar a janela além dos pontos de quebra, recolhe os painéis que virariam gavetas
    if (w <= 1100 && lastW > 1100) S.settings.rightOpen = false;
    if (w <= 760 && lastW > 760) S.settings.leftOpen = false;
    if (w > 760 && lastW <= 760) S.settings.leftOpen = true;
    lastW = w;
    applyLayout(); editor.autosize();
    $('#tabs .tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, 100));
  bindTabs(); bindTree(); bindPalette(); bindResizers();
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (!$('#palette').hidden) return closePalette();
      if (!$('#settings').hidden) return closeSettings();
      if (!$('#ctx-menu').hidden) { $('#ctx-menu').hidden = true; return; }
      if ($('#app').classList.contains('zen')) return toggleZen();
    }
    if (e.key === 'F11') { e.preventDefault(); return toggleZen(); }
    if (!mod) return;
    const inEditor = document.activeElement === editor.ta;
    const act = (fn) => { e.preventDefault(); fn(); };
    if (k === 'n' && !e.shiftKey) return act(() => createNote({ newTab: true }));
    if (k === 'p' && e.shiftKey) return act(() => openPalette('>'));
    if ((k === 'p' || k === 'o') && !e.shiftKey) return act(() => openPalette());
    if (k === 'f' && e.shiftKey) return act(() => showLeftPanel('search'));
    if (k === 'e' && !e.shiftKey) return act(toggleMode);
    if (e.key === '\\') return act(() => setMode(activeTab()?.mode === 'split' ? 'edit' : 'split'));
    if (k === 'g' && !e.shiftKey) return act(() => addTab({ kind: 'graph' }));
    if (k === 'd' && e.shiftKey) return act(dailyNote);
    if (e.key === ',') return act(() => openSettings());
    if (k === 'w') return act(() => { if (S.active) closeTab(S.active); });
    if (k === 's') return act(async () => { await flushAll(); setSaveStatus('saved'); toast('Tudo salvo', 'success', 1200); });
    if (e.key === 'Tab' && S.tabs.length) return act(() => {
      const i = S.tabs.findIndex((t) => t.id === S.active);
      activateTab(S.tabs[(i + (e.shiftKey ? -1 : 1) + S.tabs.length) % S.tabs.length].id);
    });
    if (e.key === '=' || e.key === '+') return act(() => setSetting('fontSize', Math.min(26, S.settings.fontSize + 1)));
    if (e.key === '-') return act(() => setSetting('fontSize', Math.max(11, S.settings.fontSize - 1)));
    if (e.key === '0') return act(() => setSetting('fontSize', 16));
    if (k === 'b' && !inEditor && !e.shiftKey) return act(() => toggleSide('left'));
  });

  // nunca perder alterações ao fechar
  window.addEventListener('beforeunload', (e) => {
    if (S.pending.size) {
      e.preventDefault(); e.returnValue = false;
      flushAll().then(() => lumen.win.close());
    }
  });
}

// ---------- inicialização ----------
async function init() {
  document.documentElement.classList.add('platform-' + (lumen.platform || 'desktop'));
  hydrateIcons();
  let saved = {};
  try { saved = await lumen.settings.get(); } catch { /* primeira execução */ }
  S.settings = merge(DEFAULT_SETTINGS, saved);
  if (window.innerWidth <= 760) S.settings.leftOpen = false;
  if (window.innerWidth <= 1100) S.settings.rightOpen = false;
  applyAppearance(S.settings);
  S.fx = new Effects($('#fx-bg'), $('#fx-cursor'));
  applyEffects();
  bindUI();
  bindKeys();
  applyLayout();
  setSaveStatus('saved');
  updateStatus();
  try {
    await openVault(S.settings.vaultPath);
  } catch (err) {
    toast('Não foi possível abrir o cofre: ' + err.message, 'error', 6000);
    await openVault(null);
  }
  lumen.vault.onChange(debounce(refreshVault, 200));
  lumen.onIntent?.((it) => handleIntent(it).catch((e) => toast(e.message, 'error')));
  // app indo para o fundo (celular: trocar de app, bloquear a tela): salva já o que estiver pendente
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });
  $('#app').style.opacity = 1;
}

init();
