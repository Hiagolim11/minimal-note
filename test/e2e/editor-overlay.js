// O realce incremental (uma <div> por linha) deve ser igual a um realce do zero e ficar alinhado ao textarea.
const edits = `[
  [0, 0, '---\\ntitulo: x\\n---\\n'],          // frontmatter no início
  [-1, 0, '\\n\\n\\u0060\\u0060\\u0060js\\ncodigo [[nao]]\\n'], // abre bloco de código no fim (sem fechar)
  [-1, 0, '\\u0060\\u0060\\u0060\\nfora **b** #t\\n'],          // fecha o bloco
  [40, 60, ''],                                 // apaga um trecho no meio
  [10, 10, '\\n\\n\\n'],                        // insere linhas vazias
  [0, 4, ''],                                   // quebra o frontmatter
  [5, 5, 'linha muito longa que precisa quebrar '.repeat(12)], // linha com quebra automática
]`;
module.exports = [
  { wait: 300, js: `(() => { openNote('Bem-vindo.md'); setMode('edit'); return 'ok'; })()` },
  { wait: 300, js: `(() => {
      const ta = editor.ta, errs = [];
      for (const [s, e, txt] of ${edits}) {
        const st = s < 0 ? ta.value.length : s;
        ta.setRangeText(txt, st, Math.min(e < 0 ? ta.value.length : Math.max(st, e), ta.value.length), 'end');
        ta.dispatchEvent(new Event('input'));
        const inc = editor.hl.innerHTML;
        editor.hlLines = null; editor.hlCache = null; editor.highlight();
        if (editor.hl.innerHTML !== inc) errs.push('diverge após editar em ' + s);
        if (editor.hl.children.length !== ta.value.split('\\n').length) errs.push('nº de linhas: ' + editor.hl.children.length + ' vs ' + ta.value.split('\\n').length);
      }
      return errs.length ? errs.join('; ') : 'incremental = completo';
    })()` },
  { wait: 500, js: `(() => {
      // referência: o overlay antigo (um bloco só, linhas unidas por \\n); cada linha num <span> inline
      const hl = editor.hl, ref = hl.cloneNode(false);
      ref.innerHTML = editor.hlLines.map((l) => '<span class="ref-l">' + l + '</span>').join('\\n') + '\\n ';
      hl.after(ref);
      const a = [...hl.children].map((d) => d.getBoundingClientRect().top - hl.getBoundingClientRect().top);
      const b = [...ref.querySelectorAll('.ref-l')].map((s) => s.getClientRects()[0]?.top - ref.getBoundingClientRect().top);
      ref.remove();
      // o retângulo de um <span> inline começa na caixa da fonte (meia entrelinha abaixo da linha):
      // essa diferença é constante, então compara o desvio de cada linha com o da primeira
      const base = a[0] - b[0];
      const worst = Math.max(...a.map((v, i) => Math.abs(v - b[i] - base)));
      return 'desalinhamento máximo=' + worst.toFixed(2) + 'px em ' + a.length + ' linhas';
    })()` },
  { shot: 'editor-overlay' },
];
