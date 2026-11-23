// Tabelas no editor, fórmulas, diagramas, sugestões de links e captura rápida.
const NL = '\\n';
const doc = ['# Ciência', '', 'A fórmula $E = mc^2$ custa $5 no mercado.', '', '$$', '\\\\int_0^1 x^2\\\\,dx = \\\\frac{1}{3}', '$$', '', '```mermaid', 'flowchart LR', '  A[Ideia] --> B[Rascunho] --> C[Pronto]', '```', '', 'Falei com o cliente x sobre o orçamento.', ''].join(NL);
module.exports = [
  { wait: 400, js: `(async () => {
      await lumen.fs.write('Ciência.md', '${doc}');
      await lumen.fs.write('Cliente X.md', '# Cliente X${NL}Contato principal.');
      await lumen.fs.write('Orçamento.md', '# Orçamento${NL}Valores do projeto. Ciência citada aqui sem link.');
      await refreshVault(); await openNote('Ciência.md'); setMode('preview');
      await new Promise((r) => setTimeout(r, 5000));
      const pv = document.getElementById('preview');
      return JSON.stringify({ katex: pv.querySelectorAll('.katex').length, bloco: pv.querySelectorAll('.math-block .katex-display').length, dinheiro: pv.textContent.includes('$5'), svg: !!pv.querySelector('.mermaid-block svg'), erro: !!pv.querySelector('.mermaid-error') });
    })()`, size: [1280, 860] },
  { shot: 'feat-formula-diagrama' },
  // sugestões de links (painel Backlinks)
  { js: `(() => { S.settings.rightPanel = 'backlinks'; S.settings.rightOpen = true; applyLayout(); renderRight(); const box = document.getElementById('link-suggest'); return 'sugestões: ' + [...box.querySelectorAll('.ls-btn')].map((b) => b.textContent).join(' | '); })()`, wait: 300 },
  { js: `(() => { setMode('edit'); renderRight(); const b = [...document.querySelectorAll('#link-suggest .ls-btn')].find((x) => x.textContent.includes('Cliente X')); b.click(); return 'ok'; })()`, wait: 400 },
  { js: `'ligado: ' + editor.ta.value.split('${NL}').find((l) => l.startsWith('Falei'))` },
  { js: `(() => { const b = [...document.querySelectorAll('#link-suggest .ls-btn')].find((x) => x.dataset.act === 'theirs'); if (!b) return 'sem "citam esta"'; b.click(); return 'ok'; })()`, wait: 800 },
  { js: `'outra nota: ' + S.notes.get('Orçamento.md').content.split('${NL}')[1]`, shot: 'feat-links' },
  // tabela: inserir, digitar, Tab e Enter
  { js: `(() => { const v = editor.ta.value; editor.ta.focus(); editor.ta.setSelectionRange(v.length, v.length); insertTable(2, 1); return 'tabela inserida'; })()`, wait: 200 },
  { type: 'Nome', wait: 50 }, { keys: 'Tab', wait: 50 }, { type: 'Idade', wait: 50 }, { keys: 'Tab', wait: 50 },
  { type: 'Ana', wait: 50 }, { keys: 'Tab', wait: 50 }, { type: '7', wait: 50 }, { keys: 'Tab', wait: 50 },
  { type: 'Bartolomeu', wait: 50 }, { keys: 'Tab', wait: 50 }, { type: '30', wait: 50 },
  { js: `(() => { const v = editor.ta.value; const i = v.indexOf('| Nome'); return 'tabela:${NL}' + v.slice(i).trim(); })()` },
  { keys: 'Enter', wait: 100, js: `(() => { const v = editor.ta.value; const ln = v.slice(0, editor.ta.selectionStart).split('${NL}').pop(); return 'nova linha começa com: ' + JSON.stringify(ln); })()` },
  { keys: 'shift+Tab', wait: 100, js: `'shift+tab volta para: ' + JSON.stringify(editor.ta.value.slice(editor.ta.selectionStart, editor.ta.selectionEnd))` },
  // captura rápida
  { js: `(async () => { const a = await lumen.capture.save({ text: 'ligar para o dentista', mode: 'inbox' }); const b = await lumen.capture.save({ text: 'Ideia de app${NL}com duas linhas', mode: 'note' }); await new Promise((r) => setTimeout(r, 900)); return JSON.stringify({ a, b, caixa: S.notes.get('Caixa de entrada.md')?.content.trim().split('${NL}').pop(), nova: S.notes.get(b)?.content }); })()`, wait: 300 },
  { js: `(async () => { const ok = await lumen.capture.open(); return 'janela de captura: ' + ok; })()`, wait: 1200 },
  { js: `(async () => { try { await lumen.capture.save({ text: '   ', mode: 'inbox' }); return 'salvou vazio?!'; } catch (e) { return 'vazio recusado: ' + e.message; } })()` },
];
