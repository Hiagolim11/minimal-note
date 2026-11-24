// Barreira de conteúdo remoto na renderização (no Android é a única; no desktop o processo
// principal também bloqueia). Com a opção desligada, nenhum elemento da nota pode ter endereço
// remoto (sem endereço, o navegador não tem o que baixar); ligada, as imagens voltam.
const U = 'http://127.0.0.1:47123';
const note = `# Remota\n\n![foto](${U}/a.png)\n\n<img src="${U}/b.png" srcset="${U}/c.png 2x">\n\n<div style="background:url(${U}/d.png)">fundo</div>\n\n<video poster="${U}/e.png" src="${U}/f.mp4"></video>\n\n![local](data:image/png;base64,iVBORw0KGgo=)\n`;
const remotos = String.raw`[...document.querySelectorAll('#preview *')].flatMap((e) => ['src', 'srcset', 'poster', 'style'].map((a) => e.getAttribute(a) || '')).filter((v) => /(^|url\(\s*['"]?)(https?:)?\/\//.test(v)).length`;
module.exports = [
  { wait: 800, js: `(async () => { await lumen.fs.write('Remota.md', ${JSON.stringify(note)}); await refreshVault(); openNote('Remota.md'); setMode('preview'); return 'aberta, opção=' + S.settings.remoteImages; })()` },
  { wait: 1000, js: `JSON.stringify({ remotos: ${remotos}, links: [...document.querySelectorAll('#preview a.remote-img')].map((a) => a.textContent), local: !!document.querySelector('#preview img[src^="data:"]') })` },
  { wait: 300, js: `(() => { S.settings.remoteImages = true; renderPreview(); return 'liberado'; })()` },
  { wait: 800, js: `JSON.stringify({ imagensRemotas: document.querySelectorAll('#preview img[src^="http"]').length, linksBloqueio: document.querySelectorAll('#preview a.remote-img').length })` },
];
