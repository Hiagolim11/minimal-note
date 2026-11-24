// ---------- Ponte do Android (Capacitor) ----------
// Implementa a mesma API window.lumen que o preload do Electron expõe.
// Os arquivos do cofre passam pelo plugin nativo MinimalNote (java.io, com acesso
// a todos os arquivos quando o usuário permite); as configurações ficam na pasta
// privada do app via plugin Filesystem. Só é ativada dentro do app Android.
(function () {
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform?.() || window.lumen) return;
  // plugins nativos: proxies criados pelo runtime do Capacitor (vendor/capacitor/capacitor.js)
  // a partir dos PluginHeaders que o app nativo injeta
  const plugin = (name) => Cap.Plugins?.[name] || (Cap.registerPlugin ? Cap.registerPlugin(name) : null);
  const FS = plugin('Filesystem');
  const AppP = plugin('App');
  const MN = plugin('MinimalNote');
  if (!MN || !FS) { console.error('Plugins nativos do Minimal Note indisponíveis'); return; }

  const VAULT_DIR = 'Minimal Note';
  const TRASH = '.lixeira';
  const SETTINGS = 'minimal-note-settings.json';
  const VAULT_CFG = 'minimal-note-vault.json';

  let info = null;      // { sdk, storageGranted, externalRoot, documents, appRoot, powerSave, version }
  let cfg = null;       // { kind: 'external' | 'app', path: '/caminho/absoluto' }
  let root = '';        // pasta do cofre (absoluta)
  const listeners = [];

  // ---------- caminhos ----------
  const clean = (rel = '') => {
    const parts = String(rel).replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
    if (parts.some((p) => p === '..')) throw new Error('Caminho fora do cofre: ' + rel);
    return parts.join('/');
  };
  const abs = (rel) => [root, clean(rel)].filter(Boolean).join('/');
  const ext = (p) => (p.match(/\.[^./]+$/) || [''])[0];
  const exists = async (rel) => (await MN.exists({ path: abs(rel) })).exists;
  const read = async (rel) => (await MN.read({ path: abs(rel) })).data;
  const write = (rel, data) => MN.write({ path: abs(rel), data });
  const errMsg = (e) => e?.message || e?.errorMessage || String(e);

  // tree() e readAll() são chamados juntos: uma única varredura nativa atende os dois
  let scanP = null;
  // (chamadas feitas antes de a varredura terminar compartilham o resultado; depois, varre de novo)
  const scan = () => scanP || (scanP = MN.scan({ root }).then((r) => r.entries || []).finally(() => { scanP = null; }));

  const byName = (a, b) => (a.type === 'folder') !== (b.type === 'folder') ? (a.type === 'folder' ? -1 : 1)
    : a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
  function buildTree(entries) {
    const top = [], folders = new Map();
    for (const e of entries) {
      const parts = e.path.split('/'), name = parts.pop(), parent = parts.join('/');
      const node = e.type === 'folder' ? { type: 'folder', name, path: e.path, children: [] } : { type: e.type, name, path: e.path };
      if (e.type === 'folder') folders.set(e.path, node);
      (parent ? folders.get(parent)?.children : top)?.push(node);
    }
    const sort = (list) => { list.sort(byName); list.forEach((n) => n.children && sort(n.children)); return list; };
    return sort(top);
  }

  // ---------- configuração do cofre ----------
  const readJson = async (file) => { try { return JSON.parse((await FS.readFile({ path: file, directory: 'DATA', encoding: 'utf8' })).data); } catch { return null; } };
  const writeJson = (file, data) => FS.writeFile({ path: file, directory: 'DATA', data: JSON.stringify(data), encoding: 'utf8' });
  const appCfg = () => ({ kind: 'app', path: info.appRoot + '/' + VAULT_DIR });
  const docsCfg = () => ({ kind: 'external', path: info.documents + '/' + VAULT_DIR });
  const display = (c) => c.kind === 'app' ? 'Pasta do app/' + c.path.split('/').pop()
    : c.path.startsWith(info.externalRoot) ? ('Armazenamento' + c.path.slice(info.externalRoot.length)).replace(/^Armazenamento\/Documents/, 'Documentos') : c.path;

  const ask = (o) => (typeof window.dialog === 'function' ? window.dialog(o) : Promise.resolve(confirm(o.title + '\n\n' + o.msg)));
  const later = (msg, type = 'info') => setTimeout(() => window.toast?.(msg, type, 5000), 600);

  async function requestStorage() {
    try { return !!(await MN.requestStorage()).granted; } catch { return false; } finally { info = await MN.info(); }
  }

  // primeira execução: pergunta onde guardar as notas
  async function firstRunChoice() {
    if (info.storageGranted) return docsCfg();
    const ok = await ask({
      title: 'Onde guardar suas notas?',
      msg: 'Recomendado: permita o acesso aos arquivos para guardar as notas em Documentos/Minimal Note. Assim elas continuam no aparelho mesmo se o app for desinstalado e você pode sincronizá-las (Syncthing, Drive…) ou escolher outra pasta.\n\nSe preferir, use a pasta privada do app — ela é apagada ao desinstalar.',
      ok: 'Permitir acesso', cancel: 'Pasta do app',
    });
    if (ok && await requestStorage()) return docsCfg();
    if (ok) later('Sem acesso aos arquivos: usando a pasta do app. Você pode mudar em Configurações → Cofre.');
    return appCfg();
  }

  const WELCOME = `O Minimal Note guarda suas notas como arquivos \`.md\` comuns, dentro de uma pasta (o seu *cofre*).

## Primeiros passos
- [ ] Toque em **+** para criar uma nota
- [ ] Use a barra de baixo para ver arquivos, buscar, abrir o grafo e as configurações
- [ ] Ao escrever, use a barra acima do teclado para **negrito**, listas, tarefas e [[links]]
- [ ] Compartilhe um texto ou link de outro app com o Minimal Note para virar nota
- [ ] Toque e segure o ícone do app para criar nota, abrir a nota diária ou buscar
- [ ] Toque e segure um item da lista para ver mais opções
- [ ] Personalize temas, cores, fontes e partículas nas configurações

> [!tip] Dica
> Digite \`[[\` para buscar notas e criar links rapidamente. Ligue notas escrevendo [[Guia de atalhos]].

#boas-vindas #minimal-note
`;
  const GUIDE = `## Markdown
- **negrito**, *itálico*, ~~riscado~~, ==destaque==
- \`- [ ]\` cria uma tarefa (toque na caixa para marcar)
- \`[[Nome da nota]]\` cria um link
- \`#tag\` organiza por assunto

## No celular
- Deslize da borda esquerda para abrir a lista de arquivos
- A barra acima do teclado tem títulos, listas, tarefas, links, recuo, desfazer, ⌕ para localizar e substituir e ✓ para revisar a gramática
- Toque numa palavra sublinhada para ver sugestões ou adicioná-la ao dicionário
- Em **Configurações → Cofre** você escolhe a pasta das notas e faz backup em .zip

> [!note] Callouts
> Use \`> [!note]\`, \`> [!tip]\`, \`> [!warning]\`, \`> [!danger]\` ou \`> [!info]\`.

Voltar para [[Bem-vindo]].
`;

  async function useVault(c) {
    root = c.path.replace(/\/+$/, '');
    await MN.mkdir({ path: root });
    // confirma que dá para gravar ali
    await MN.write({ path: root + '/.minimal-note-probe', data: 'ok' });
    await MN.remove({ path: root + '/.minimal-note-probe' }).catch(() => {});
    cfg = c;
  }

  async function ensureVault(spec) {
    info = await MN.info();
    let c = spec && typeof spec === 'object' && spec.path ? spec : await readJson(VAULT_CFG);
    if (!c || !c.path) c = await firstRunChoice();
    if (c.kind === 'external' && !info.storageGranted) {
      // a permissão foi retirada (ou nunca dada nesta instalação)
      const ok = await ask({ title: 'Acesso aos arquivos', msg: `O cofre fica em “${display(c)}”, mas o app está sem permissão para acessar os arquivos.`, ok: 'Permitir acesso', cancel: 'Pasta do app' });
      if (!(ok && await requestStorage())) { later('Sem acesso aos arquivos: usando a pasta do app.'); c = appCfg(); }
    }
    try { await useVault(c); } catch (err) {
      if (c.kind === 'app') throw err;
      later('Não foi possível usar “' + display(c) + '”: ' + errMsg(err) + '. Usando a pasta do app.', 'error');
      c = appCfg(); await useVault(c);
    }
    await writeJson(VAULT_CFG, cfg);
    const entries = await scan();
    if (!entries.some((e) => e.type === 'note' || e.type === 'folder')) {
      await write('Bem-vindo.md', WELCOME);
      await write('Guia de atalhos.md', GUIDE);
    }
    return { root: display(cfg), name: root.split('/').pop() || VAULT_DIR, kind: cfg.kind };
  }

  // ---------- seletor de pasta do cofre ----------
  function pickFolder(start) {
    return new Promise((resolve) => {
      const top = info.externalRoot;
      let cur = start && start.startsWith(top) ? start : info.documents;
      const ov = document.createElement('div');
      ov.className = 'overlay fp-overlay';
      ov.innerHTML = `<div class="modal fp" role="dialog" aria-label="Escolher pasta do cofre">
        <div class="fp-head"><h3>Pasta do cofre</h3><div class="fp-path"></div></div>
        <div class="fp-list"></div>
        <div class="fp-info"></div>
        <div class="fp-actions">
          <button class="btn" data-a="mkdir">Nova pasta</button>
          <button class="btn" data-a="app">Pasta do app</button>
          <span class="fp-gap"></span>
          <button class="btn" data-a="cancel">Cancelar</button>
          <button class="btn primary" data-a="use">Usar esta pasta</button>
        </div></div>`;
      document.body.appendChild(ov);
      const $ = (s) => ov.querySelector(s);
      const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
      const close = (val) => { ov.remove(); window.__lumenPicker = null; resolve(val); };
      window.__lumenPicker = () => close(null); // botão voltar
      async function render() {
        const rel = cur.slice(top.length).split('/').filter(Boolean);
        $('.fp-path').innerHTML = ['Armazenamento', ...rel].map((p, i) => `<button data-crumb="${i}">${esc(p)}</button>`).join('<span>/</span>');
        let r = { dirs: [], notes: 0, readable: false };
        try { r = await MN.listDirs({ path: cur }); } catch { /* sem acesso */ }
        const dirs = r.dirs.map((d) => d.name).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
        $('.fp-list').innerHTML = (cur !== top ? '<button class="fp-item up" data-up="1"><span class="fp-ic">↩</span><span>Voltar</span></button>' : '')
          + (dirs.length ? dirs.map((d) => `<button class="fp-item" data-dir="${esc(d)}"><span class="fp-ic">${window.icon ? window.icon('folder', 18) : '📁'}</span><span>${esc(d)}</span></button>`).join('')
            : '<div class="fp-empty">Nenhuma subpasta aqui.</div>');
        $('.fp-info').textContent = !r.readable ? 'Não foi possível ler esta pasta.'
          : r.notes ? `${r.notes} nota${r.notes > 1 ? 's' : ''} nesta pasta.` : 'Esta pasta ainda não tem notas (o app cria as de boas-vindas).';
        $('.fp-list').scrollTop = 0;
      }
      ov.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) { if (e.target === ov) close(null); return; }
        if (b.dataset.dir) { cur = cur + '/' + b.dataset.dir; return render(); }
        if (b.dataset.up) { cur = cur.split('/').slice(0, -1).join('/') || top; if (!cur.startsWith(top)) cur = top; return render(); }
        if (b.dataset.crumb != null) { const rel = cur.slice(top.length).split('/').filter(Boolean); cur = [top, ...rel.slice(0, Number(b.dataset.crumb))].join('/'); return render(); }
        const a = b.dataset.a;
        if (a === 'cancel') return close(null);
        if (a === 'use') return close({ kind: 'external', path: cur });
        if (a === 'app') return close(appCfg());
        if (a === 'mkdir') {
          ov.style.display = 'none';
          const name = await ask({ title: 'Nova pasta', input: 'Minhas notas', ok: 'Criar' });
          ov.style.display = '';
          const n = String(name || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
          if (!n) return;
          try { await MN.mkdir({ path: cur + '/' + n }); cur = cur + '/' + n; } catch (err) { window.toast?.(errMsg(err), 'error'); }
          return render();
        }
      });
      render();
    });
  }

  async function chooseFolder() {
    info = await MN.info();
    if (!info.storageGranted) {
      const ok = await ask({ title: 'Escolher pasta', msg: 'Para usar uma pasta do aparelho (por exemplo, uma pasta sincronizada), permita o acesso aos arquivos. Sem isso, só a pasta privada do app está disponível.', ok: 'Permitir acesso', cancel: 'Agora não' });
      if (!ok) return null;
      if (!await requestStorage()) { window.toast?.('Permissão não concedida', 'error'); return null; }
    }
    return pickFolder(cfg?.kind === 'external' ? root : null);
  }

  const notify = () => listeners.forEach((cb) => { try { cb(); } catch { /* ignora */ } });
  // sem observador de arquivos no Android: recarrega quando o app volta para a frente
  AppP?.addListener?.('resume', async () => {
    try { info = await MN.info(); } catch { /* ignora */ }
    window.__lumenPower?.(info?.powerSave);
    notify();
  });

  // o Android pode encerrar o app em segundo plano: grava as edições pendentes ao sair
  AppP?.addListener?.('pause', () => { try { window.flushAll?.(); } catch { /* ignora */ } });

  // botão "voltar": fecha o que estiver aberto antes de sair
  AppP?.addListener?.('backButton', () => {
    const $ = (s) => document.querySelector(s);
    const visible = (s) => { const el = $(s); return el && !el.hidden; };
    if (window.__lumenPicker) return window.__lumenPicker();
    if (visible('#dialog')) return $('#dialog-cancel').click();
    if (visible('#palette') || visible('#settings') || visible('#ctx-menu') || visible('#suggest')) {
      return document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) || document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    const bd = $('#drawer-backdrop');
    if (bd?.classList.contains('show')) return bd.click();
    if (window.__lumenBack?.()) return;
    AppP.minimizeApp?.();
  });

  const toB64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // cores das barras do sistema = cores da barra de título e da barra de navegação
  const hex = (c) => {
    const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || '');
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null;
    return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  };
  let barsTimer = 0;
  function syncBars(mode) {
    clearTimeout(barsTimer);
    barsTimer = setTimeout(() => {
      const cs = getComputedStyle(document.documentElement);
      const fallback = hex(getComputedStyle(document.body).backgroundColor) || cs.getPropertyValue('--bg').trim() || '#0f1117';
      const top = hex(getComputedStyle(document.querySelector('.titlebar') || document.body).backgroundColor) || fallback;
      const nav = document.querySelector('.ribbon');
      const bottom = (window.innerWidth <= 480 && nav && hex(getComputedStyle(nav).backgroundColor)) || top;
      MN.setBars({ top, bottom, dark: mode !== 'light' }).catch(() => {});
    }, 60);
  }
  window.addEventListener('resize', () => syncBars(document.documentElement.dataset.mode));

  window.lumen = {
    platform: 'android',
    settings: {
      get: async () => (await readJson(SETTINGS)) || {},
      set: async (data) => { await writeJson(SETTINGS, data); return true; },
    },
    vault: {
      open: (spec) => ensureVault(spec),
      choose: () => chooseFolder(),
      onChange: (cb) => listeners.push(cb),
      info: () => ({ ...info, kind: cfg?.kind, path: root }),
      backup: async () => MN.backup({ root }),
      trashCount: async () => { try { return (await MN.listDirs({ path: abs(TRASH) })).total || 0; } catch { return 0; } },
      emptyTrash: async () => { await MN.remove({ path: abs(TRASH) }); return true; },
    },
    fs: {
      tree: async () => buildTree(await scan()),
      readAll: async () => (await scan()).filter((e) => e.type === 'note').map((e) => ({ path: e.path, content: e.content, mtime: Number(e.mtime) || Date.now(), ctime: Number(e.mtime) || Date.now() })),
      read: (p) => read(p),
      write: async (p, c) => { await write(clean(p), c); return true; },
      create: async (rel, content = '') => {
        rel = clean(rel);
        const e = ext(rel) || '.md', base = rel.slice(0, rel.length - ext(rel).length);
        let cand = base + e, i = 1;
        while (await exists(cand)) cand = `${base} ${i++}${e}`;
        await write(cand, content);
        return cand;
      },
      mkdir: async (rel) => {
        rel = clean(rel); let cand = rel, i = 1;
        while (await exists(cand)) cand = `${rel} ${i++}`;
        await MN.mkdir({ path: abs(cand) });
        return cand;
      },
      rename: async (a, b) => {
        a = clean(a); b = clean(b);
        if (a === b) return b;
        await MN.rename({ from: abs(a), to: abs(b) }).catch((e) => { throw new Error(errMsg(e)); });
        return b;
      },
      // sem lixeira do sistema no Android: move para a pasta .lixeira do cofre (recuperável)
      remove: async (rel) => {
        rel = clean(rel);
        if (!rel) throw new Error('Não é possível apagar o cofre');
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14), name = rel.split('/').pop();
        // nome livre: dois itens de mesmo nome excluídos no mesmo segundo (ex.: A/Nota e B/Nota)
        // fariam o segundo falhar com "Já existe um item com esse nome"
        let dest = `${TRASH}/${stamp} ${name}`;
        for (let i = 2; await exists(dest); i++) dest = `${TRASH}/${stamp} (${i}) ${name}`;
        await MN.rename({ from: abs(rel), to: abs(dest) });
        return true;
      },
      saveImage: async (relDir, name, bytes) => {
        const folder = clean(relDir || 'Anexos');
        const e = ext(name) || '.png';
        const base = (name.slice(0, name.length - ext(name).length) || 'imagem').replace(/[^\w-]+/g, '-');
        let cand = `${folder}/${base}${e}`, i = 1;
        while (await exists(cand)) cand = `${folder}/${base}-${i++}${e}`;
        await MN.write({ path: abs(cand), data: toB64(bytes), base64: true });
        return cand;
      },
      absPath: async (rel) => abs(rel),
      exportHtml: async (fileName, html) => {
        const rel = 'Exportações/' + fileName.replace(/[\\/:*?"<>|]+/g, '-');
        await write(rel, html);
        notify();
        return rel + ' (no cofre)';
      },
      // abre a impressão do Android (dá para escolher "Salvar como PDF")
      exportPdf: async (fileName) => { await MN.print({ name: fileName.replace(/\.pdf$/i, '') }); return null; },
    },
    // URL que a WebView consegue carregar para imagens do cofre
    fileUrl: (rel) => Cap.convertFileSrc('file://' + abs(rel).split('/').map((p, i) => (i ? encodeURIComponent(p) : p)).join('/')),
    share: (title, text) => MN.share({ title, text }),
    // digital: guarda/recupera a senha de uma nota protegida no cofre de chaves do Android
    bio: {
      status: () => MN.bioStatus().catch(() => ({ available: false })),
      save: async (key, secret) => { try { await MN.bioSave({ key, secret }); } catch (e) { throw new Error(errMsg(e)); } },
      load: async (key) => { try { return (await MN.bioLoad({ key })).secret; } catch (e) { throw new Error(errMsg(e)); } },
      clear: (key) => MN.bioClear({ key }),
    },
    // revisão gramatical (LanguageTool): a conexão sai do código nativo (a CSP da página bloqueia)
    lt: {
      check: async (req) => {
        const s = (typeof S !== 'undefined' && S.settings) || {};
        if (s.ltEnabled !== true) throw new Error('A revisão gramatical está desligada');
        const base = s.ltServer === 'custom'
          ? String(s.ltUrl || '').trim().replace(/\/+$/, '').replace(/\/v2(\/check)?$/, '')
          : 'https://api.languagetool.org';
        const body = new URLSearchParams({ data: String(req?.data || ''), language: String(req?.language || 'pt-BR'), level: 'default' }).toString();
        let r;
        try { r = await MN.ltCheck({ base, body }); } catch (e) { throw new Error(errMsg(e)); }
        if (r.status === 429) throw new Error('Limite do servidor atingido: espere um minuto e tente de novo');
        if (r.status === 413) throw new Error('Texto grande demais para o servidor');
        if (r.status < 200 || r.status >= 300) throw new Error(`O servidor de revisão respondeu ${r.status}`);
        const json = JSON.parse(r.body || '{}');
        return (json.matches || []).map((m) => ({
          offset: m.offset, length: m.length, message: m.message, shortMessage: m.shortMessage,
          replacements: (m.replacements || []).slice(0, 6).map((x) => x.value),
          rule: { id: m.rule?.id, issueType: m.rule?.issueType, category: m.rule?.category?.name },
        }));
      },
    },
    // textos/arquivos recebidos de outros apps e atalhos do ícone
    onIntent: (cb) => {
      MN.addListener('intent', (d) => cb(d));
      MN.consumeIntent().then((r) => r.intent && cb(r.intent)).catch(() => {});
    },
    power: () => !!info?.powerSave,
    shell: {
      reveal: async () => true,
      // o Capacitor abre URLs externas no navegador do sistema
      external: async (url) => { if (/^https?:\/\//i.test(url)) window.open(url, '_blank'); return true; },
    },
    win: {
      minimize: () => AppP?.minimizeApp?.(), maximize: () => {}, close: () => AppP?.exitApp?.(),
      fullscreen: () => {}, nativeTheme: (mode) => syncBars(mode), onState: () => {},
    },
  };
})();
