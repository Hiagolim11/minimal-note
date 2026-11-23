// Minimal Note — grafo e paleta de comandos.
// Scripts comuns (sem módulos): compartilham o escopo global e são carregados em ordem pelo index.html.

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
  { id: 'find', name: 'Localizar na nota', icon: 'search', key: 'Ctrl F', run: () => window.__lumenFind?.open() },
  { id: 'replace', name: 'Substituir na nota', icon: 'search', key: 'Ctrl H', run: () => window.__lumenFind?.open(true) },
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
