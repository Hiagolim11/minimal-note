const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const T = require('../../src/js/spell-text.js');

const root = path.join(__dirname, '..', '..');
const words = (t) => T.words(t).map((x) => x.w);
const apply = (text, ed) => (ed ? text.slice(0, ed.start) + ed.text + text.slice(ed.end) : text);

test('words: ignora front matter, código, links, endereços, tags, siglas e nomes de arquivo', () => {
  const t = [
    '---', 'titulo: xyz', '---',
    'Texto com `codigo` e [[Nota Errda]] e [rotulo](https://exenplo.com/caminho) #tagg',
    '```js', 'const abcd = 1', '```',
    'Veja www.siteerrado.com, mail@dominio.com, arquivo nota.md, ONU, iPhone e <span class="x">oi</span> &nbsp;',
  ].join('\n');
  assert.deepEqual(words(t), ['Texto', 'com', 'rotulo', 'Veja', 'arquivo', 'oi']);
});

test('words: bloco de código sem fechamento vai até o fim; posições batem com o texto', () => {
  const t = 'antes\n~~~\nsem fechar\nainda codigo';
  assert.deepEqual(words(t), ['antes']);
  for (const { w, s, e } of T.words('Olá, mundo-cão d’água')) assert.equal('Olá, mundo-cão d’água'.slice(s, e), w);
  assert.deepEqual(words('Olá, mundo-cão d’água'), ['Olá', 'mundo-cão', 'd’água']);
});

test('pickAuto: só corrige quando a troca é só de acento e não é ambígua', () => {
  assert.equal(T.pickAuto('nao', ['não', 'ano', 'na', 'no']), 'não');
  assert.equal(T.pickAuto('Nao', ['Não', 'Ano']), 'Não');
  assert.equal(T.pickAuto('NAO', ['NÃO']), 'NÃO');
  assert.equal(T.pickAuto('informacao', ['informação']), 'informação');
  assert.equal(T.pickAuto('ja', ['já', 'jã', 'gia']), 'já');          // desempate por palavra comum
  assert.equal(T.pickAuto('vovo', ['vovó', 'vovô', 'vivo']), null);   // ambígua
  assert.equal(T.pickAuto('exenplo', ['exemplo']), null);             // não é só acento
  assert.equal(T.pickAuto('email', ['e-mail']), null);
  assert.equal(T.pickAuto('jose', ['José']), 'José');                 // nome próprio
});

test('capitalize: início de linha, depois de ponto, listas; não depois de abreviação', () => {
  const cap = (t) => apply(t, T.capitalize(t, t.length));
  assert.equal(cap('ola'), 'Ola');
  assert.equal(cap('Fim. depois'), 'Fim. Depois');
  assert.equal(cap('- [ ] comprar'), '- [ ] Comprar');
  assert.equal(cap('## titulo'), '## Titulo');
  assert.equal(cap('> citação'), '> Citação');
  assert.equal(cap('meio da frase'), 'meio da frase');
  assert.equal(cap('Falei com o sr. silva'), 'Falei com o sr. silva');
  assert.equal(cap('J. silva'), 'J. silva');
  assert.equal(cap('Isso? sim'), 'Isso? Sim');
  assert.equal(cap('https'), 'https');
  assert.equal(cap('| tabela'), '| tabela');
});

test('typo: reticências, travessão, espaço antes da pontuação e espaços repetidos', () => {
  const opts = { ellipsis: true, dash: true, spaces: true };
  const run = (t) => apply(t, T.typo(t, t.length, opts));
  assert.equal(run('E então...'), 'E então…');
  assert.equal(run('....'), '....');
  assert.equal(run('isso -- '), 'isso — ');
  assert.equal(run('-- '), '-- ');
  assert.equal(run('Olá ,'), 'Olá,');
  assert.equal(run('Sério ?'), 'Sério?');
  assert.equal(run('| a :'), '| a :');                // tabela
  assert.equal(run('um   d'), 'um d');
  assert.equal(run('    d'), '    d');               // recuo no começo da linha
  assert.equal(run('fim  '), 'fim  ');                // quebra de linha do Markdown
  assert.equal(T.typo('Olá ,', 5, {}), null);         // tudo desligado
  const ed = T.typo('um   d', 6, opts);
  assert.equal(ed.caret, 4);                          // cursor continua depois do "d"
});

test('smartQuote: abre depois de espaço, fecha depois de letra', () => {
  assert.equal(T.smartQuote('disse ', 6), '“');
  assert.equal(T.smartQuote('disse “oi', 9), '”');
  assert.equal(T.smartQuote('', 0, "'"), '‘');
});

test('ltAnnotation: marcação vira markup e o texto original é preservado', () => {
  const t = '# Título\n\nTexto **forte** com `x()` e [[Nota|apelido]] e [site](https://a.b).\n\n```\ncodigo\n```\n- item';
  const items = T.ltAnnotation(t);
  assert.equal(items.map((i) => i.text ?? i.markup).join(''), t);
  const plain = items.map((i) => i.text ?? i.interpretAs).join('');
  assert.match(plain, /^Título\n\nTexto forte com X e apelido e site\.\n\n\n\n\nitem$/);
});

test('ltChunks: divide em partes sem perder offsets', () => {
  const para = 'Frase de teste com algumas palavras. '.repeat(40);
  const t = Array.from({ length: 30 }, () => para).join('\n\n');
  const chunks = T.ltChunks(T.ltAnnotation(t), 5000);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    const joined = c.annotation.map((i) => i.text ?? i.markup).join('');
    assert.equal(t.slice(c.offset, c.offset + joined.length), joined);
    assert.ok(c.annotation.reduce((n, i) => n + (i.text?.length || 0), 0) <= 5000);
  }
  const last = chunks[chunks.length - 1];
  assert.equal(last.offset + last.annotation.map((i) => i.text ?? i.markup).join('').length, t.length);
});

test('shiftRanges: desloca o que vem depois e descarta o que foi editado', () => {
  const list = [{ s: 0, e: 3 }, { s: 10, e: 14 }, { s: 20, e: 25 }];
  const old = 'abc defgh ijkl mnopq rstuv';
  const neu = 'abc defgh XXijkl mnopq rstuv'.replace('XXijkl', 'ijkl').replace('mnopq', 'mnopq!!');
  const out = T.shiftRanges(list, old, neu);
  assert.deepEqual(out, [{ s: 0, e: 3 }, { s: 10, e: 14 }, { s: 22, e: 27 }]);
  assert.deepEqual(T.shiftRanges(list, old, 'abc defgh iXkl mnopq rstuv'), [{ s: 0, e: 3 }, { s: 20, e: 25 }]);
});

// ---- com o Hunspell de verdade (o mesmo binário e dicionário do app) ----
test('Hunspell pt-BR: palavras certas, erradas e correção automática', { timeout: 60000 }, async () => {
  const { loadModule } = require(path.join(root, 'node_modules', 'hunspell-asm'));
  const f = await loadModule();
  const aff = f.mountBuffer(fs.readFileSync(path.join(root, 'node_modules/dictionary-pt/index.aff')), 'pt.aff');
  const dic = f.mountBuffer(fs.readFileSync(path.join(root, 'node_modules/dictionary-pt/index.dic')), 'pt.dic');
  const h = f.create(aff, dic);
  for (const w of ['não', 'você', 'está', 'também', 'informação', 'ideia', 'voo', 'fizeram', 'guarda-chuva']) assert.ok(h.spell(w), w);
  for (const w of ['nao', 'voce', 'exenplo', 'idéia', 'fiseram']) assert.ok(!h.spell(w), w);
  // o worker usa as variações de acento conferidas no dicionário (bem mais rápido que suggest)
  const auto = (w) => (h.spell(w) ? null : T.pickAuto(w, T.accentVariants(w, 2).filter((v) => h.spell(v))));
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) auto('organizacao');
  assert.ok(Date.now() - t0 < 1000, 'variações de acento devem ser rápidas');
  assert.equal(auto('nao'), 'não');
  assert.equal(auto('voce'), 'você');
  assert.equal(auto('tambem'), 'também');
  assert.equal(auto('informacao'), 'informação');
  assert.equal(auto('Coracao'), 'Coração');
  assert.equal(auto('dificil'), 'difícil');
  assert.equal(auto('idéia'), 'ideia');
  assert.equal(auto('ja'), 'já');
  assert.equal(auto('esta'), null); // existe ("esta") — nunca vira "está" sozinha
  assert.equal(auto('e'), null);
  assert.equal(auto('vovo'), null);
  assert.equal(auto('INFORMACAO'), 'INFORMAÇÃO');
  assert.equal(auto('Informacao'), 'Informação');
  assert.equal(auto('excecao'), 'exceção');
  assert.equal(auto('aviao'), 'avião');
  assert.equal(auto('ingles'), 'inglês');
  assert.equal(auto('exenplo'), null);
  h.dispose();
});

test('accentVariants: troca até duas letras por outra acentuação', () => {
  const v = T.accentVariants('nao');
  assert.ok(v.includes('não') && v.includes('nâo') && !v.includes('nao'));
  assert.ok(T.accentVariants('informacao').includes('informação'));
  assert.ok(T.accentVariants('idéia').includes('ideia'));
  assert.ok(!T.accentVariants('informacao', 1).includes('informação'));
  assert.deepEqual(T.accentVariants('xyz'), []);
});
