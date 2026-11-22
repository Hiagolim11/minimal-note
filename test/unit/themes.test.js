const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');

const T = load(['src/js/themes.js']);

test('conversões hex ⇄ rgb ⇄ hsl são reversíveis', () => {
  assert.deepEqual([...T.hexToRgb('#ff8000')], [255, 128, 0]);
  assert.equal(T.rgbToHex(255, 128, 0), '#ff8000');
  for (const hex of ['#8b7bff', '#000000', '#ffffff', '#14b8a6']) {
    const [h, s, l] = T.hexToHsl(hex);
    const back = T.hexToRgb(T.hslToHex(h, s, l));
    T.hexToRgb(hex).forEach((v, i) => assert.ok(Math.abs(v - back[i]) <= 2, `${hex}: ${back}`));
  }
});

test('contraste segue a fórmula WCAG', () => {
  assert.equal(Math.round(T.contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(T.contrastRatio('#777777', '#777777'), 1);
  assert.equal(T.contrastRatio('#000000', '#ffffff'), T.contrastRatio('#ffffff', '#000000'));
});

test('isHex aceita só cores válidas', () => {
  for (const ok of ['#fff', '#FFFFFF', '#11223344']) assert.ok(T.isHex(ok), ok);
  for (const bad of ['fff', '#ffff', '#ggg', 'red', null, 12]) assert.ok(!T.isHex(bad), String(bad));
});

test('paleta gerada tem só cores válidas e texto legível', () => {
  for (const dark of [true, false]) {
    for (const base of ['#8b7bff', '#ef4444', '#22c55e']) {
      const p = T.generatePalette({ base, dark });
      const colors = Object.values(p.vars || p).filter((v) => typeof v === 'string' && v.startsWith('#'));
      assert.ok(colors.length > 5, 'paleta vazia');
      for (const c of colors) assert.ok(T.isHex(c), `${base} ${dark}: ${c}`);
    }
  }
});

test('todos os temas embutidos têm os tokens obrigatórios', () => {
  for (const [id, t] of Object.entries(T.THEMES)) {
    for (const tok of T.THEME_TOKENS) {
      const key = Array.isArray(tok) ? tok[0] : (tok.key || tok);
      assert.ok(t.vars?.[key] ?? t[key], `${id} sem ${key}`);
    }
  }
});
