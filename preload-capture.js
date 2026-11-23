// Ponte da janela de captura rápida: só salva o texto e fecha
const { contextBridge, ipcRenderer } = require('electron');

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

contextBridge.exposeInMainWorld('capture', {
  save: (text, mode) => call('capture:save', { text, mode }),
  close: () => call('capture:close'),
});
