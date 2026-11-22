// Simula um renderer comprometido: não deve conseguir trocar o cofre para "/" nem sair da interface.
module.exports = [
  { wait: 300, js: `lumen.vault.open('/').then(() => 'ABERTO /', (e) => 'recusado: ' + e.message)` },
  { wait: 300, js: `lumen.settings.set({ ...S.settings, vaultPath: '/' }).then(() => lumen.settings.get()).then((s) => 'vaultPath salvo = ' + s.vaultPath)` },
  { wait: 300, js: `lumen.vault.open('/').then(() => 'ABERTO /', (e) => 'recusado após settings:set: ' + e.message)` },
  { wait: 300, js: `lumen.vault.open(S.vault.root).then((v) => 'reabrir cofre salvo ok: ' + v.name, (e) => 'ERRO ' + e.message)` },
  { wait: 300, js: `lumen.fs.read('../../../../../../etc/hostname').then(() => 'LEU FORA', (e) => 'recusado: ' + e.message)` },
  { wait: 1500, js: `location.href = 'file:///etc/hostname'; 'navegando'` },
  { js: `location.pathname.endsWith('/index.html') + ' ' + typeof S` },
];
