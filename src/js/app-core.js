// ===== Minimal Note — lógica principal do app: utilidades, configurações, efeitos, índice do cofre e salvamento =====
// O app é dividido em app-core, app-tabs, app-files, app-palette, app-settings e app.js (scripts comuns, escopo global compartilhado, nessa ordem).
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
    // manda o mtime de cada nota que já temos: só as alteradas voltam com conteúdo (Android ignora e manda tudo)
    const known = {};
    for (const n of S.notes.values()) known[n.path] = n.mtime;
    const [tree, all] = await Promise.all([lumen.fs.tree(), lumen.fs.readAll(known)]);
    S.tree = tree;
    const seen = new Set();
    for (const f of all) {
      seen.add(f.path);
      const cur = S.notes.get(f.path);
      if (f.content === undefined) continue; // inalterada desde a última leitura
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
// salvamentos da mesma nota em fila: dois em paralelo podiam terminar fora de ordem e deixar
// no disco o texto antigo enquanto a interface mostrava "Salvo"
const saving = new Map(); // caminho -> promessa do último salvamento
function saveNote(path) {
  const run = (saving.get(path) || Promise.resolve()).then(() => writeNote(path));
  saving.set(path, run);
  run.finally(() => { if (saving.get(path) === run) saving.delete(path); });
  return run;
}
async function writeNote(path) {
  clearTimeout(S.timers.get(path));
  if (!S.pending.has(path)) return; // um salvamento anterior da fila já gravou a versão atual
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
    // tenta de novo sozinho: sem isso a alteração só seria salva na próxima digitação
    if (S.notes.has(path)) S.timers.set(path, setTimeout(() => saveNote(path), 5000));
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
