const test = require('node:test');
const assert = require('node:assert/strict');
global.SpellText = require('../../src/js/spell-text.js'); // ignora código e links como o app
const L = require('../../src/js/linksuggest.js');

const targets = [{ path: 'Orçamento.md', name: 'Orçamento' }, { path: 'Cliente X.md', name: 'Cliente X' }, { path: 'Ideias.md', name: 'Ideias' }, { path: 'Ana.md', name: 'Ana' }];

test('mentions: acha o nome sem acento/maiúscula, com limite de palavra; ignora links, código e palavras comuns', () => {
  const text = 'Falei com o cliente x sobre o orcamento. Já existe [[Orçamento]] e `Cliente X` no código. Banana não é Ana? Muitas ideias.';
  const m = L.mentions(text, targets);
  assert.deepEqual(m.map((x) => [x.name, x.text]), [['Cliente X', 'cliente x'], ['Orçamento', 'orcamento'], ['Ana', 'Ana']]);
  // "Banana" não conta como "Ana" e "ideias" é palavra comum
});

test('linkAt: mantém a grafia do texto como apelido', () => {
  const text = 'Falei com o cliente x hoje';
  const [m] = L.mentions(text, targets);
  assert.equal(L.linkAt(text, m), 'Falei com o [[Cliente X|cliente x]] hoje');
  const t2 = 'Veja o Orçamento.';
  assert.equal(L.linkAt(t2, L.mentions(t2, targets)[0]), 'Veja o [[Orçamento]].');
});

test('similar: notas com as mesmas palavras e tags vêm primeiro', () => {
  const notes = [
    { path: 'a', content: 'receita de bolo de cenoura com farinha e ovos', tags: ['comida'] },
    { path: 'b', content: 'bolo de chocolate: farinha, ovos, açúcar e cacau', tags: ['comida'] },
    { path: 'c', content: 'reunião sobre orçamento do projeto com o cliente', tags: ['trabalho'] },
    { path: 'd', content: 'cenoura cozida no vapor, receita rápida', tags: [] },
  ];
  const r = L.similar(notes[0], notes).map((x) => x.note.path);
  assert.equal(r[0], 'b');
  assert.ok(r.includes('d'));
  assert.ok(!r.includes('c'));
  assert.deepEqual(L.similar(notes[0], notes, { exclude: new Set(['b']) }).map((x) => x.note.path), ['d']);
});
