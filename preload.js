// Ponte segura entre o renderer e o processo principal
const { contextBridge, ipcRenderer } = require('electron');

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

contextBridge.exposeInMainWorld('lumen', {
  settings: {
    get: () => call('settings:get'),
    set: (data) => call('settings:set', data),
  },
  vault: {
    open: (dir) => call('vault:open', dir),
    choose: () => call('vault:choose'),
    trashCount: () => call('vault:trashCount'),
    emptyTrash: () => call('vault:emptyTrash'),
    onChange: (cb) => ipcRenderer.on('vault:changed', () => cb()),
  },
  fs: {
    tree: () => call('fs:tree'),
    readAll: (known) => call('fs:readAll', known),
    read: (p) => call('fs:read', p),
    write: (p, c) => call('fs:write', p, c),
    create: (p, c) => call('fs:create', p, c),
    mkdir: (p) => call('fs:mkdir', p),
    rename: (a, b) => call('fs:rename', a, b),
    remove: (p) => call('fs:delete', p),
    saveImage: (dir, name, bytes) => call('fs:saveImage', dir, name, bytes),
    absPath: (p) => call('fs:absPath', p),
    exportHtml: (name, html) => call('fs:exportHtml', name, html),
    exportPdf: (name) => call('fs:exportPdf', name),
  },
  capture: {
    open: () => call('capture:open'),
    save: (req) => call('capture:save', req),
  },
  lt: {
    check: (req) => call('lt:check', req),
  },
  shell: {
    reveal: (p) => call('shell:reveal', p),
    external: (url) => call('shell:external', url),
  },
  win: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    fullscreen: () => ipcRenderer.send('window:fullscreen'),
    nativeTheme: (mode) => ipcRenderer.send('theme:native', mode),
    onState: (cb) => ipcRenderer.on('window:state', (_e, s) => cb(s)),
  },
  platform: process.platform,
});
