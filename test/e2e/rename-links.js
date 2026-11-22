// Renomear uma nota atualiza só os links que apontam para ELA (não para outra nota de mesmo nome),
// inclusive links com caminho; renomear pasta atualiza os links com caminho.
// Rodar com: bash test/e2e/run.sh test/e2e/rename-links.js "sleep 1; $(cat test/e2e/rename-links.setup)"
const read = `Promise.all(['A/ref.md', 'B/ref.md', 'raiz.md'].map((p) => lumen.fs.read(p).catch(() => lumen.fs.read(p.replace(/^A\\//, 'C/'))))).then((c) => JSON.stringify(c))`;
module.exports = [
  { wait: 300, js: `refreshVault().then(() => renamePath('A/Nota.md', 'A/Nova.md')).then(() => 'renomeado')` },
  { wait: 2000 }, // salvamento automático dos links atualizados
  { js: read },
  { wait: 300, js: `renamePath('A', 'C', true).then(() => 'pasta renomeada')` },
  { wait: 2000 },
  { js: read },
];
