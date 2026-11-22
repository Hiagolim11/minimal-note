// Fechar a janela grava a posição/tamanho (rodar e conferir settings.json no perfil temporário).
module.exports = [
  { wait: 500, size: [900, 640] },
  { wait: 300, js: `S.settings.theme = 'nord'; lumen.settings.set(S.settings).then(() => 'tema salvo')` },
  { js: `setTimeout(() => lumen.win.close(), 50); 'fechando'`, wait: 3000 },
];
