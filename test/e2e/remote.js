// Imagens remotas: bloqueadas por padrão, liberadas pela opção. Usa um servidor local que conta acessos.
// Rodar com: bash test/e2e/run.sh test/e2e/remote.js 'node test/e2e/count-server.js'
const note = `# Remota\n\n![x](http://127.0.0.1:47123/a.png)\n\n<img src="http://127.0.0.1:47123/b.png">\n\n<div style="background:url(http://127.0.0.1:47123/c.png)">bg</div>\n`;
module.exports = [
  { wait: 800, js: `lumen.fs.write('Remota.md', ${JSON.stringify(note)}).then(() => refreshVault()).then(() => openNote('Remota.md')).then(() => setMode('preview'), (e) => 'ERRO ' + e.message)` },
  { wait: 1500, js: `'--- fim da fase bloqueada ---'` },
  { wait: 300, js: `S.settings.remoteImages = true; lumen.settings.set(S.settings).then(() => renderPreview()).then(() => 'liberado')` },
  { wait: 1500, js: `'feito'` },
];
