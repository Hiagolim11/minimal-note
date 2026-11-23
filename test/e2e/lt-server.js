// Servidor LanguageTool falso em :47124 para o teste da revisão gramatical.
// Marca "Fui a praia" (crase) e conta quantos pedidos chegaram; código e links chegam como markup.
const http = require('http');
let requests = 0, sawCodeAsText = false;
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.method !== 'POST' || !req.url.endsWith('/v2/check')) { res.writeHead(404); res.end(); return; }
    requests++;
    const p = new URLSearchParams(body);
    const items = JSON.parse(p.get('data')).annotation;
    if (items.some((i) => i.text != null && i.text.includes('codigoSecreto'))) sawCodeAsText = true;
    const full = items.map((i) => i.text ?? i.markup).join('');
    const matches = [];
    let at = full.indexOf('Fui a praia');
    while (at >= 0) {
      matches.push({
        offset: at + 4, length: 1, message: 'Use crase antes de palavra feminina.', shortMessage: 'Crase',
        replacements: [{ value: 'à' }], rule: { id: 'CRASE_TESTE', issueType: 'grammar', category: { name: 'Gramática' } },
      });
      at = full.indexOf('Fui a praia', at + 1);
    }
    // um erro de ortografia que deve ser descartado (fica com o Hunspell)
    matches.push({ offset: 0, length: 2, message: 'x', replacements: [], rule: { id: 'TYPO', issueType: 'misspelling' } });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ matches, language: p.get('language') }));
  });
}).listen(47124);
setTimeout(() => { console.log(`[js] lt-server: ${requests} pedidos, código como texto: ${sawCodeAsText}`); srv.close(); process.exit(0); }, 45000);
