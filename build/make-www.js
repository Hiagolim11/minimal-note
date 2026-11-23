// Gera a pasta www/ usada pelo Capacitor (Android) a partir de src/.
// - copia a interface;
// - copia as dependências do navegador (marked, DOMPurify, fontes) para www/vendor;
// - troca os caminhos ../node_modules/... por vendor/...;
// - injeta a ponte do Android antes dos outros scripts.
// Uso: node build/make-www.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const out = path.join(root, 'www');
const nm = path.join(root, 'node_modules');

// bibliotecas (src/vendor: corretor, KaTeX, Mermaid) antes de copiar a interface
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'make-vendor.js')], { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });

const vendor = [
  ['marked/lib/marked.umd.js', 'marked/marked.umd.js'],
  ['dompurify/dist/purify.min.js', 'dompurify/purify.min.js'],
  // runtime JS do Capacitor: cria os proxies Capacitor.Plugins.* (registerPlugin) a partir
  // dos PluginHeaders que o app nativo injeta. Sem ele nenhum plugin nativo fica acessível.
  ['@capacitor/core/dist/capacitor.js', 'capacitor/capacitor.js'],
];
for (const f of ['inter', 'outfit', 'lora', 'jetbrains-mono']) {
  vendor.push([`@fontsource-variable/${f}/index.css`, `fonts/${f}/index.css`]);
  vendor.push([`@fontsource-variable/${f}/files`, `fonts/${f}/files`]);
}
for (const [from, to] of vendor) {
  const a = path.join(nm, from), b = path.join(out, 'vendor', to);
  if (!fs.existsSync(a)) { console.error('Faltando:', a, '— rode "npm install".'); process.exit(1); }
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.cpSync(a, b, { recursive: true });
}

const htmlFile = path.join(out, 'index.html');
let html = fs.readFileSync(htmlFile, 'utf8');
html = html
  .replace('../node_modules/marked/lib/marked.umd.js', 'vendor/marked/marked.umd.js')
  .replace('../node_modules/dompurify/dist/purify.min.js', 'vendor/dompurify/purify.min.js')
  .replace(/\.\.\/node_modules\/@fontsource-variable\/([\w-]+)\/index\.css/g, 'vendor/fonts/$1/index.css');
if (html.includes('node_modules')) { console.error('Ainda há referências a node_modules em www/index.html'); process.exit(1); }
// a ponte do Android precisa existir antes de qualquer script do app
html = html.replace('<script src="vendor/marked/marked.umd.js"></script>', '<script src="vendor/capacitor/capacitor.js"></script>\n  <script src="js/android-bridge.js"></script>\n  <script src="vendor/marked/marked.umd.js"></script>');
if (!html.includes('vendor/capacitor/capacitor.js')) { console.error('Não foi possível injetar o runtime do Capacitor'); process.exit(1); }
// viewport para celular: sem zoom acidental, área segura (notch/barra de gestos)
html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">');
fs.writeFileSync(htmlFile, html);

const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`www/ gerado (${count(out)} arquivos)`);
