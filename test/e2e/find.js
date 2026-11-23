// Localizar e substituir na nota: atalhos, contagem, navegação, marcas alinhadas ao texto, substituir com desfazer.
const setup = `(() => {
  openNote('Bem-vindo.md'); setMode('edit');
  editor.ta.focus(); editor.ta.select();
  editor.replace(0, editor.ta.value.length, 'gato preto, Gato branco\\n**gato** <gato> & [[gato]]\\n' + 'linha longa '.repeat(30) + 'gato\\nfim', 0);
  return 'ok';
})()`;
module.exports = [
  { wait: 400, js: setup },
  { keys: 'ctrl+f', wait: 200 },
  { type: 'gato', wait: 300, js: `JSON.stringify({ open: !document.getElementById('findbar').hidden, focus: document.activeElement.id, count: document.getElementById('fb-count').textContent, marks: document.querySelectorAll('.editor-find mark').length })` },
  // cada marca fica exatamente sobre o mesmo trecho do textarea (mesma posição do cursor)
  { js: `(() => {
      // espelho do textarea com o mesmo estilo; o trecho procurado vira um <span> medido
      const ta = editor.ta, cs = getComputedStyle(ta), tr = ta.getBoundingClientRect();
      const div = document.createElement('div');
      ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'overflowWrap'].forEach((p) => { div.style[p] = cs[p]; });
      Object.assign(div.style, { position: 'fixed', visibility: 'hidden', left: tr.left + 'px', top: tr.top + 'px', width: tr.width + 'px', whiteSpace: 'pre-wrap' });
      document.body.appendChild(div);
      let worst = 0;
      const marks = [...document.querySelectorAll('.editor-find mark')];
      const v = ta.value, re = /gato/gi; let m, i = 0;
      while ((m = re.exec(v))) {
        div.textContent = v.slice(0, m.index);
        const sp = document.createElement('span'); sp.textContent = m[0]; div.appendChild(sp);
        div.appendChild(document.createTextNode(v.slice(m.index + m[0].length)));
        const c = sp.getClientRects()[0], r = marks[i++].getClientRects()[0];
        worst = Math.max(worst, Math.abs(c.left - r.left), Math.abs(c.top - r.top));
      }
      div.remove();
      return 'desalinhamento das marcas=' + worst.toFixed(2) + 'px';
    })()` },
  { keys: 'Enter', wait: 150, js: `JSON.stringify({ count: document.getElementById('fb-count').textContent, sel: editor.ta.value.slice(editor.ta.selectionStart, editor.ta.selectionEnd), start: editor.ta.selectionStart })` },
  { keys: 'shift+Enter', wait: 150, js: `document.getElementById('fb-count').textContent` },
  { keys: 'shift+Enter', wait: 150, js: `'volta ao fim: ' + document.getElementById('fb-count').textContent` },
  { click: '.fb-case', wait: 150, js: `'maiúsculas: ' + document.getElementById('fb-count').textContent` },
  { click: '.fb-case', wait: 100 },
  { keys: 'ctrl+h', wait: 150, js: `JSON.stringify({ rep: !document.querySelector('.fb-rep').hidden, focus: document.activeElement.id })` },
  { type: 'cachorro', wait: 100 },
  { keys: 'Enter', wait: 200, js: `JSON.stringify({ count: document.getElementById('fb-count').textContent, first: editor.ta.value.split('\\n')[0] })` },
  { click: '.fb-btn[data-a="all"]', wait: 300, js: `JSON.stringify({ left: (editor.ta.value.match(/gato/gi) || []).length, caes: (editor.ta.value.match(/cachorro/g) || []).length, count: document.getElementById('fb-count').textContent, saved: activeNote().content.includes('<cachorro>') })` },
  { js: `(() => { document.execCommand('undo'); return 'desfazer: ' + (editor.ta.value.match(/gato/gi) || []).length; })()` },
  { keys: 'ctrl+f', wait: 150 },
  { keys: 'Escape', wait: 150, js: `JSON.stringify({ closed: document.getElementById('findbar').hidden, focus: document.activeElement.id, marks: document.querySelectorAll('.editor-find mark').length })` },
  // em modo leitura, Ctrl+F volta para a edição
  { js: `(() => { setMode('preview'); return 'ok'; })()` },
  { keys: 'ctrl+f', wait: 200, js: `JSON.stringify({ mode: activeTab().mode, open: !document.getElementById('findbar').hidden })` },
  { shot: 'find' },
];
