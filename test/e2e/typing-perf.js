// Custo por tecla numa nota longa (gerada pelo comando de fundo): input → realce, autosize, análise.
module.exports = [
  { wait: 4000, js: `refreshVault().then(() => { openNote('Longa.md'); setMode('edit'); editor.ta.focus(); editor.ta.setSelectionRange(5, 5); return 'chars=' + editor.value.length; })` },
  { wait: 500, js: `(() => { const t = []; for (let i = 0; i < 15; i++) { const a = performance.now(); editor.ta.setRangeText('x', editor.ta.selectionStart, editor.ta.selectionStart, 'end'); editor.ta.dispatchEvent(new Event('input')); t.push(performance.now() - a); } const p = (q) => t.slice().sort((x, y) => x - y)[Math.floor(q * (t.length - 1))].toFixed(1); return 'ms por tecla: mediana=' + p(0.5) + ' p90=' + p(0.9); })()` },
  { wait: 300, js: `(() => { const a = performance.now(); editor.highlight(); const b = performance.now(); editor.autosize(); const c = performance.now(); return 'highlight=' + (b - a).toFixed(1) + 'ms autosize=' + (c - b).toFixed(1) + 'ms'; })()` },
];
