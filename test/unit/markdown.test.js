const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const load = require('./load');

const { marked } = require(path.join(__dirname, '..', '..', 'node_modules', 'marked'));
// valores vêm de outro contexto vm (outro Array): normaliza antes de comparar
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const M = load(['src/js/markdown.js'], { marked, DOMPurify: { sanitize: (s) => s } }).MD;

test('analyze: wikilinks com alias, título e embed de imagem', () => {
  const a = M.analyze('ver [[Nota A]], [[pasta/Nota B|apelido]], [[Nota C#Seção]] e ![[foto.png]]');
  eq(a.links, ['Nota A', 'pasta/Nota B', 'Nota C']);
});

test('analyze: tags do texto e do frontmatter, sem números puros', () => {
  const a = M.analyze('---\ntags: [projeto, "ideia"]\n---\ntexto #tarefa/urgente #123 e #ok\n');
  eq(a.tags.sort(), ['ideia', 'ok', 'projeto', 'tarefa/urgente']);
});

test('analyze: ignora links e tags dentro de código', () => {
  const a = M.analyze('```\n[[Dentro]] #dentro\n```\n`[[inline]]` fora [[Fora]] #fora');
  eq(a.links, ['Fora']);
  eq(a.tags, ['fora']);
});

test('analyze: títulos com linha correta, contando o frontmatter', () => {
  const a = M.analyze('---\ntitle: x\n---\n# Um\ntexto\n## Dois **b**\n```\n# não é título\n```');
  eq(a.headings.map((h) => [h.level, h.text, h.line]), [[1, 'Um', 3], [2, 'Dois b', 5]]);
  assert.equal(a.headings[1].id, 'h-dois-b');
});

test('frontmatter: listas em bloco e valores entre aspas', () => {
  const a = M.analyze('---\nautor: "Ana"\nalias:\n  - um\n  - dois\n---\ncorpo');
  eq(a.meta, { autor: 'Ana', alias: ['um', 'dois'] });
});

test('slug remove acentos e pontuação', () => {
  assert.equal(M.slug('Ação Rápida: 2º passo!'), 'acao-rapida-2-passo');
});

test('esc escapa HTML', () => {
  assert.equal(M.esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('analyze conta palavras', () => {
  assert.equal(M.analyze('# Título\nduas palavras').words, 3);
});
