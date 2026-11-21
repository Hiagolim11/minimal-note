// Editor Markdown baseado em textarea: atalhos, listas inteligentes, autocompletar [[links]], realce
class MarkdownEditor {
  static INLINE = /(?<code>(?<bt>`+)[^`\n]*?\k<bt>)|(?<wiki>!?\[\[[^\]\n]+\]\])|(?<link>!?\[[^\]\n]*\]\([^)\n]*\))|(?<bold>(?<bm>\*\*|__)(?=\S)[^\n]*?\S\k<bm>)|(?<mark>==(?=\S)[^\n]*?\S==)|(?<strike>~~(?=\S)[^\n]*?\S~~)|(?<tag>(?<=^|\s)#[\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)|(?<it>(?<![*\w])(?<im>[*_])(?=[^\s*_])[^*_\n]*?[^\s*_]\k<im>(?![*\w]))|(?<url>https?:\/\/[^\s)>\]]+)/gu;

  constructor(ta, { onChange, onCursor, suggest, onPasteFiles, getSettings }) {
    this.ta = ta;
    this.onChange = onChange;
    this.onCursor = onCursor;
    this.suggestFn = suggest;
    this.onPasteFiles = onPasteFiles;
    this.getSettings = getSettings;
    this.box = document.getElementById('suggest');
    this.sugItems = []; this.sugIndex = 0; this.sugStart = -1;
    this.bind();
  }

  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.autosize(); this.highlight(); }

  // ---- realce de sintaxe (só cores: não altera a largura do texto) ----
  highlight() {
    if (!this.hl) this.hl = document.getElementById('editor-hl');
    const v = this.ta.value;
    if (v.length > 300000) { this.hl.textContent = v + '\n'; return; }
    const E = MD.esc;
    const inline = (s) => {
      let out = '', last = 0;
      for (const m of s.matchAll(MarkdownEditor.INLINE)) {
        out += E(s.slice(last, m.index));
        const g = m.groups, t = m[0];
        if (g.code) out += `<span class="hl-code-i">${E(t)}</span>`;
        else if (g.wiki) out += `<span class="hl-link">${E(t)}</span>`;
        else if (g.link) { const p = /^(!?\[)(.*)(\]\()(.*)(\))$/.exec(t); out += p ? `<span class="hl-mk">${E(p[1])}</span><span class="hl-link">${E(p[2])}</span><span class="hl-mk">${E(p[3])}</span><span class="hl-url">${E(p[4])}</span><span class="hl-mk">)</span>` : E(t); }
        else if (g.bold) out += `<span class="hl-mk">${E(t.slice(0, 2))}</span><span class="hl-b">${E(t.slice(2, -2))}</span><span class="hl-mk">${E(t.slice(-2))}</span>`;
        else if (g.mark) out += `<span class="hl-mk">==</span><span class="hl-mark">${E(t.slice(2, -2))}</span><span class="hl-mk">==</span>`;
        else if (g.strike) out += `<span class="hl-strike">${E(t)}</span>`;
        else if (g.tag) out += `<span class="hl-tag">${E(t)}</span>`;
        else if (g.it) out += `<span class="hl-mk">${E(t[0])}</span><span class="hl-i">${E(t.slice(1, -1))}</span><span class="hl-mk">${E(t.slice(-1))}</span>`;
        else if (g.url) out += `<span class="hl-url">${E(t)}</span>`;
        else out += E(t);
        last = m.index + t.length;
      }
      return out + E(s.slice(last));
    };
    const lines = v.split('\n');
    const out = [];
    let inCode = false, inFm = lines[0] === '---';
    lines.forEach((line, i) => {
      if (inFm) { out.push(`<span class="hl-fm">${E(line)}</span>`); if (i > 0 && line === '---') inFm = false; return; }
      if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; out.push(`<span class="hl-fence">${E(line)}</span>`); return; }
      if (inCode) { out.push(`<span class="hl-code">${E(line)}</span>`); return; }
      let m = /^(#{1,6})(\s+)(.*)$/.exec(line);
      if (m) { out.push(`<span class="hl-h"><span class="hl-mk">${m[1]}</span>${m[2]}${inline(m[3])}</span>`); return; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push(`<span class="hl-mk">${E(line)}</span>`); return; }
      m = /^(\s*(?:>\s?)*)(\s*(?:[-*+]|\d+[.)])\s+)?(\[[ xX]\]\s)?(.*)$/.exec(line);
      const [, quote, list, task, rest] = m;
      const done = task && /x/i.test(task);
      out.push(
        (quote ? `<span class="hl-quote">${E(quote)}</span>` : '') +
        (list ? `<span class="hl-list">${E(list)}</span>` : '') +
        (task ? `<span class="hl-list">${E(task)}</span>` : '') +
        (done ? `<span class="hl-done">${inline(rest)}</span>` : inline(rest)),
      );
    });
    this.hl.innerHTML = out.join('\n') + '\n ';
  }

  autosize() {
    const pane = this.ta.closest('.pane');
    const st = pane?.scrollTop;
    this.ta.style.height = 'auto';
    this.ta.style.height = this.ta.scrollHeight + 'px';
    if (pane) pane.scrollTop = st;
  }

  // inserção que preserva o histórico de desfazer (Ctrl+Z)
  replace(start, end, text, selStart, selEnd) {
    this.ta.focus();
    this.ta.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) {
      this.ta.setRangeText(text, start, end, 'end');
      this.ta.dispatchEvent(new Event('input'));
    }
    if (selStart != null) this.ta.setSelectionRange(selStart, selEnd ?? selStart);
  }

  wrap(before, after = before, placeholder = '') {
    const { selectionStart: s, selectionEnd: e, value } = this.ta;
    const sel = value.slice(s, e);
    if (sel && value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
      this.replace(s - before.length, e + after.length, sel, s - before.length, e - before.length);
      return;
    }
    const inner = sel || placeholder;
    this.replace(s, e, before + inner + after, s + before.length, s + before.length + inner.length);
  }

  lineRange(pos) {
    const v = this.ta.value;
    const start = v.lastIndexOf('\n', pos - 1) + 1;
    let end = v.indexOf('\n', pos); if (end < 0) end = v.length;
    return { start, end, text: v.slice(start, end) };
  }

  indent(outdent) {
    const { selectionStart: s, selectionEnd: e, value } = this.ta;
    const first = value.lastIndexOf('\n', s - 1) + 1;
    let last = value.indexOf('\n', e - (e > s && value[e - 1] === '\n' ? 1 : 0)); if (last < 0) last = value.length;
    const block = value.slice(first, last);
    if (!outdent && s === e && !/^\s*([-*+]|\d+[.)])\s/.test(block)) { this.replace(s, e, '    '); return; }
    const lines = block.split('\n');
    let delta0 = 0;
    const out = lines.map((l, i) => {
      if (outdent) {
        const m = /^( {1,4}|\t)/.exec(l); const n = m ? m[0].length : 0;
        if (i === 0) delta0 = -n; return l.slice(n);
      }
      if (i === 0) delta0 = 4; return '    ' + l;
    }).join('\n');
    this.replace(first, last, out, Math.max(first, s + delta0), e + (out.length - block.length));
  }

  smartEnter(e) {
    const { selectionStart: s, selectionEnd: end } = this.ta;
    if (s !== end) return false;
    const line = this.lineRange(s);
    const m = /^(\s*)([-*+]|\d+[.)]|>)(\s+)(\[[ xX]\]\s+)?(.*)$/.exec(line.text);
    if (!m) return false;
    const [, ind, mark, sp, task, rest] = m;
    if (s - line.start < ind.length + mark.length) return false;
    if (!rest.trim()) {
      // item vazio: encerra a lista
      this.replace(line.start, line.end, '', line.start);
      return true;
    }
    let next = mark;
    const num = /^(\d+)([.)])$/.exec(mark);
    if (num) next = (Number(num[1]) + 1) + num[2];
    const insert = '\n' + ind + next + sp + (task ? '[ ] ' : '');
    this.replace(s, s, insert);
    e.preventDefault();
    return true;
  }

  bind() {
    const ta = this.ta;
    ta.addEventListener('input', () => {
      this.autosize();
      this.highlight();
      this.onChange?.(ta.value);
      this.updateSuggest();
    });
    ['keyup', 'click', 'select'].forEach((ev) => ta.addEventListener(ev, () => this.emitCursor()));
    ta.addEventListener('blur', () => setTimeout(() => this.hideSuggest(), 120));

    ta.addEventListener('keydown', (e) => {
      const st = this.getSettings();
      if (!this.box.hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.moveSug(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); this.moveSug(-1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.acceptSug(); return; }
        if (e.key === 'Escape') { e.preventDefault(); this.hideSuggest(); return; }
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'b') { e.preventDefault(); this.wrap('**', '**', 'negrito'); return; }
        if (k === 'i') { e.preventDefault(); this.wrap('*', '*', 'itálico'); return; }
        if (k === 'k') { e.preventDefault(); this.wrap('[', '](https://)', 'texto'); return; }
        if (k === 'l') { e.preventDefault(); this.toggleTask(); return; }
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); this.wrap('~~'); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); this.wrap('=='); return; }
      if (mod && e.key === '`') { e.preventDefault(); this.wrap('`'); return; }
      if (e.key === 'Tab') { e.preventDefault(); this.indent(e.shiftKey); return; }
      if (e.key === 'Enter' && !e.shiftKey && !mod && st.smartLists) { if (this.smartEnter(e)) { e.preventDefault(); return; } }
      if (st.autoPair && !mod && !e.altKey) this.autoPair(e);
    });

    ta.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); this.onPasteFiles?.(files); }
    });
    ta.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); this.onPasteFiles?.(files); }
    });
  }

  autoPair(e) {
    const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', '`': '`' };
    const { selectionStart: s, selectionEnd: end, value } = this.ta;
    // pular o caractere de fechamento se ele já estiver à frente
    if ([')', ']', '}', '"', '`'].includes(e.key) && s === end && value[s] === e.key) {
      e.preventDefault(); this.ta.setSelectionRange(s + 1, s + 1); return;
    }
    if (pairs[e.key]) {
      if (s !== end) { e.preventDefault(); this.wrap(e.key, pairs[e.key]); return; }
      const nextCh = value[s] || '';
      if (/\w/.test(nextCh)) return;
      if ((e.key === '"' || e.key === '`') && /\w/.test(value[s - 1] || '')) return;
      e.preventDefault();
      this.replace(s, s, e.key + pairs[e.key], s + 1);
    }
    if (e.key === 'Backspace' && s === end && s > 0 && pairs[value[s - 1]] === value[s]) {
      e.preventDefault(); this.replace(s - 1, s + 1, '', s - 1);
    }
  }

  toggleTask() {
    const line = this.lineRange(this.ta.selectionStart);
    const t = line.text;
    let out;
    if (/^(\s*[-*+]\s+)\[ \]/.test(t)) out = t.replace(/^(\s*[-*+]\s+)\[ \]/, '$1[x]');
    else if (/^(\s*[-*+]\s+)\[[xX]\]/.test(t)) out = t.replace(/^(\s*[-*+]\s+)\[[xX]\]\s?/, '$1');
    else if (/^(\s*[-*+]\s+)/.test(t)) out = t.replace(/^(\s*[-*+]\s+)/, '$1[ ] ');
    else out = t.replace(/^(\s*)/, '$1- [ ] ');
    const caret = this.ta.selectionStart + (out.length - t.length);
    this.replace(line.start, line.end, out, Math.max(line.start, caret));
  }

  emitCursor() {
    const { selectionStart: s, value } = this.ta;
    const before = value.slice(0, s);
    const line = (before.match(/\n/g) || []).length + 1;
    const col = s - before.lastIndexOf('\n');
    this.onCursor?.({ line, col, sel: this.ta.selectionEnd - s });
  }

  // ---- autocompletar [[ ----
  updateSuggest() {
    const { selectionStart: s, value } = this.ta;
    const before = value.slice(Math.max(0, s - 120), s);
    const m = /\[\[([^\[\]\n|#]*)$/.exec(before);
    if (!m) { this.hideSuggest(); return; }
    this.sugStart = s - m[1].length;
    this.sugItems = this.suggestFn(m[1]);
    if (!this.sugItems.length) { this.hideSuggest(); return; }
    this.sugIndex = 0;
    this.renderSug();
    const c = this.caretCoords(s);
    const bw = 300, bh = Math.min(260, this.sugItems.length * 34 + 10);
    let x = Math.min(c.left, window.innerWidth - bw - 10);
    let y = c.top + c.height + 4;
    if (y + bh > window.innerHeight - 10) y = c.top - bh - 4;
    Object.assign(this.box.style, { left: Math.max(8, x) + 'px', top: y + 'px' });
    this.box.hidden = false;
  }
  renderSug() {
    this.box.innerHTML = this.sugItems.map((it, i) => `<div class="sg-item${i === this.sugIndex ? ' sel' : ''}" data-i="${i}">${icon(it.create ? 'plus' : 'note', 15)}<span>${MD.esc(it.label)}</span>${it.sub ? `<span class="sg-path">${MD.esc(it.sub)}</span>` : ''}</div>`).join('');
    this.box.querySelectorAll('.sg-item').forEach((el) => el.addEventListener('mousedown', (ev) => { ev.preventDefault(); this.sugIndex = Number(el.dataset.i); this.acceptSug(); }));
    this.box.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }
  moveSug(d) { this.sugIndex = (this.sugIndex + d + this.sugItems.length) % this.sugItems.length; this.renderSug(); }
  acceptSug() {
    const it = this.sugItems[this.sugIndex]; if (!it) return;
    const s = this.ta.selectionStart, v = this.ta.value;
    let end = s; while (end < v.length && !/[\]\n]/.test(v[end]) && end - s < 100) end++;
    const hasClose = v.slice(end, end + 2) === ']]';
    const text = it.insert + (hasClose ? '' : ']]');
    this.replace(this.sugStart, end, text);
    if (hasClose) this.ta.setSelectionRange(this.sugStart + text.length + 2, this.sugStart + text.length + 2);
    this.hideSuggest();
  }
  hideSuggest() { this.box.hidden = true; this.sugItems = []; }

  caretCoords(pos) {
    const ta = this.ta, cs = getComputedStyle(ta);
    const div = document.createElement('div');
    const props = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'tabSize', 'whiteSpace', 'wordWrap', 'overflowWrap'];
    props.forEach((p) => { div.style[p] = cs[p]; });
    const r = ta.getBoundingClientRect();
    Object.assign(div.style, { position: 'fixed', visibility: 'hidden', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', whiteSpace: 'pre-wrap' });
    div.textContent = ta.value.slice(0, pos);
    const span = document.createElement('span'); span.textContent = ta.value.slice(pos) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    const sr = span.getBoundingClientRect();
    const out = { left: sr.left, top: sr.top - ta.scrollTop, height: parseFloat(cs.lineHeight) || 20 };
    div.remove();
    return out;
  }

  scrollToLine(line) {
    const pos = this.ta.value.split('\n').slice(0, line).join('\n').length + (line ? 1 : 0);
    const pane = this.ta.closest('.pane');
    const c = this.caretCoords(pos);
    const pr = pane.getBoundingClientRect();
    pane.scrollTo({ top: pane.scrollTop + c.top - pr.top - 80, behavior: 'smooth' });
    this.ta.focus({ preventScroll: true });
    this.ta.setSelectionRange(pos, pos);
  }
}
