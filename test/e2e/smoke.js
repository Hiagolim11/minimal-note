// Roteiro de fumaça para o modo de teste (LUMEN_TEST_SCRIPT). Cada passo `js` imprime [js] <resultado>.
module.exports = [
  { wait: 500, js: `JSON.stringify({ vault: S.vault?.name, notes: [...S.notes.keys()].sort() })` },
  { keys: 'ctrl+n', wait: 600 },
  { type: 'Teste\n', wait: 600 },
  { type: 'corpo [[Bem-vindo]] #tag\n', wait: 2000, js: `JSON.stringify({ path: activeTab()?.path, pending: S.pending.size, content: activeNote()?.content })` },
  { keys: 'ctrl+e', wait: 800, js: `JSON.stringify({ links: document.querySelectorAll('#preview a.wikilink').length, tags: document.querySelectorAll('#preview a.tag').length })` },
  { shot: 'smoke' },
];
