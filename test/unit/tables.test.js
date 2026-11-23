const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../src/js/tables.js');

test('cells: divide respeitando \\| e código', () => {
  assert.deepEqual(T.cells('| a | b \\| c | `x | y` |'), ['a', 'b \\| c', '`x | y`']);
  assert.deepEqual(T.cells('a | b'), ['a', 'b']);
});

test('format: alinha colunas, completa células e mantém o alinhamento do separador', () => {
  const out = T.format(['| Nome | Idade |', '|:-|-:|', '| Ana | 7 |', '| Bartolomeu |']);
  assert.deepEqual(out, [
    '| Nome       | Idade |',
    '| :--------- | ----: |',
    '| Ana        |     7 |',
    '| Bartolomeu |       |',
  ]);
  // acentos contam como uma letra
  const acc = T.format(['| ação | x |', '| --- | --- |', '| a | b |']);
  assert.equal(acc[0].length, acc[2].length);
});

test('cellStarts e template', () => {
  const line = '| ab | cd |';
  assert.deepEqual(T.cellStarts(line).map((i) => line.slice(i, i + 2)), ['ab', 'cd']);
  const t = T.template(2, 1);
  assert.equal(t.length, 3);
  assert.match(t[0], /^\| Coluna 1 \| Coluna 2 \|$/);
  assert.match(t[1], /^\| -+ \| -+ \|$/);
});
