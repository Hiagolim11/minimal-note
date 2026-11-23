// Corretor ortográfico (Hunspell no worker), correção automática, ajustes de digitação, sugestões,
// dicionário pessoal e revisão gramatical com um servidor LanguageTool falso (test/e2e/lt-server.js).
// Rodar com: bash test/e2e/run.sh test/e2e/spell.js 'node test/e2e/lt-server.js'
const waitReady = `(async () => { for (let i = 0; i < 100 && __lumenSpell.status().status !== 'ready'; i++) await new Promise((r) => setTimeout(r, 100)); return 'corretor: ' + __lumenSpell.status().status + ' (' + (__lumenSpell.status().error || 'sem erro') + ')'; })()`;
const setText = (t) => `(async () => { await openNote('Bem-vindo.md'); setMode('edit'); await new Promise((r) => setTimeout(r, 400)); editor.ta.focus(); editor.ta.select(); editor.replace(0, editor.ta.value.length, ${JSON.stringify(t)}); editor.ta.setSelectionRange(editor.ta.value.length, editor.ta.value.length); await new Promise((r) => setTimeout(r, 300)); editor.ta.setSelectionRange(editor.ta.value.length, editor.ta.value.length); return 'ok'; })()`;
const errs = `JSON.stringify(__lumenSpell.errors().map((e) => e.text))`;
const lbl = (name, expr) => `${JSON.stringify(name + ': ')} + ${expr}`;
const tail = (n) => `JSON.stringify(editor.ta.value.slice(-${n}))`;
// marca o <span> da palavra para o passo seguinte clicar nele (o clique cai no textarea, por baixo)
const tagSpan = (word) => `(() => { document.getElementById('alvo')?.removeAttribute('id'); const sp = [...document.querySelectorAll('.editor-spell span')].find((s) => s.textContent === ${JSON.stringify(word)}); if (!sp) return 'sem marca: ${word}'; sp.id = 'alvo'; return 'marcado: ${word}'; })()`;
const rightClick = { click: '#alvo', clickOpts: { button: 'right' } };
const waitIssues = `(async () => { for (let i = 0; i < 80 && !__lumenSpell.issues().length; i++) await new Promise((r) => setTimeout(r, 100)); return 'revisão pronta'; })()`;
module.exports = [
  { wait: 300, js: waitReady },
  { js: setText('Eu nao sei se o exenplo esta certo. `codigo errdo` e [[Nota Errda]] e Hiago.\n') },
  { wait: 900, js: lbl('erros', errs) },
  // a camada do corretor fica alinhada ao texto do editor
  { js: `(() => { const sp = document.querySelector('.editor-spell span'); const c = editor.caretCoords(editor.ta.value.indexOf('nao')); const r = sp.getClientRects()[0]; return 'desalinhamento=' + Math.max(Math.abs(c.left - r.left), Math.abs(c.top - r.top)).toFixed(2); })()` },
  // digitação: maiúscula no início da frase + acento automático
  { type: 'hoje voce vai ', wait: 500, js: lbl('digitado', tail(14)) },
  { type: 'nao ', wait: 500, js: lbl('auto', tail(8)) },
  // Backspace logo depois desfaz a correção
  { keys: 'Backspace', wait: 200, js: lbl('desfeito', tail(8)) },
  { type: 'mesmo. ', wait: 300 },
  { type: 'fim ,', wait: 200, js: lbl('virgula', tail(5)) },
  { type: ' e isso...', wait: 200, js: lbl('reticencias', tail(8)) },
  { type: ' um   b', wait: 200, js: lbl('espacos', tail(6)) },
  { keys: 'Enter', wait: 100 },
  { type: 'informacao', wait: 100 },
  { keys: 'Enter', wait: 600, js: `'enter: ' + JSON.stringify(editor.ta.value.split('\\n').slice(-3, -1))` },
  // sugestões pelo clique direito
  { wait: 800, js: `'depois: ' + JSON.stringify(editor.ta.value.split('\\n').slice(-2, -1))` },
  { wait: 300, js: `'marcadas: ' + JSON.stringify([...document.querySelectorAll('.editor-spell span')].map((s) => s.textContent))` },
  { js: tagSpan('exenplo') },
  { ...rightClick, wait: 700, js: `JSON.stringify({ open: !document.getElementById('spell-pop').hidden, sugs: [...document.querySelectorAll('#spell-pop .sp-sug')].map((b) => b.textContent) })` },
  { shot: 'spell-pop' },
  { click: '#spell-pop .sp-sug', wait: 400, js: `JSON.stringify({ fixed: editor.ta.value.includes('o exemplo esta'), closed: document.getElementById('spell-pop').hidden })` },
  // adicionar ao dicionário pessoal (fica no cofre)
  { js: tagSpan('Hiago') },
  { ...rightClick, wait: 400 },
  { click: '#spell-pop [data-a="add"]', wait: 700, js: `lumen.fs.read('.minimal-note/dicionario.txt').then((t) => JSON.stringify({ file: t, underlined: __lumenSpell.errors().some((e) => e.text === 'Hiago') }))` },
  // revisão gramatical com servidor próprio (falso)
  { js: `(() => { setSetting('ltEnabled', true); setSetting('ltServer', 'custom'); setSetting('ltUrl', 'http://127.0.0.1:47124'); return 'lt ligado'; })()` },
  { js: setText('# Viagem\n\nFui a praia ontem. Depois, Fui a praia de novo.\n\n```\ncodigoSecreto\n```\n') },
  { keys: 'F7', wait: 100, js: waitIssues },
  { js: `JSON.stringify({ issues: __lumenSpell.issues().map((i) => [i.text, i.short, i.reps]), panel: document.querySelectorAll('#review .rv-item').length, marks: document.querySelectorAll('.editor-spell .sp-gr').length })` },
  { shot: 'review' },
  { click: '#review .rv-item .rv-rep', wait: 500, js: `JSON.stringify({ linha: editor.ta.value.split('\\n')[2], restam: __lumenSpell.issues().length })` },
  // editar antes do problema restante desloca a marca junto
  { js: `(() => { editor.ta.setSelectionRange(0, 0); editor.replace(0, 0, 'XX'); const i = __lumenSpell.issues()[0]; return JSON.stringify({ trecho: editor.ta.value.slice(i.s - 4, i.e + 6), s: i.s }); })()` },
  // servidor público pede confirmação; recusar não envia nada
  { js: `(() => { setSetting('ltEnabled', false); setSetting('ltServer', 'public'); window.__lumenReview.run(); return 'run'; })()`, wait: 300 },
  { js: `JSON.stringify({ dialog: !document.getElementById('dialog').hidden, title: document.getElementById('dialog-title').textContent })` },
  { click: '#dialog-cancel', wait: 200, js: `JSON.stringify({ ltEnabled: S.settings.ltEnabled })` },
  // corretor desligado: nada sublinhado
  { js: `(() => { setSetting('spellcheck', false); __lumenSpell.sync(); return 'desligado: ' + ${errs}; })()` },
];
