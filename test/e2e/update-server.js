// GitHub falso em :47125 para o teste de atualizações: responde como a API de "última release".
const http = require('http');
let hits = 0;
const srv = http.createServer((req, res) => {
  hits++;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ tag_name: 'v9.9.9', name: 'Minimal Note 9.9.9', html_url: 'https://github.com/Hiagolim11/minimal-note/releases/tag/v9.9.9' }));
}).listen(47125);
setTimeout(() => { console.log(`[js] update-server: ${hits} consultas`); srv.close(); process.exit(0); }, 30000);
