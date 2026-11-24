const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');

const el = { addEventListener() {}, after() {}, setAttribute() {} };
const { Conflicts: C } = load(['src/js/conflicts.js'], {
  document: { createElement: () => ({ ...el }), querySelector: () => el, getElementById: () => el },
  refreshVault: async () => {}, S: { notes: new Map() },
});
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);

test('reconhece as cópias em conflito do Syncthing, Dropbox e Nextcloud', () => {
  eq(C.parse('Projetos/Plano.sync-conflict-20261124-101530-ABC1234.md'), { orig: 'Projetos/Plano.md', tool: 'Syncthing', when: '24/11 10:15' });
  eq(C.parse('Plano (conflicted copy 2026-11-24).md'), { orig: 'Plano.md', tool: 'Dropbox/Nextcloud', when: '' });
  eq(C.parse('a/Plano (Ana\'s conflicted copy 2026-11-24 101530).md'), { orig: 'a/Plano.md', tool: 'Dropbox/Nextcloud', when: '' });
  eq(C.parse('Plano (Cópia em conflito de PC 2026-11-24).md'), { orig: 'Plano.md', tool: 'Dropbox', when: '' });
});

test('não confunde nomes comuns com conflito', () => {
  for (const p of ['Plano.md', 'Plano (1).md', 'Plano (cópia).md', 'Reunião sync.md', 'conflito.md', 'Plano.sync-conflict.md']) assert.equal(C.parse(p), null, p);
});

test('of: só as cópias da própria nota', () => {
  const paths = ['Plano.md', 'Plano.sync-conflict-20261124-101530-ABC1234.md', 'Outra.sync-conflict-20261124-101530-ABC1234.md', 'x/Plano.sync-conflict-20261124-101530-ABC1234.md'];
  eq(C.of('Plano.md', paths).map((c) => c.path), ['Plano.sync-conflict-20261124-101530-ABC1234.md']);
});
