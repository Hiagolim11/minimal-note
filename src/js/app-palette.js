// Minimal Note — grafo e paleta de comandos.
// Scripts comuns (sem módulos): compartilham o escopo global e são carregados em ordem pelo index.html.

// ---------- grafo ----------
function updateGraph() {
  const g = S.settings.graph;
  ['tags', 'orphans', 'ghosts', 'labels'].forEach((k) => { $('#g-' + k).checked = !!g[k]; });
  // estilo: rede de forças (GraphView) ou cérebro 2D/3D (BrainView); trocar de estilo troca a visualização
  const style = ['net', 'brain2d', 'brain3d'].includes(g.style) ? g.style : 'brain2d';
  $$('#g-style button').forEach((b) => b.classList.toggle('active', b.dataset.style === style));
  $('#graph-view').classList.toggle('brain', style !== 'net');
  const wantBrain = style !== 'net', mode = style === 'brain3d' ? '3d' : '2d';
  if (S.graph && (S.graph instanceof BrainView) !== wantBrain) { S.graph.destroy(); S.graph = null; }
  if (!S.graph) {
    const opts = {
      getActive: () => S.lastNote,
      mode,
      onOpen: (n, e) => {
        if (n.kind === 'note') openNote(n.id, { newTab: true });
        else if (n.kind === 'ghost') openOrCreateByName(n.label, { newTab: true });
        else if (n.kind === 'tag') searchTag(n.label.slice(1));
      },
    };
    S.graph = wantBrain ? new BrainView($('#graph-canvas'), opts) : new GraphView($('#graph-canvas'), opts);
    S.graph.filter = $('#graph-filter').value;
  } else if (wantBrain) S.graph.setMode(mode);
  if (wantBrain) {
    S.graph.groupBy = g.lobes === 'tag' ? 'tag' : 'folder'; S.graph.focusMode = !!g.focus;
    $('#g-lobes').value = S.graph.groupBy; $('#g-focus').checked = !!g.focus;
  }
  const nodes = [], edges = [], ids = new Set();
  const deg = new Map();
  // notas da pasta de modelos não entram no grafo (não são notas de verdade)
  const tplDir = (S.settings.templatesFolder || 'Modelos') + '/';
  const graphNotes = [...S.notes.values()].filter((n) => !n.path.startsWith(tplDir));
  const isTpl = (id) => typeof id === 'string' && id.startsWith(tplDir);
  for (const n of graphNotes) {
    for (const l of n.links) {
      const r = resolveLink(l, n.path);
      const id = r || (g.ghosts ? 'ghost:' + l.toLowerCase() : null);
      if (!id || isTpl(id)) continue;
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
  for (const n of graphNotes) {
    if (!g.orphans && !deg.get(n.path)) continue;
    nodes.push({ id: n.path, label: n.name, kind: 'note', ctime: n.ctime, tags: n.tags });
  }
  S.graph.showLabels = g.labels;
  S.graph.readColors();
  S.graph.setData({ nodes, edges });
  requestAnimationFrame(() => S.graph.resize());
  $('#graph-stats').textContent = `${graphNotes.length} notas · ${edges.length} conexões`;
}

// ---------- paleta de comandos ----------
const COMMANDS = [
  { id: 'new-note', name: 'Nova nota', icon: 'notePlus', key: 'Ctrl N', run: () => createNote() },
  { id: 'new-from-template', name: 'Nova nota a partir de modelo', icon: 'copy', key: 'Ctrl Shift N', run: () => Templates.newFromTemplate() },
  { id: 'tasks', name: 'Abrir tarefas', icon: 'check', run: () => showLeftPanel('tasks') },
  { id: 'task-date', name: 'Pôr data na tarefa', icon: 'calendar', run: () => Tasks.addDateToCurrent() },
  ...(IS_ANDROID ? [] : [{ id: 'capture', name: 'Captura rápida', icon: 'notePlus', key: 'Ctrl Alt N', run: () => lumen.capture.open() }]),
  { id: 'table-insert', name: 'Inserir tabela', icon: 'columns', run: () => insertTable() },
  { id: 'table-format', name: 'Alinhar tabela', icon: 'columns', run: () => formatTable() },
  { id: 'math-insert', name: 'Inserir fórmula ($$ $$)', icon: 'code', run: () => insertSnippet('\n$$\nE = mc^2\n$$\n', 4, 12) },
  { id: 'diagram-insert', name: 'Inserir diagrama (Mermaid)', icon: 'graph', run: () => insertSnippet('\n```mermaid\nflowchart LR\n  A[Ideia] --> B[Rascunho] --> C[Pronto]\n```\n', 25, 65) },
  { id: 'protect', name: 'Proteger nota com senha', icon: 'vault', run: () => Protect.protectNote() },
  { id: 'history', name: 'Versões anteriores da nota', icon: 'refresh', run: () => History.open() },
  { id: 'updates', name: 'Procurar atualizações', icon: 'download', run: () => Updates.check({ manual: true }) },
  { id: 'unprotect', name: 'Remover senha da nota', icon: 'vault', run: () => Protect.removeProtection() },
  { id: 'lock-all', name: 'Bloquear notas protegidas agora', icon: 'vault', run: async () => { const n = await Protect.lockAll(); toast(n ? `${n} nota(s) bloqueada(s)` : 'Nenhuma nota protegida aberta'); } },
  { id: 'new-folder', name: 'Nova pasta', icon: 'folderPlus', run: () => newFolder('') },
  { id: 'daily', name: 'Abrir nota diária', icon: 'calendar', key: 'Ctrl Shift D', run: dailyNote },
  { id: 'graph', name: 'Abrir grafo', icon: 'graph', key: 'Ctrl G', run: () => addTab({ kind: 'graph' }) },
  { id: 'search', name: 'Buscar no cofre', icon: 'search', key: 'Ctrl Shift F', run: () => { showLeftPanel('search'); $('#search-input').focus(); } },
  { id: 'find', name: 'Localizar na nota', icon: 'search', key: 'Ctrl F', run: () => window.__lumenFind?.open() },
  { id: 'replace', name: 'Substituir na nota', icon: 'search', key: 'Ctrl H', run: () => window.__lumenFind?.open(true) },
  { id: 'review', name: 'Revisar gramática e pontuação (LanguageTool)', icon: 'check', key: 'F7', run: () => window.__lumenReview?.run() },
  { id: 'spell-toggle', name: 'Ligar/desligar corretor ortográfico', icon: 'type', run: () => { setSetting('spellcheck', !S.settings.spellcheck); window.__lumenSpell?.sync(); toast(S.settings.spellcheck ? 'Corretor ligado' : 'Corretor desligado'); } },
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
// insere um trecho no cursor e seleciona [selA, selB) dentro dele
function insertSnippet(text, selA, selB) {
  if (!activeNote()) { toast('Abra uma nota primeiro'); return; }
  if (activeTab().mode === 'preview') setMode('edit');
  const p = editor.ta.selectionStart;
  editor.replace(p, editor.ta.selectionEnd, text, p + selA, p + selB);
}
const themeCommands = () => Object.entries(allThemes(S.settings)).map(([k, t]) => ({ id: 'theme-' + k, name: `Tema: ${t.name}`, icon: 'palette', run: () => { S.settings.accent = null; setSetting('theme', k); } }));

const PAL = { items: [], sel: 0, source: null };
// source (opcional): (consulta) => [{ html, run }] — usado por outros recursos (ex.: modelos)
function openPalette(prefix = '', source = null, placeholder = '') {
  $('#palette').hidden = false;
  const inp = $('#palette-input');
  PAL.source = source;
  inp.placeholder = placeholder || inp.dataset.placeholder || (inp.dataset.placeholder = inp.placeholder);
  inp.value = prefix;
  renderPalette();
  setTimeout(() => inp.focus(), 10);
}
function closePalette() { $('#palette').hidden = true; PAL.source = null; }
function renderPalette() {
  const raw = $('#palette-input').value;
  const list = $('#palette-list');
  let html = '';
  PAL.items = []; PAL.sel = 0;
  if (PAL.source) {
    PAL.items = PAL.source(raw.trim());
  } else if (raw.startsWith('>')) {
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
      if (e.shiftKey && !inp.value.startsWith('>') && !PAL.source) { const q = inp.value.trim(); if (q) { closePalette(); openOrCreateByName(cleanName(q)); } return; }
      runPalette(PAL.sel, e);
    } else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  $('#palette-list').addEventListener('click', (e) => { const it = e.target.closest('.pl-item'); if (it) runPalette(Number(it.dataset.i), e); });
  $('#palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') closePalette(); });
}
