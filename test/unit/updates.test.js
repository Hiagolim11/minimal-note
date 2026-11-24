const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');

const { Updates: U } = load(['src/js/updates.js'], { setTimeout: () => 0 });

test('compara versões número a número (1.10 é mais nova que 1.9)', () => {
  assert.equal(U.newer('1.9.4', '1.9.3'), true);
  assert.equal(U.newer('1.10.0', '1.9.3'), true);
  assert.equal(U.newer('2.0', '1.99.99'), true);
  assert.equal(U.newer('1.9.3', '1.9.3'), false);
  assert.equal(U.newer('1.9.2', '1.9.3'), false);
  assert.equal(U.newer('1.9', '1.9.0'), false);
  assert.equal(U.newer('', '1.0.0'), false);
});
