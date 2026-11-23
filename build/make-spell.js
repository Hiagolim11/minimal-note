// Prepara o corretor ortográfico em src/vendor/spell/ (gerado; fora do git):
// - hunspell.js: o Hunspell compilado para WebAssembly (pacote hunspell-asm, wasm embutido);
// - pt-BR.js: o dicionário VERO (pacote dictionary-pt) como texto JS, para o worker carregar
//   com importScripts (fetch de file:// não funciona no Electron e a CSP bloqueia conexões).
// Uso: node build/make-spell.js   (roda sozinho antes de npm start, das builds e do www/)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'src', 'vendor', 'spell');

const files = {
  wasm: path.join(nm, 'hunspell-asm', 'dist', 'cjs', 'lib', 'browser', 'hunspell.js'),
  aff: path.join(nm, 'dictionary-pt', 'index.aff'),
  dic: path.join(nm, 'dictionary-pt', 'index.dic'),
  license: path.join(nm, 'dictionary-pt', 'license'),
};
for (const f of Object.values(files)) {
  if (!fs.existsSync(f)) { console.error('Faltando:', f, '— rode "npm install".'); process.exit(1); }
}

fs.mkdirSync(out, { recursive: true });
const newer = (target, ...sources) => fs.existsSync(target) && sources.every((s) => fs.statSync(s).mtimeMs <= fs.statSync(target).mtimeMs);

const wasmOut = path.join(out, 'hunspell.js');
if (!newer(wasmOut, files.wasm)) fs.copyFileSync(files.wasm, wasmOut);

const dictOut = path.join(out, 'pt-BR.js');
if (!newer(dictOut, files.aff, files.dic)) {
  const aff = fs.readFileSync(files.aff, 'utf8'), dic = fs.readFileSync(files.dic, 'utf8');
  fs.writeFileSync(dictOut, `// Dicionário VERO (pt-BR) — LGPL-3.0 ou MPL-2.0. Gerado por build/make-spell.js.\nself.SPELL_DICT = { aff: ${JSON.stringify(aff)}, dic: ${JSON.stringify(dic)} };\n`);
}
fs.copyFileSync(files.license, path.join(out, 'LICENSE-dictionary-pt.txt'));
console.log('corretor ortográfico pronto em src/vendor/spell');
