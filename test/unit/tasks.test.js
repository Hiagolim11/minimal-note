const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../src/js/tasks.js');

test('parse: tarefas com e sem data, feitas, ignora blocos de código', () => {
  const src = '# x\n- [ ] ligar 📅 2026-11-25\n  - [x] subtarefa ✅ 2026-11-20\n* [ ] pagar @2026-11-01\n1. [ ] ler due:2026-12-01\n```\n- [ ] não é tarefa\n```\ntexto - [ ] não';
  const t = T.parse(src);
  assert.deepEqual(t.map((x) => [x.line, x.done, x.text, x.due]), [
    [1, false, 'ligar', '2026-11-25'], [2, true, 'subtarefa', null], [3, false, 'pagar', '2026-11-01'], [4, false, 'ler', '2026-12-01'],
  ]);
});

test('bucket: atrasada, hoje, próximos 7 dias, depois, sem data, feita', () => {
  const today = '2026-11-23';
  const b = (due, done = false) => T.bucket({ due, done }, today);
  assert.equal(b('2026-11-22'), 'overdue');
  assert.equal(b('2026-11-23'), 'today');
  assert.equal(b('2026-11-30'), 'soon');
  assert.equal(b('2026-12-05'), 'later');
  assert.equal(b(null), 'none');
  assert.equal(b('2026-11-22', true), 'done');
});

test('toggleLine: conclui com data e desfaz sem perder o texto', () => {
  const done = T.toggleLine('  - [ ] ligar 📅 2026-11-25', '2026-11-23');
  assert.equal(done, '  - [x] ligar 📅 2026-11-25 ✅ 2026-11-23');
  assert.equal(T.toggleLine(done), '  - [ ] ligar 📅 2026-11-25');
  assert.equal(T.toggleLine('texto qualquer'), 'texto qualquer');
});

test('quickDate: hoje, amanhã, dia da semana, +Nd', () => {
  const now = new Date(2026, 10, 23); // segunda
  assert.equal(T.quickDate('hoje', now), '2026-11-23');
  assert.equal(T.quickDate('amanhã', now), '2026-11-24');
  assert.equal(T.quickDate('sexta', now), '2026-11-27');
  assert.equal(T.quickDate('segunda-feira', now), '2026-11-30'); // próxima segunda, não hoje
  assert.equal(T.quickDate('+10d', now), '2026-12-03');
  assert.equal(T.quickDate('qualquer', now), null);
});
