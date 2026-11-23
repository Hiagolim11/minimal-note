const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../../src/js/search.js');

const DAY = 86400000, NOW = new Date(2026, 10, 23, 15, 0).getTime();
const notes = [
  { path: 'Projetos/Roadmap.md', name: 'Roadmap', content: '# Roadmap\nLançar a versão de exemplo.\n- [ ] revisar orçamento\n- [x] contratar designer', tags: ['trabalho'], mtime: NOW - 2 * 3600e3, ctime: NOW - 40 * DAY },
  { path: 'Diário/2026-11-20.md', name: '2026-11-20', content: 'Hoje fui à praia com a família. #viagem/verão', tags: ['viagem/verão'], mtime: NOW - 3 * DAY, ctime: NOW - 3 * DAY },
  { path: 'Receitas/Bolo.md', name: 'Bolo', content: 'Bolo de cenoura: farinha, ovos, açúcar.\n- [ ] comprar ovos', tags: ['comida'], mtime: NOW - 20 * DAY, ctime: NOW - 20 * DAY },
  { path: 'Ideias.md', name: 'Ideias', content: 'Um app de notas com informação organizada.', tags: [], mtime: NOW - 60 * DAY, ctime: NOW - 90 * DAY },
];
const names = (q) => Q.run(notes, q, { now: NOW }).results.map((r) => r.note.name);

test('termos: sem acento, com erro de digitação e no título', () => {
  assert.deepEqual(names('orcamento'), ['Roadmap']);        // sem acento
  assert.deepEqual(names('exenplo'), ['Roadmap']);          // erro de digitação
  assert.deepEqual(names('infromação'), ['Ideias']);        // letras trocadas
  assert.deepEqual(names('bolo'), ['Bolo']);
  assert.deepEqual(names('bolo ovos'), ['Bolo']);           // todos os termos
  assert.deepEqual(names('bolo praia'), []);
});

test('filtros: tag, pasta, nome, frase exata e exclusão', () => {
  assert.deepEqual(names('#viagem'), ['2026-11-20']);       // inclui subtag viagem/verão
  assert.deepEqual(names('tag:comida'), ['Bolo']);
  assert.deepEqual(names('pasta:projetos'), ['Roadmap']);
  assert.deepEqual(names('nome:road'), ['Roadmap']);
  assert.deepEqual(names('"bolo de cenoura"'), ['Bolo']);
  assert.deepEqual(names('"cenoura de bolo"'), []);
  assert.deepEqual(names('ovos -cenoura'), []);
});

test('tarefas e datas', () => {
  assert.deepEqual(names('tarefa:pendente').sort(), ['Bolo', 'Roadmap']);
  assert.deepEqual(names('tarefa:feita'), ['Roadmap']);
  const r = Q.run(notes, 'tarefa:pendente pasta:receitas', { now: NOW }).results[0];
  assert.deepEqual(r.tasks.map((t) => t.text), ['- [ ] comprar ovos']);
  assert.deepEqual(names('editada:hoje'), ['Roadmap']);
  assert.deepEqual(names('editada:semana').sort(), ['2026-11-20', 'Roadmap']);
  assert.deepEqual(names('criada:2026-11'), ['2026-11-20', 'Bolo']);
});

test('ordem: título e quantidade de ocorrências pesam mais', () => {
  const extra = [...notes, { path: 'Bolos/Bolo de chocolate.md', name: 'Bolo de chocolate', content: 'bolo bolo bolo', tags: [], mtime: NOW, ctime: NOW }];
  const r = Q.run(extra, 'bolo', { now: NOW }).results.map((x) => x.note.name);
  assert.equal(r[0], 'Bolo de chocolate');
});

test('trechos: marcas nas posições certas do texto original', () => {
  const n = notes[0];
  const r = Q.run(notes, 'orcamento', { now: NOW }).results[0];
  const [snip] = Q.snippets(n.content, r.marks);
  const [a, b] = snip.marks[0];
  assert.equal(snip.text.slice(a, b), 'orçamento');
  assert.equal(n.content.slice(r.marks[0][0], r.marks[0][1]), 'orçamento');
});
