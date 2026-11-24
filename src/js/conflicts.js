// ---------- Conflitos de sincronização ----------
// Syncthing, Dropbox e Nextcloud criam cópias quando a mesma nota muda em dois aparelhos:
//   Nota.sync-conflict-20261124-101500-ABC1234.md · Nota (conflicted copy 2026-11-24).md
//   Nota (Cópia em conflito de PC 2026-11-24).md
// Ao abrir a nota original, uma faixa avisa e "Resolver" deixa usar ou descartar cada cópia.
// Usar uma cópia guarda antes a versão atual no histórico; descartar manda a cópia para a lixeira.
/* global S, lumen, activeNote, refreshVault, flushSave, openPalette, dialog, toast, esc, icon, History */
const Conflicts = (() => {
  const RULES = [
    // Syncthing: <nome>.sync-conflict-AAAAMMDD-HHMMSS-<aparelho>.<ext>
    { tool: 'Syncthing', re: /^(.*)\.sync-conflict-(\d{8})-(\d{6})-[A-Za-z0-9]+(\.[^.]+)$/, orig: (m) => m[1] + m[4], when: (m) => `${m[2].slice(6, 8)}/${m[2].slice(4, 6)} ${m[3].slice(0, 2)}:${m[3].slice(2, 4)}` },
    // Dropbox / Nextcloud (inglês): <nome> (... conflicted copy ...).<ext>
    { tool: 'Dropbox/Nextcloud', re: /^(.*?) \([^)]*conflicted copy[^)]*\)(\.[^.]+)$/i, orig: (m) => m[1] + m[2] },
    // Dropbox (português): <nome> (Cópia em conflito de ...).<ext>
    { tool: 'Dropbox', re: /^(.*?) \((?:c[óo]pia em conflito)[^)]*\)(\.[^.]+)$/i, orig: (m) => m[1] + m[2] },
  ];

  // caminho de uma cópia em conflito → { orig, tool, when } (ou null)
  function parse(path) {
    const name = path.split('/').pop(), dir = path.slice(0, path.length - name.length);
    for (const r of RULES) {
      const m = r.re.exec(name);
      if (m) return { orig: dir + r.orig(m), tool: r.tool, when: r.when ? r.when(m) : '' };
    }
    return null;
  }

  // cópias em conflito de uma nota que ainda existe
  function of(path, paths = S.notes.keys()) {
    const out = [];
    for (const p of paths) { const c = parse(p); if (c && c.orig === path) out.push({ path: p, ...c }); }
    return out;
  }

  // ---- faixa na nota ----
  const bar = document.createElement('div');
  bar.className = 'conflict-bar'; bar.hidden = true; bar.setAttribute('role', 'alert');
  document.querySelector('#note-view .view-header')?.after(bar);
  function refreshBar() {
    const note = activeNote(), list = note ? of(note.path) : [];
    bar.hidden = !list.length;
    if (!list.length) return;
    const desc = list.map((c) => c.tool + (c.when ? ' · ' + c.when : '')).join(', ');
    bar.innerHTML = `${icon('info', 16)}<span><b>${list.length} versão(ões) em conflito</b> desta nota (${esc(desc)}), criada(s) pela sincronização.</span><button class="btn" data-a="resolve">Resolver</button>`;
  }
  bar.addEventListener('click', (e) => { if (e.target.closest('[data-a="resolve"]')) resolve(); });
  document.getElementById('editor').addEventListener('lumen-load', refreshBar);
  const origRefresh = refreshVault;
  refreshVault = async function (...a) { const r = await origRefresh(...a); refreshBar(); return r; };

  // ---- resolver ----
  function lineDiff(a, b) { return typeof History !== 'undefined' ? History.lineDiff(a, b) : { add: 0, del: 0 }; }

  async function use(note, c) {
    const text = await lumen.fs.read(c.path); // conteúdo do disco (pode ser cifrado: a nota volta a pedir a senha)
    const d = lineDiff(note.content, text);
    const preview = text.length > 280 ? text.slice(0, 280) + '…' : text;
    if (!(await dialog({ title: `Usar a versão do conflito (${c.tool})?`, msg: `${preview}\n\n(+${d.add} / −${d.del} linhas em relação à atual. A atual fica no histórico de versões.)`, ok: 'Usar esta versão' }))) return;
    await flushSave(note.path);
    if (typeof History !== 'undefined') await History.snapshot(note.path, { force: true });
    await lumen.fs.write(note.path, text);
    await lumen.fs.remove(c.path);
    await refreshVault();
    toast('Conflito resolvido: versão do outro aparelho em uso', 'success');
  }
  async function discard(note, c) {
    if (!(await dialog({ title: 'Descartar a versão do conflito?', msg: `“${c.path}” vai para a lixeira. A nota fica como está.`, ok: 'Descartar', danger: true }))) return;
    await lumen.fs.remove(c.path);
    await refreshVault();
    toast('Versão em conflito descartada', 'success');
  }

  async function resolve(path = activeNote()?.path) {
    const note = S.notes.get(path); if (!note) return;
    const list = of(path);
    if (!list.length) return toast('Esta nota não tem versões em conflito');
    openPalette('', () => list.flatMap((c) => {
      const label = esc(c.tool + (c.when ? ' · ' + c.when : '')), sub = esc(c.path);
      return [
        { html: `<span class="pl-icon">${icon('check', 17)}</span><span class="pl-main">Usar a versão do conflito (${label})<span class="pl-sub">${sub}</span></span>`, run: () => use(note, c) },
        { html: `<span class="pl-icon">${icon('trash', 17)}</span><span class="pl-main">Descartar a versão do conflito (${label})<span class="pl-sub">${sub}</span></span>`, run: () => discard(note, c) },
      ];
    }), 'Resolver conflito de sincronização…');
  }

  // todas as notas com conflito (comando da paleta)
  function all() {
    const by = new Map();
    for (const p of S.notes.keys()) { const c = parse(p); if (c && S.notes.has(c.orig)) by.set(c.orig, (by.get(c.orig) || 0) + 1); }
    return [...by].map(([path, n]) => ({ path, n }));
  }

  return { parse, of, all, resolve, refreshBar };
})();
