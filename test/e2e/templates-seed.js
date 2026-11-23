// Modelos criados já na primeira abertura do cofre (uma vez só) e fora do grafo.
module.exports = [
  { wait: 800, js: `JSON.stringify({ modelos: Templates.list().map((n) => n.name), marcado: (S.settings.templatesSeeded || []).includes(S.vault.root), avisos: [...document.querySelectorAll('.toast')].map((t) => t.innerText) })` },
  { js: `(() => { addTab({ kind: 'graph' }); return 'grafo'; })()`, wait: 1200 },
  { js: `JSON.stringify({ noGrafo: S.graph.nodes.filter((n) => n.id.startsWith('Modelos/')).length, notas: document.getElementById('graph-stats').textContent })` },
  // apagar a pasta e reabrir o cofre: não recria
  { js: `(async () => { for (const n of Templates.list()) await lumen.fs.remove(n.path); await refreshVault(); await openVault(S.vault.root); await new Promise((r) => setTimeout(r, 500)); return 'depois de apagar e reabrir: ' + Templates.list().length; })()` },
];
