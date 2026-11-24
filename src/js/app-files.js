// Minimal Note — operações de arquivos, árvore, busca, tags, painel direito e tela inicial.
// Scripts comuns (sem módulos): compartilham o escopo global e são carregados em ordem pelo index.html.

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
  const tpl = typeof Templates !== 'undefined' && Templates.dailyTemplate();
  if (tpl) {
    const { text, cursor } = Templates.apply(tpl.content, { title: ymd, date: d });
    const rel = await createNote({ folder: S.settings.dailyFolder, name: ymd, content: text, focusTitle: false });
    if (rel && cursor >= 0) setTimeout(() => { editor.ta.focus(); editor.ta.setSelectionRange(cursor, cursor); }, 120);
    return;
  }
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
    // links que apontam para as notas movidas, resolvidos com o índice ANTIGO (antes de mover):
    // comparar só o nome reescrevia links de outra nota homônima e quebrava links com caminho
    const movedMap = new Map();
    for (const p of S.notes.keys()) { const np = moved(p); if (np) movedMap.set(p, np); }
    const linkRewrites = [];
    for (const n of S.notes.values()) {
      if (!n.links.some((l) => movedMap.has(resolveLink(l, n.path)))) continue;
      const nc = n.content.replace(/(!?\[\[)([^\]\n|#]+)(?=[\]|#])/g, (m, open, raw) => {
        const target = raw.trim(), np = movedMap.get(resolveLink(target, n.path));
        if (!np) return m;
        const ext = /\.(md|markdown|txt)$/i.test(target) ? np.slice(np.lastIndexOf('.')) : '';
        const repl = (target.includes('/') ? np.replace(/\.(md|markdown|txt)$/i, '') : baseName(np)) + ext;
        return repl === target ? m : open + repl;
      });
      if (nc !== n.content) linkRewrites.push([n, nc]);
    }
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
    // aplica os [[links]] atualizados (n.path já é o caminho novo, se a nota foi movida)
    for (const [n, nc] of linkRewrites) { n.content = nc; Object.assign(n, MD.analyze(nc)); n.version++; scheduleSave(n.path); }
    const updated = linkRewrites.length;
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
    const where = await lumen.fs.remove(path);
    await refreshVault();
    toast(where === 'vault' ? 'Movido para a pasta .lixeira do cofre (sem lixeira do sistema neste local)' : 'Movido para a lixeira', 'success', where === 'vault' ? 4000 : 2500);
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
        { label: 'Proteger pasta com senha', icon: 'vault', run: () => Protect.protectFolder(path) },
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
        Protect.isProtected(path) ? { label: 'Remover senha', icon: 'vault', run: () => Protect.removeProtection(path) } : { label: 'Proteger com senha', icon: 'vault', run: () => Protect.protectNote(path) },
        { label: 'Versões anteriores', icon: 'refresh', run: () => History.open(path) },
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
  if (!raw) {
    out.innerHTML = '';
    meta.innerHTML = `Busca em títulos e conteúdo, aceita erros de digitação. Filtros:
      <div class="search-chips">${[['tarefa:pendente', 'Tarefas pendentes'], ['editada:hoje', 'Editadas hoje'], ['editada:semana', 'Editadas esta semana'], ['criada:mês', 'Criadas no mês'], ['#', 'Por tag…'], ['pasta:', 'Por pasta…'], ['"', 'Frase exata…'], ['-', 'Excluir palavra…']]
        .map(([q, l]) => `<button class="chip sm" data-q="${esc(q)}">${esc(l)}</button>`).join('')}</div>`;
    return;
  }
  const { results, total, query } = SmartSearch.run([...S.notes.values()], raw);
  const filters = [...query.tags.map((t) => '#' + t), ...query.folders.map((f) => 'pasta ' + f), query.task && (query.task === 'open' ? 'tarefas pendentes' : query.task === 'done' ? 'tarefas feitas' : 'tarefas'), query.edited && 'editada ' + query.edited, query.created && 'criada ' + query.created].filter(Boolean);
  meta.textContent = `${total} nota(s)` + (filters.length ? ' · ' + filters.join(' · ') : '');
  const markHtml = (text, marks) => { let o = '', last = 0; for (const [a, b] of marks) { if (a < last) continue; o += esc(text.slice(last, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; last = b; } return o + esc(text.slice(last)); };
  out.innerHTML = results.slice(0, 80).map(({ note: n, marks, tasks }) => {
    let hits = '';
    if (tasks) hits = tasks.slice(0, 5).map((t) => { const pos = n.content.split('\n').slice(0, t.line).join('\n').length + (t.line ? 1 : 0); return `<div class="sr-hit" data-path="${esc(n.path)}" data-pos="${pos}">${esc(t.text)}</div>`; }).join('');
    else hits = SmartSearch.snippets(n.content, marks).map((h) => `<div class="sr-hit" data-path="${esc(n.path)}" data-pos="${h.pos}">${markHtml(h.text, h.marks)}</div>`).join('');
    const folder = n.folder ? `<span class="sr-folder">${esc(n.folder)}</span>` : '';
    return `<div class="sr-file"><div class="sr-name" data-path="${esc(n.path)}">${icon('note', 15)}<span>${esc(n.name)}</span>${folder}</div>${hits}</div>`;
  }).join('') || '<div class="rp-empty">Nada encontrado. Tente menos palavras ou outro filtro.</div>';
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
    if (typeof LinkSuggest !== 'undefined') LinkSuggest.render(note);
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
