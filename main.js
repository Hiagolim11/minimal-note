// Minimal Note — processo principal do Electron
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

let win = null;
let vaultRoot = null;
let watcher = null;
let watchTimer = null;

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const NOTE_EXT = new Set(['.md', '.markdown', '.txt']);
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']);

// ---------- utilidades ----------
function resolveInVault(rel = '') {
  if (!vaultRoot) throw new Error('Nenhum cofre aberto');
  const root = path.resolve(vaultRoot);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('Caminho fora do cofre: ' + rel);
  }
  return abs;
}
const toRel = (abs) => path.relative(vaultRoot, abs).split(path.sep).join('/');

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readSettings() {
  try { return JSON.parse(await fs.readFile(SETTINGS_FILE(), 'utf8')); } catch { return {}; }
}

async function writeSettings(data) {
  const file = SETTINGS_FILE();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

// escrita atômica: evita arquivos corrompidos se o app fechar no meio
async function atomicWrite(abs, content) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = abs + '.lumen-tmp';
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, abs);
}

async function buildTree(dirAbs) {
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.endsWith('.lumen-tmp') || e.name === 'node_modules') continue;
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      out.push({ type: 'folder', name: e.name, path: toRel(abs), children: await buildTree(abs) });
    } else {
      const ext = path.extname(e.name).toLowerCase();
      if (NOTE_EXT.has(ext)) out.push({ type: 'note', name: e.name, path: toRel(abs) });
      else if (IMG_EXT.has(ext)) out.push({ type: 'image', name: e.name, path: toRel(abs) });
    }
  }
  out.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (b.type === 'folder' && a.type !== 'folder') return 1;
    return a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
  return out;
}

async function collectNotes(dirAbs, acc = []) {
  const entries = await fs.readdir(dirAbs, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) await collectNotes(abs, acc);
    else if (NOTE_EXT.has(path.extname(e.name).toLowerCase())) {
      try {
        const [content, st] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
        acc.push({ path: toRel(abs), content, mtime: st.mtimeMs, ctime: st.birthtimeMs });
      } catch { /* arquivo sumiu no meio da leitura */ }
    }
  }
  return acc;
}

function startWatcher() {
  if (watcher) { watcher.close(); watcher = null; }
  if (!vaultRoot) return;
  try {
    watcher = fsSync.watch(vaultRoot, { recursive: true }, (_evt, filename) => {
      if (filename && (filename.endsWith('.lumen-tmp') || filename.split(/[\\/]/).some((p) => p.startsWith('.')))) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => win?.webContents.send('vault:changed'), 250);
    });
  } catch (err) {
    console.warn('Watcher indisponível:', err.message);
  }
}

const WELCOME = `O Minimal Note é um app de notas em **Markdown** que guarda tudo em arquivos \`.md\` comuns, dentro de uma pasta (o seu *cofre*).

## Primeiros passos
- [ ] Crie uma nota com **Ctrl + N**
- [ ] Abra a paleta de comandos com **Ctrl + P**
- [ ] Ligue notas escrevendo [[Guia de atalhos]]
- [ ] Veja o **Grafo** com **Ctrl + G**
- [ ] Personalize temas, cores e fontes em **Ctrl + ,**

> [!tip] Dica
> Digite \`[[\` para buscar notas e criar links rapidamente.

#boas-vindas #minimal-note
`;

const SHORTCUTS = `| Ação | Atalho |
| --- | --- |
| Nova nota | Ctrl + N |
| Paleta de comandos | Ctrl + P |
| Busca no cofre | Ctrl + Shift + F |
| Alternar edição / leitura | Ctrl + E |
| Modo dividido | Ctrl + \\\\ |
| Grafo | Ctrl + G |
| Nota diária | Ctrl + Shift + D |
| Configurações | Ctrl + , |
| Barra lateral | Ctrl + B (fora do editor) |
| Fechar aba | Ctrl + W |
| Modo foco | F11 |

## Markdown no editor
- **Ctrl + B** negrito · **Ctrl + I** itálico · **Ctrl + K** link
- \`Tab\` / \`Shift+Tab\` indentam listas

> [!note] Callouts
> Use \`> [!note]\`, \`> [!tip]\`, \`> [!warning]\`, \`> [!danger]\` ou \`> [!info]\`.

Voltar para [[Bem-vindo]].
`;

async function ensureDefaultVault() {
  const dir = process.env.LUMEN_VAULT || path.join(app.getPath('documents'), 'Minimal Note');
  if (!(await exists(dir))) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'Bem-vindo.md'), WELCOME, 'utf8');
    await fs.writeFile(path.join(dir, 'Guia de atalhos.md'), SHORTCUTS, 'utf8');
  }
  return dir;
}

// ---------- janela ----------
function createWindow(bounds) {
  win = new BrowserWindow({
    width: bounds?.width || 1280,
    height: bounds?.height || 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 380,
    minHeight: 480,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => {
    if (bounds?.maximized) win.maximize();
    win.show();
  });

  // links externos abrem no navegador, nunca dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
  });

  const sendState = () => win?.webContents.send('window:state', { maximized: win.isMaximized() });
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);

  win.on('close', async () => {
    try {
      const s = await readSettings();
      s.windowBounds = { ...win.getNormalBounds(), maximized: win.isMaximized() };
      await writeSettings(s);
    } catch { /* ignora */ }
  });
}

// ---------- IPC ----------
const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...args) => {
  try { return { ok: true, data: await fn(...args) }; }
  catch (err) { return { ok: false, error: err.message }; }
});

handle('settings:get', readSettings);
handle('settings:set', async (data) => { await writeSettings(data); return true; });

handle('vault:open', async (dir) => {
  let target = dir;
  if (!target || !(await exists(target))) target = await ensureDefaultVault();
  vaultRoot = path.resolve(target);
  startWatcher();
  return { root: vaultRoot, name: path.basename(vaultRoot) };
});

handle('vault:choose', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Escolha a pasta do cofre',
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

handle('fs:tree', async () => buildTree(resolveInVault('')));
handle('fs:readAll', async () => collectNotes(resolveInVault('')));
handle('fs:read', async (rel) => fs.readFile(resolveInVault(rel), 'utf8'));
handle('fs:write', async (rel, content) => { await atomicWrite(resolveInVault(rel), content); return true; });

handle('fs:create', async (rel, content = '') => {
  // gera um nome livre: "Sem título", "Sem título 1", ...
  const ext = path.extname(rel) || '.md';
  const base = rel.slice(0, rel.length - path.extname(rel).length);
  let candidate = base + ext; let i = 1;
  while (await exists(resolveInVault(candidate))) candidate = `${base} ${i++}${ext}`;
  await atomicWrite(resolveInVault(candidate), content);
  return candidate;
});

handle('fs:mkdir', async (rel) => {
  let candidate = rel; let i = 1;
  while (await exists(resolveInVault(candidate))) candidate = `${rel} ${i++}`;
  await fs.mkdir(resolveInVault(candidate), { recursive: true });
  return candidate;
});

handle('fs:rename', async (fromRel, toRelPath) => {
  const from = resolveInVault(fromRel);
  const to = resolveInVault(toRelPath);
  if (from === to) return toRelPath;
  if (await exists(to) && from.toLowerCase() !== to.toLowerCase()) throw new Error('Já existe um item com esse nome');
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  return toRelPath;
});

handle('fs:delete', async (rel) => {
  const abs = resolveInVault(rel);
  if (abs === path.resolve(vaultRoot)) throw new Error('Não é possível apagar o cofre');
  await shell.trashItem(abs); // vai para a lixeira, recuperável
  return true;
});

handle('fs:saveImage', async (relDir, name, bytes) => {
  const dir = resolveInVault(relDir || 'Anexos');
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(name) || '.png';
  const base = path.basename(name, ext).replace(/[^\w\-]+/g, '-') || 'imagem';
  let candidate = path.join(dir, base + ext); let i = 1;
  while (await exists(candidate)) candidate = path.join(dir, `${base}-${i++}${ext}`);
  await fs.writeFile(candidate, Buffer.from(bytes));
  return toRel(candidate);
});

handle('fs:absPath', async (rel) => resolveInVault(rel));
handle('shell:reveal', async (rel) => { shell.showItemInFolder(resolveInVault(rel)); return true; });
handle('shell:external', async (url) => { if (/^https?:\/\//i.test(url)) await shell.openExternal(url); return true; });

handle('fs:exportHtml', async (suggested, html) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Exportar como HTML',
    defaultPath: suggested,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, html, 'utf8');
  return r.filePath;
});

handle('fs:exportPdf', async (suggested) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Exportar como PDF',
    defaultPath: suggested,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (r.canceled || !r.filePath) return null;
  const pdf = await win.webContents.printToPDF({ printBackground: true, margins: { marginType: 'default' } });
  await fs.writeFile(r.filePath, pdf);
  return r.filePath;
});

ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on('window:close', () => win?.close());
ipcMain.on('window:fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
ipcMain.on('theme:native', (_e, mode) => { nativeTheme.themeSource = mode; });

// ---------- modo de teste (só ativo com LUMEN_TEST_SCRIPT) ----------
async function runTestScript() {
  const script = require(path.resolve(process.env.LUMEN_TEST_SCRIPT));
  const outDir = process.env.LUMEN_TEST_OUT || __dirname;
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(2500);
  for (const step of script) {
    if (step.size) win.setSize(step.size[0], step.size[1]);
    if (step.js) {
      try { const r = await win.webContents.executeJavaScript(step.js); if (r !== undefined) console.log('[js]', JSON.stringify(r)); }
      catch (err) { console.log('[js-error]', err.message); }
    }
    await wait(step.wait ?? 700);
    if (step.shot) {
      const img = await win.webContents.capturePage();
      await fs.writeFile(path.join(outDir, step.shot + '.png'), img.toPNG());
      console.log('[shot]', step.shot);
    }
  }
  app.exit(0);
}

if (process.env.LUMEN_USER_DATA) app.setPath('userData', process.env.LUMEN_USER_DATA);

// ---------- ciclo de vida ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    const s = await readSettings();
    createWindow(s.windowBounds);
    if (process.env.LUMEN_TEST_SCRIPT) win.webContents.once('did-finish-load', runTestScript);
  });
  app.on('window-all-closed', () => { watcher?.close(); app.quit(); });
}
