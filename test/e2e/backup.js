// Backup no PC: o automático roda depois de abrir o cofre; o manual também; guarda só os 7 últimos.
// Rodar com LUMEN_BACKUP_DIR=<pasta> LUMEN_BACKUP_DELAY=3000 (o conteúdo do .zip é conferido depois, pelo all.sh)
const sleep = (ms) => `await new Promise((r) => setTimeout(r, ${ms}))`;
module.exports = [
  { wait: 300, js: `(async () => { window.__bk = []; lumen.vault.onBackup((r) => __bk.push(r.files));
      await lumen.fs.write('Pasta/Ação.md', 'conteúdo com ç'); await lumen.fs.write('.minimal-note/historico/Pasta/Ação.md.json', '[]');
      await lumen.fs.write('Lixo.md', 'x'); await lumen.fs.remove('Lixo.md'); return 'pronto'; })()` },
  { wait: 4000 },
  { js: `'automático: ' + JSON.stringify(__bk)` },
  { js: `(async () => { const n = []; for (let i = 0; i < 8; i++) { n.push((await lumen.vault.backup()).files); ${sleep(1100)} } return 'manuais: ' + n.length; })()` },
  { js: `(async () => { await backupVault(); ${sleep(300)}; return 'aviso: ' + [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '); })()` },
];
