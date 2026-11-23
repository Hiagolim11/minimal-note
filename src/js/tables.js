// ---------- Tabelas Markdown no editor ----------
// Tab / Shift+Tab: próxima / anterior célula (e alinha as colunas); Enter no fim da linha: nova linha.
// Comando "Inserir tabela". As funções puras (TableFmt) são testadas em test/unit/tables.test.js.
const TableFmt = (() => {
  const isRow = (line) => /^\s*\|.*\|\s*$/.test(line) || /^\s*\|/.test(line);
  const isSep = (cells) => cells.length > 0 && cells.every((c) => /^\s*:?-{1,}:?\s*$/.test(c));
  // divide uma linha em células (respeita "\|" e `código | com barra`)
  function cells(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const out = []; let cur = '', code = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
      if (ch === '`') code = !code;
      if (ch === '|' && !code) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  // largura visual aproximada (acentos combinados não contam; emoji conta 2)
  const width = (s) => { let w = 0; for (const ch of s.normalize('NFC')) w += /\p{M}/u.test(ch) ? 0 : /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1; return w; };
  const padTo = (s, n, align) => {
    const gap = Math.max(0, n - width(s));
    if (align === 'right') return ' '.repeat(gap) + s;
    if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + s + ' '.repeat(Math.ceil(gap / 2));
    return s + ' '.repeat(gap);
  };

  // formata as linhas de uma tabela: colunas alinhadas, separador ajustado, linhas completadas
  function format(lines) {
    const rows = lines.map(cells);
    const sepIdx = rows.findIndex(isSep);
    const n = Math.max(...rows.map((r) => r.length));
    const aligns = Array.from({ length: n }, (_, i) => {
      const c = sepIdx >= 0 ? (rows[sepIdx][i] || '').trim() : '';
      return c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null;
    });
    const w = Array.from({ length: n }, (_, i) => Math.max(3, ...rows.map((r, k) => (k === sepIdx ? 0 : width(r[i] || '')))));
    const indent = (/^\s*/.exec(lines[0]) || [''])[0];
    return rows.map((r, k) => {
      if (k === sepIdx) return indent + '| ' + w.map((x, i) => { const a = aligns[i]; const d = '-'.repeat(Math.max(1, x - (a === 'center' ? 2 : a ? 1 : 0))); return a === 'center' ? ':' + d + ':' : a === 'right' ? d + ':' : a === 'left' ? ':' + d : d; }).join(' | ') + ' |';
      return indent + '| ' + w.map((x, i) => padTo(r[i] || '', x, aligns[i])).join(' | ') + ' |';
    });
  }

  // início (posição dentro da linha) de cada célula: logo depois de "| "
  function cellStarts(line) {
    const out = []; let code = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '\\' && line[i + 1] === '|') { i++; continue; }
      if (ch === '`') code = !code;
      if (ch === '|' && !code) out.push(i + 1 + (line[i + 1] === ' ' ? 1 : 0));
    }
    out.pop(); // depois do último "|" não há célula
    return out;
  }

  function template(cols = 3, rows = 2) {
    const head = Array.from({ length: cols }, (_, i) => `Coluna ${i + 1}`);
    return format(['| ' + head.join(' | ') + ' |', '|' + ' --- |'.repeat(cols), ...Array.from({ length: rows }, () => '|' + '  |'.repeat(cols))]);
  }

  const api = { isRow, cells, format, cellStarts, template, width };
  if (typeof module === 'object' && module.exports) module.exports = api;
  return api;
})();

if (typeof document !== 'undefined' && document.getElementById('editor')) (function () {
  const ta = document.getElementById('editor');
  // bloco de linhas de tabela em volta da linha `li`
  function block(lines, li) {
    if (!TableFmt.isRow(lines[li] || '')) return null;
    let a = li, b = li;
    while (a > 0 && TableFmt.isRow(lines[a - 1])) a--;
    while (b < lines.length - 1 && TableFmt.isRow(lines[b + 1])) b++;
    return [a, b];
  }
  const offsetOf = (lines, li) => lines.slice(0, li).join('\n').length + (li ? 1 : 0);

  // reescreve a tabela formatada e põe o cursor na célula (linha, coluna) pedida
  function rewrite(lines, a, b, formatted, row, col, selectCell) {
    const start = offsetOf(lines, a), end = offsetOf(lines, b) + lines[b].length;
    const text = formatted.join('\n');
    const r = Math.max(0, Math.min(formatted.length - 1, row - a)), line = formatted[r];
    const starts = TableFmt.cellStarts(line), c = Math.max(0, Math.min(starts.length - 1, col));
    const cs = start + formatted.slice(0, r).join('\n').length + (r ? 1 : 0) + starts[c];
    const cellText = TableFmt.cells(line)[c] || '';
    if (text !== ta.value.slice(start, end)) editor.replace(start, end, text);
    ta.setSelectionRange(cs, selectCell ? cs + cellText.length : cs + cellText.length);
  }

  ta.parentElement.addEventListener('keydown', (e) => {
    if (e.target !== ta || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'Tab' && e.key !== 'Enter') return;
    const v = ta.value, pos = ta.selectionStart, lines = v.split('\n');
    const li = v.slice(0, pos).split('\n').length - 1, blk = block(lines, li);
    if (!blk) return;
    const [a, b] = blk, lineStart = offsetOf(lines, li), col = Math.max(0, TableFmt.cellStarts(lines[li]).filter((s) => s <= pos - lineStart).length - 1);
    if (e.key === 'Enter') {
      // só no fim da linha (ou com só espaços e a barra final depois do cursor); no meio da célula, Enter normal
      if (e.shiftKey || !/^\s*\|?\s*$/.test(lines[li].slice(pos - lineStart))) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const n = TableFmt.cells(lines[li]).length;
      const rows = lines.slice(a, b + 1); rows.splice(li - a + 1, 0, '|' + '  |'.repeat(n));
      // linha vazia + Enter: sai da tabela
      if (TableFmt.cells(lines[li]).every((c) => !c) && li > a + 1) {
        const start = offsetOf(lines, li); editor.replace(start, start + lines[li].length, ''); return;
      }
      const formatted = TableFmt.format(rows);
      const start = offsetOf(lines, a), end = offsetOf(lines, b) + lines[b].length;
      editor.replace(start, end, formatted.join('\n'));
      const nl = ta.value.split('\n'), target = li + 1, ts = offsetOf(nl, target) + TableFmt.cellStarts(nl[target])[0];
      ta.setSelectionRange(ts, ts);
      return;
    }
    // Tab / Shift+Tab
    e.preventDefault(); e.stopImmediatePropagation();
    const rows = lines.slice(a, b + 1), formatted = TableFmt.format(rows);
    const nCols = TableFmt.cells(formatted[0]).length;
    let row = li, c = col + (e.shiftKey ? -1 : 1);
    const sepRow = rows.findIndex((r) => /^\s*\|?\s*:?-+/.test(r) && TableFmt.cells(r).every((x) => /^:?-+:?$/.test(x))) + a;
    const step = (d) => { row += d; if (row === sepRow) row += d; };
    if (c >= nCols) { c = 0; step(1); }
    if (c < 0) { c = nCols - 1; step(-1); }
    if (row < a) { row = a; c = 0; }
    if (row > b) { // passou da última linha: cria uma nova
      rewrite(lines, a, b, TableFmt.format([...rows, '|' + '  |'.repeat(nCols)]), b + 1, 0, true);
      return;
    }
    rewrite(lines, a, b, formatted, row, c, true);
  }, true);

  window.insertTable = function (cols = 3, rows = 2) {
    if (!activeNote()) { toast('Abra uma nota primeiro'); return; }
    if (activeTab()?.mode === 'preview') setMode('edit');
    const pos = ta.selectionStart, v = ta.value;
    const before = v.slice(0, pos), lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const t = TableFmt.template(cols, rows).join('\n') + '\n';
    editor.replace(pos, ta.selectionEnd, lead + t);
    const s = pos + lead.length + 2; ta.setSelectionRange(s, s + 'Coluna 1'.length);
    ta.focus();
  };
  window.formatTable = function () {
    const v = ta.value, lines = v.split('\n'), li = v.slice(0, ta.selectionStart).split('\n').length - 1, blk = block(lines, li);
    if (!blk) { toast('Coloque o cursor dentro de uma tabela'); return; }
    rewrite(lines, blk[0], blk[1], TableFmt.format(lines.slice(blk[0], blk[1] + 1)), li, 0, false);
  };
})();
