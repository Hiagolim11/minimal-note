const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../../src/js/vault-crypto.js');

const fast = { iterations: 2000 }; // nos testes; o app usa 250.000

test('cifra e decifra com a senha certa (acentos, emoji, texto longo)', async () => {
  const plain = '# Diário secreto\nAção, coração, 🔐 e mais.\n' + 'linha '.repeat(5000);
  const c = await V.encrypt(plain, 'senha forte ç', fast);
  assert.ok(V.isEncrypted(c));
  assert.ok(!c.includes('Diário') && !c.includes('coração'));
  assert.ok(c.startsWith(V.HEADER));
  assert.equal(await V.decrypt(c, 'senha forte ç'), plain);
});

test('senha errada e arquivo danificado dão erro claro', async () => {
  const c = await V.encrypt('segredo', 'certa', fast);
  await assert.rejects(V.decrypt(c, 'errada'), /Senha incorreta/);
  const broken = c.replace(/MNENC1:(.{10})/, 'MNENC1:AAAAAAAAAA');
  await assert.rejects(V.decrypt(broken, 'certa'), /Senha incorreta|danificado/);
  await assert.rejects(V.decrypt('# texto normal', 'x'), /não está protegida/);
  await assert.rejects(V.encrypt('x', ''), /Senha vazia/);
});

test('cada cifra é diferente (sal e iv aleatórios) e o padrão usa 250 mil iterações', async () => {
  const a = await V.encrypt('mesmo texto', 's', fast), b = await V.encrypt('mesmo texto', 's', fast);
  assert.notEqual(a, b);
  const d = await V.encrypt('x', 's');
  const p = JSON.parse(Buffer.from(/MNENC1:(\S+)/.exec(d)[1], 'base64').toString());
  assert.equal(p.k, 250000);
  assert.ok(!V.isEncrypted('# nota\nMNENC1:abc no meio do texto'));
});
