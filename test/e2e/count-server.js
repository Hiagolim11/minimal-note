// Servidor de teste: :47123 serve uma imagem de 1px e anota cada acesso; ao sair imprime os acessos.
const http = require('http');
const hits = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const srv = http.createServer((req, res) => { hits.push(req.url); res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }).listen(47123);
let last = 0;
setInterval(() => { if (hits.length !== last) { last = hits.length; console.log('[js] servidor recebeu: ' + JSON.stringify(hits)); } }, 300);
setTimeout(() => { console.log('[js] total de acessos: ' + hits.length); srv.close(); process.exit(0); }, 16000);
