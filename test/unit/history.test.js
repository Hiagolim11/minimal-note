const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');

// history.js envolve writeNote e renamePath do app: aqui bastam stubs
const { History: H } = load(['src/js/history.js'], { writeNote: async () => {}, renamePath: async () => {} });
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const DAY = 86400000, NOW = 1000 * DAY;

test('prune: tira versões velhas demais, guarda no máximo N e respeita o limite de bytes', () => {
  const lim = { max: 3, bytes: 25, age: 30 * DAY };
  const v = (d, c) => ({ t: NOW - d * DAY, content: c });
  eq(H.prune([v(40, 'velha'), v(5, 'a'), v(4, 'b'), v(3, 'c'), v(2, 'd')], NOW, lim).map((x) => x.content), ['b', 'c', 'd']);
  eq(H.prune([v(3, 'x'.repeat(20)), v(2, 'y'.repeat(10)), v(1, 'z'.repeat(10))], NOW, lim).map((x) => x.content[0]), ['y', 'z']);
  // a mais recente fica mesmo se sozinha passar do limite
  eq(H.prune([v(1, 'w'.repeat(100))], NOW, lim).length, 1);
});

test('lineDiff conta linhas a mais e a menos', () => {
  eq(H.lineDiff('a\nb\nc', 'a\nc\nd\ne'), { add: 2, del: 1 });
  eq(H.lineDiff('x', 'x'), { add: 0, del: 0 });
});
