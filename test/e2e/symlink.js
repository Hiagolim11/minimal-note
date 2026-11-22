// Links simbólicos no cofre não podem expor nem sobrescrever arquivos de fora.
// Rodar com: bash test/e2e/run.sh test/e2e/symlink.js 'sleep 3; echo segredo > "$VAULT/../fora.txt"; ln -s ../fora.txt "$VAULT/link.md"; ln -s .. "$VAULT/pasta-link"; mkdir -p "$VAULT/sub"'
module.exports = [
  { wait: 4000 },
  { wait: 300, js: `refreshVault().then(() => JSON.stringify({ notas: [...S.notes.keys()].sort(), arvore: S.tree.map((t) => t.name) }))` },
  { wait: 300, js: `lumen.fs.read('link.md').then(() => 'LEU O LINK', (e) => 'recusado: ' + e.message)` },
  { wait: 300, js: `lumen.fs.write('link.md', 'sobrescrito').then(() => 'ESCREVEU NO LINK', (e) => 'recusado: ' + e.message)` },
  { wait: 300, js: `lumen.fs.write('pasta-link/novo.md', 'x').then(() => 'ESCREVEU PELA PASTA-LINK', (e) => 'recusado: ' + e.message)` },
  { wait: 300, js: `lumen.fs.write('sub/nova/ok.md', 'ok').then(() => 'escrita normal em subpasta nova: ok', (e) => 'ERRO ' + e.message)` },
  { wait: 300, js: `lumen.fs.read('sub/nova/ok.md')` },
];
