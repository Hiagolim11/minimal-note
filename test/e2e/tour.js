// Passa por todas as telas (paleta, grafo, cada seção das configurações, busca, nota diária, exportação)
// para pegar erros de referência entre os arquivos app-*.js. Erros aparecem como [renderer]/[js-error].
module.exports = [
  { wait: 300, js: `window.__errs = []; addEventListener('error', (e) => __errs.push(e.message)); addEventListener('unhandledrejection', (e) => __errs.push(String(e.reason))); 'ok'` },
  { keys: 'ctrl+p', wait: 500, js: `JSON.stringify({ paleta: !$('#palette').hidden, itens: $$('#palette-list .pl-item').length })` },
  { keys: 'Escape', wait: 300 },
  { keys: 'ctrl+g', wait: 1200, js: `activeTab()?.kind` },
  { shot: 'tour-graph' },
  { keys: 'ctrl+shift+D', wait: 800, js: `activeTab()?.path` },
  { wait: 300, js: `(async () => { for (const id of ['appearance','creator','effects','typography','editor','vault','css','keys','about']) { openSettings(id); await new Promise(r => setTimeout(r, 150)); if (!document.querySelector('#settings-content, .settings-content, .set-group, h2')) return 'vazio: ' + id; } return 'seções ok'; })()` },
  { shot: 'tour-settings' },
  { wait: 300, js: `closeSettings(); 'fechado'` },
  { keys: 'ctrl+shift+F', wait: 300 },
  { type: 'Minimal', wait: 800 }, // a busca tem debounce, e `js` roda antes do `wait`: confere no passo seguinte
  { js: `$('#search-results').children.length > 0 ? 'busca ok' : 'busca vazia'` },
  { wait: 300, js: `openNote('Bem-vindo.md'); setMode('split'); 'split ' + activeTab().mode` },
  { wait: 800, js: `(async () => { await exportHtml(); return 'exportHtml ok'; })().catch((e) => 'exportHtml ERRO ' + e.message)` },
  { wait: 800, js: `JSON.stringify(window.__errs)` },
  { shot: 'tour-split' },
];
