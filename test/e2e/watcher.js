// Escritas do próprio app não devem gerar aviso de "cofre mudou"; escritas externas sim.
// Rodar com: bash test/e2e/run.sh test/e2e/watcher.js 'sleep 12; echo "linha externa" >> "$VAULT/Bem-vindo.md"'
// Atenção: num passo, `js` roda ANTES do `wait`.
module.exports = [
  { wait: 500, js: `window.__chg = 0; lumen.vault.onChange(() => window.__chg++); 'ok'` },
  { keys: 'ctrl+n', wait: 600 },
  { type: 'Digitar\n', wait: 600 },
  { type: 'um texto qualquer\n', wait: 2500 },
  { wait: 6000, js: `JSON.stringify({ selfChanges: window.__chg })` },
  { js: `JSON.stringify({ externalChanges: window.__chg, welcomeHasLine: S.notes.get('Bem-vindo.md')?.content.includes('linha externa') })` },
];
