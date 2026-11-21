// ---------- Ponte do Android (Capacitor) ----------
// Implementa a mesma API window.lumen que o preload do Electron expõe, usando os
// plugins Filesystem e App do Capacitor. Só é ativada dentro do app Android;
// no Electron (ou num navegador comum) não faz nada.
(function () {
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform?.() || window.lumen) return;
  const FS = Cap.Plugins.Filesystem;
  const AppP = Cap.Plugins.App;

  const NOTE_EXT = /\.(md|markdown|txt)$/i;
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
  const VAULT_DIR = 'Minimal Note';
  const TRASH = '.lixeira';
  const SETTINGS = 'minimal-note-settings.json';

  let dir = 'DOCUMENTS'; // cai para 'DATA' (pasta privada) se o Android não permitir
  let rootUri = '';
  const listeners = [];

  // ---------- caminhos ----------
  const clean = (rel = '') => {
    const parts = String(rel).replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
    if (parts.some((p) => p === '..')) throw new Error('Caminho fora do cofre: ' + rel);
    return parts.join('/');
  };
  const full = (rel) => [VAULT_DIR, clean(rel)].filter(Boolean).join('/');
  const ext = (p) => (p.match(/\.[^./]+$/) || [''])[0];
  const exists = async (rel) => { try { await FS.stat({ path: full(rel), directory: dir }); return true; } catch { return false; } };

  const read = async (rel) => (await FS.readFile({ path: full(rel), directory: dir, encoding: 'utf8' })).data;
  const write = async (rel, data) => {
    // escrita "atômica": grava num temporário e renomeia
    const tmp = rel + '.lumen-tmp';
    await FS.writeFile({ path: full(tmp), directory: dir, data, encoding: 'utf8', recursive: true });
    try { await FS.deleteFile({ path: full(rel), directory: dir }); } catch { /* não existia */ }
    await FS.rename({ from: full(tmp), to: full(rel), directory: dir, toDirectory: dir });
  };

  async function list(rel) {
    try { return (await FS.readdir({ path: full(rel), directory: dir })).files || []; } catch { return []; }
  }

  async function buildTree(rel = '') {
    const out = [];
    for (const e of await list(rel)) {
      if (e.name.startsWith('.') || e.name.endsWith('.lumen-tmp')) continue;
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.type === 'directory') out.push({ type: 'folder', name: e.name, path: p, children: await buildTree(p) });
      else if (NOTE_EXT.test(e.name)) out.push({ type: 'note', name: e.name, path: p });
      else if (IMG_EXT.test(e.name)) out.push({ type: 'image', name: e.name, path: p });
    }
    out.sort((a, b) => (a.type === 'folder') !== (b.type === 'folder') ? (a.type === 'folder' ? -1 : 1)
      : a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    return out;
  }

  async function collect(rel = '', acc = []) {
    for (const e of await list(rel)) {
      if (e.name.startsWith('.')) continue;
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.type === 'directory') await collect(p, acc);
      else if (NOTE_EXT.test(e.name)) {
        try { acc.push({ path: p, content: await read(p), mtime: Number(e.mtime) || Date.now(), ctime: Number(e.ctime || e.mtime) || Date.now() }); } catch { /* sumiu */ }
      }
    }
    return acc;
  }

  const WELCOME = `O Minimal Note guarda suas notas como arquivos \`.md\` comuns, dentro de uma pasta (o seu *cofre*).

## Primeiros passos
- [ ] Toque em **+** para criar uma nota
- [ ] Use a barra de baixo para ver arquivos, buscar, abrir o grafo e as configurações
- [ ] Ligue notas escrevendo [[Guia de atalhos]]
- [ ] Toque e segure um item da lista para ver mais opções
- [ ] Personalize temas, cores, fontes e partículas nas configurações

> [!tip] Dica
> Digite \`[[\` para buscar notas e criar links rapidamente.

#boas-vindas #minimal-note
`;
  const GUIDE = `## Markdown
- **negrito**, *itálico*, ~~riscado~~, ==destaque==
- \`- [ ]\` cria uma tarefa (toque na caixa para marcar)
- \`[[Nome da nota]]\` cria um link
- \`#tag\` organiza por assunto

> [!note] Callouts
> Use \`> [!note]\`, \`> [!tip]\`, \`> [!warning]\`, \`> [!danger]\` ou \`> [!info]\`.

Voltar para [[Bem-vindo]].
`;

  async function ensureVault() {
    // tenta a pasta pública Documentos; se falhar, usa a pasta privada do app
    for (const d of ['DOCUMENTS', 'DATA']) {
      dir = d;
      try {
        await FS.mkdir({ path: VAULT_DIR, directory: dir, recursive: true }).catch(() => {});
        const probe = '.minimal-note-probe';
        await FS.writeFile({ path: full(probe), directory: dir, data: 'ok', encoding: 'utf8', recursive: true });
        await FS.deleteFile({ path: full(probe), directory: dir });
        break;
      } catch (err) {
        if (d === 'DATA') throw err;
      }
    }
    const entries = await list('');
    if (!entries.some((e) => NOTE_EXT.test(e.name) || e.type === 'directory')) {
      await write('Bem-vindo.md', WELCOME);
      await write('Guia de atalhos.md', GUIDE);
    }
    rootUri = (await FS.getUri({ path: VAULT_DIR, directory: dir })).uri;
    return { root: dir === 'DOCUMENTS' ? 'Documentos/' + VAULT_DIR : 'Armazenamento do app/' + VAULT_DIR, name: VAULT_DIR };
  }

  const notify = () => listeners.forEach((cb) => { try { cb(); } catch { /* ignora */ } });
  // sem observador de arquivos no Android: recarrega quando o app volta para a frente
  AppP?.addListener?.('resume', notify);

  // botão "voltar": fecha o que estiver aberto antes de sair
  AppP?.addListener?.('backButton', () => {
    const $ = (s) => document.querySelector(s);
    const visible = (s) => { const el = $(s); return el && !el.hidden; };
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

  window.lumen = {
    platform: 'android',
    settings: {
      get: async () => { try { return JSON.parse((await FS.readFile({ path: SETTINGS, directory: 'DATA', encoding: 'utf8' })).data); } catch { return {}; } },
      set: async (data) => { await FS.writeFile({ path: SETTINGS, directory: 'DATA', data: JSON.stringify(data), encoding: 'utf8' }); return true; },
    },
    vault: {
      open: () => ensureVault(),
      choose: async () => null,
      onChange: (cb) => listeners.push(cb),
    },
    fs: {
      tree: () => buildTree(''),
      readAll: () => collect(''),
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
        await FS.mkdir({ path: full(cand), directory: dir, recursive: true });
        return cand;
      },
      rename: async (a, b) => {
        a = clean(a); b = clean(b);
        if (a === b) return b;
        if (await exists(b) && a.toLowerCase() !== b.toLowerCase()) throw new Error('Já existe um item com esse nome');
        const parent = b.split('/').slice(0, -1).join('/');
        if (parent) await FS.mkdir({ path: full(parent), directory: dir, recursive: true }).catch(() => {});
        await FS.rename({ from: full(a), to: full(b), directory: dir, toDirectory: dir });
        return b;
      },
      // sem lixeira do sistema no Android: move para a pasta .lixeira do cofre (recuperável)
      remove: async (rel) => {
        rel = clean(rel);
        if (!rel) throw new Error('Não é possível apagar o cofre');
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const name = rel.split('/').pop();
        await FS.mkdir({ path: full(TRASH), directory: dir, recursive: true }).catch(() => {});
        await FS.rename({ from: full(rel), to: full(`${TRASH}/${stamp} ${name}`), directory: dir, toDirectory: dir });
        return true;
      },
      saveImage: async (relDir, name, bytes) => {
        const folder = clean(relDir || 'Anexos');
        const e = ext(name) || '.png';
        const base = (name.slice(0, name.length - ext(name).length) || 'imagem').replace(/[^\w-]+/g, '-');
        let cand = `${folder}/${base}${e}`, i = 1;
        while (await exists(cand)) cand = `${folder}/${base}-${i++}${e}`;
        await FS.writeFile({ path: full(cand), directory: dir, data: toB64(bytes), recursive: true });
        return cand;
      },
      absPath: async (rel) => rootUri + '/' + clean(rel),
      exportHtml: async (fileName, html) => {
        const rel = 'Exportações/' + fileName.replace(/[\\/:*?"<>|]+/g, '-');
        await write(rel, html);
        notify();
        return rel + ' (no cofre)';
      },
      exportPdf: async () => { throw new Error('No Android, exporte como HTML (o PDF ainda não é suportado).'); },
    },
    // URL que a WebView consegue carregar para imagens do cofre
    fileUrl: (rel) => Cap.convertFileSrc(rootUri + '/' + clean(rel).split('/').map(encodeURIComponent).join('/')),
    shell: {
      reveal: async () => true,
      // o Capacitor abre URLs externas no navegador do sistema
      external: async (url) => { if (/^https?:\/\//i.test(url)) window.open(url, '_blank'); return true; },
    },
    win: {
      minimize: () => AppP?.minimizeApp?.(), maximize: () => {}, close: () => AppP?.exitApp?.(),
      fullscreen: () => {}, nativeTheme: () => {}, onState: () => {},
    },
  };
})();
