// Minimal Note — layout, eventos globais e inicialização.
// Scripts comuns (sem módulos): compartilham o escopo global e são carregados em ordem pelo index.html.

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
  window.__lumenSpell?.sync();

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
