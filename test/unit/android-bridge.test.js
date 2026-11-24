// Ponte do Android com o plugin nativo simulado (arquivos em memória, mesmas regras do Java:
// renomear por cima de um item existente falha com "Já existe um item com esse nome").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function bridge(files) {
  const MN = new Proxy({
    exists: async ({ path: p }) => ({ exists: files.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')) }),
    rename: async ({ from, to }) => {
      if (!files.has(from)) throw new Error('Item não encontrado');
      if (files.has(to)) throw new Error('Já existe um item com esse nome');
      files.set(to, files.get(from)); files.delete(from); return {};
    },
  }, { get: (t, k) => t[k] || (async () => ({})) }); // demais chamadas: sem efeito
  const anyPlugin = new Proxy({}, { get: () => async () => ({}) });
  const window = { Capacitor: { isNativePlatform: () => true, Plugins: { MinimalNote: MN, Filesystem: anyPlugin, App: anyPlugin } }, addEventListener() {} };
  const ctx = vm.createContext({ window, document: { addEventListener() {}, documentElement: { classList: { add() {} } } }, console, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/js/android-bridge.js'), 'utf8'), ctx);
  return window.lumen;
}

test('excluir duas notas de mesmo nome (pastas diferentes) leva as duas para a .lixeira', async () => {
  const files = new Map([['A/Nota.md', 'a'], ['B/Nota.md', 'b']]);
  const lumen = bridge(files);
  await lumen.fs.remove('A/Nota.md');
  await lumen.fs.remove('B/Nota.md');
  const trash = [...files.keys()].filter((k) => k.startsWith('.lixeira/')).sort();
  assert.equal(trash.length, 2, JSON.stringify([...files]));
  assert.deepEqual(trash.map((k) => files.get(k)).sort(), ['a', 'b']);
  assert.ok(!files.has('A/Nota.md') && !files.has('B/Nota.md'));
});
