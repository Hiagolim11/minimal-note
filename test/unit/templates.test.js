const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');

// templates.js envolve o openVault do app (cria os modelos na 1ª abertura do cofre): aqui basta um stub
const { Templates: T } = load(['src/js/templates.js'], { document: { addEventListener() {} }, openVault: async () => {} });
const D = new Date(2026, 10, 23, 9, 5); // segunda-feira, 23/11/2026 09:05

test('espaços automáticos: título, datas, hora, dia da semana, cursor', () => {
  const { text, cursor } = T.apply('# {{título}}\n{{data}} · {{data:DD/MM/YYYY}} · {{hora}} · {{dia_semana}}\nAmanhã: {{amanhã}} Ontem: {{ontem}}\n{{cursor}}fim', { title: 'Reunião X', date: D });
  assert.equal(text, '# Reunião X\n2026-11-23 · 23/11/2026 · 09:05 · segunda-feira\nAmanhã: 2026-11-24 Ontem: 2026-11-22\nfim');
  assert.equal(text.slice(cursor), 'fim');
});

test('formato com texto fixo e nomes de mês/dia; chaves sem acento também valem', () => {
  assert.equal(T.formatDate(D, 'dddd, DD [de] MMMM [de] YYYY'), 'segunda-feira, 23 de novembro de 2026');
  assert.equal(T.apply('{{titulo}} {{ Data : YYYY }}', { title: 'A', date: D }).text, 'A 2026');
  assert.equal(T.apply('{{desconhecido}}', { date: D }).text, '{{desconhecido}}');
  assert.equal(T.apply('sem cursor', { date: D }).cursor, -1);
});

test('modelos de exemplo: todos aplicam sem sobrar {{ }}', () => {
  for (const [name, body] of Object.entries(T.DEFAULTS)) {
    const { text, cursor } = T.apply(body, { title: name + ' teste', date: D });
    assert.ok(!/\{\{/.test(text), name);
    assert.ok(cursor >= 0, name + ' sem cursor');
  }
});
