// ---------- Corretor ortográfico (Hunspell pt-BR, sem internet) ----------
// - sublinha palavras erradas numa camada própria (mesmo texto do editor, transparente);
// - clique direito (ou toque, no celular) mostra sugestões, "Adicionar ao dicionário" e "Ignorar";
// - corrige sozinho só o que é óbvio (acentos: nao → não) e o Backspace logo depois desfaz;
// - ajustes de digitação: maiúscula no início da frase, espaços, reticências, travessão e aspas.
// O dicionário pessoal fica no cofre: .minimal-note/dicionario.txt
/* global SpellText, editor, S, icon, toast */
(function () {
  const T = window.SpellText;
  const ta = document.getElementById('editor');
  const pane = document.getElementById('editor-pane');
  const hl = document.getElementById('editor-hl');
  if (!T || !ta || !hl) return;
  const DICT_FILE = '.minimal-note/dicionario.txt';
  const BIG = 300000, SYNC_LIMIT = 30000;
  const IS_ANDROID = window.lumen?.platform === 'android';
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
  const st = () => (typeof S !== 'undefined' && S.settings) || {};
  const enabled = () => st().spellcheck !== false;
  const isTouch = () => document.documentElement.classList.contains('touch');

  const layer = document.createElement('div');
  layer.className = 'editor-spell';
  layer.setAttribute('aria-hidden', 'true');
  hl.after(layer);

  const pop = document.createElement('div');
  pop.id = 'spell-pop';
  pop.className = 'spell-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  document.body.appendChild(pop);

  // ---------- worker ----------
  let worker = null, seq = 0, status = 'off', loadError = '';
  const pending = new Map();
  function rpc(type, payload = {}) {
    if (!worker || status === 'error') return Promise.reject(new Error(loadError || 'corretor indisponível'));
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...payload });
    });
  }
  function fail(msg) {
    status = 'error'; loadError = msg;
    for (const p of pending.values()) p.reject(new Error(msg));
    pending.clear();
    console.warn('[corretor]', msg);
    sync();
  }
  function start() {
    if (worker || status === 'error') return;
    status = 'loading';
    try { worker = new Worker('js/spell-worker.js'); } catch (e) { fail(e.message); return; }
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
    };
    worker.onerror = (e) => { e.preventDefault?.(); fail(e.message || 'erro no worker do corretor'); };
    const t0 = performance.now();
    rpc('init', { words: [...personal] }).then(() => {
      status = 'ready'; window.__lumenSpellLoadMs = Math.round(performance.now() - t0);
      sync(); refresh(true);
    }).catch((e) => fail(e.message));
  }

  // ---------- dicionário pessoal (no cofre) ----------
  const personal = new Set();
  let personalFor = null;
  async function loadPersonal() {
    const key = (typeof S !== 'undefined' && S.vault?.root) || null;
    if (!key || key === personalFor) return;
    personalFor = key;
    const old = [...personal];
    personal.clear();
    try {
      const txt = await window.lumen.fs.read(DICT_FILE);
      txt.split(/\r?\n/).map((w) => w.trim()).filter(Boolean).forEach((w) => personal.add(w));
    } catch { /* ainda não existe */ }
    if (status === 'ready') {
      for (const w of old) if (!personal.has(w)) await rpc('remove', { word: w }).catch(() => {});
      for (const w of personal) await rpc('add', { word: w }).catch(() => {});
      cache.clear();
    }
  }
  async function savePersonal() {
    try { await window.lumen.fs.write(DICT_FILE, [...personal].sort((a, b) => a.localeCompare(b, 'pt')).join('\n') + '\n'); }
    catch (e) { toast?.('Não foi possível salvar o dicionário: ' + (e.message || e), 'error'); }
  }
  async function addWord(w) {
    personal.add(w); cache.set(w, true);
    await rpc('add', { word: w }).catch(() => {});
    await savePersonal();
    refresh(true);
  }
  async function removeWord(w) {
    personal.delete(w); cache.delete(w);
    await rpc('remove', { word: w }).catch(() => {});
    await savePersonal();
    refresh(true);
  }

  // ---------- conferência e marcas ----------
  const cache = new Map();          // palavra → true (certa) | false (errada)
  const queued = new Set(), inflight = new Set();
  const ignored = new Set();        // "Ignorar" nesta sessão
  const noAuto = new Set();         // correção automática desfeita com Backspace
  let grammar = [];                 // problemas da revisão gramatical [{s, e, msg, reps, text, id}]
  let errs = [], prevText = ta.value, timer = 0, qTimer = 0, typingAt = -1;

  function flushQueue() {
    if (status !== 'ready' || !queued.size) return;
    const words = [...queued]; queued.clear();
    words.forEach((w) => inflight.add(w));
    rpc('check', { words }).then((bad) => {
      const b = new Set(bad);
      words.forEach((w) => { cache.set(w, !b.has(w)); inflight.delete(w); });
      paint();
    }).catch(() => words.forEach((w) => inflight.delete(w)));
  }

  function refresh(now) {
    clearTimeout(timer);
    if (!now) { timer = setTimeout(() => refresh(true), 350); return; }
    if (enabled() && status === 'off') { loadPersonal().finally(start); }
    if (enabled()) loadPersonal();
    paint();
    clearTimeout(qTimer);
    qTimer = setTimeout(flushQueue, 250);
  }

  function paint() {
    const v = ta.value;
    if (v !== prevText) { grammar = T.shiftRanges(grammar, prevText, v); prevText = v; }
    errs = [];
    if (v.length <= BIG) {
      if (enabled() && status !== 'error') {
        for (const t of T.words(v)) {
          if (t.e === typingAt) continue; // palavra sendo digitada
          if (personal.has(t.w) || ignored.has(t.w)) continue;
          const ok = cache.get(t.w);
          if (ok === undefined) { if (!inflight.has(t.w)) queued.add(t.w); continue; }
          if (!ok) errs.push({ s: t.s, e: t.e, kind: 'sp', text: t.w });
        }
      }
      for (const g of grammar) errs.push({ ...g, kind: 'gr' });
    }
    errs.sort((a, b) => a.s - b.s || a.e - b.e);
    const out = [];
    for (const r of errs) if (!out.length || r.s >= out[out.length - 1].e) out.push(r);
    errs = out;
    window.__lumenReview?.onPaint?.();
    if (!errs.length) { layer.textContent = ''; return; }
    let html = '', last = 0;
    errs.forEach((r, i) => {
      html += esc(v.slice(last, r.s)) + `<span class="sp-${r.kind}" data-i="${i}">${esc(v.slice(r.s, r.e))}</span>`;
      last = r.e;
    });
    layer.innerHTML = html + esc(v.slice(last)) + '\n';
  }

  // o corretor do navegador fica desligado quando o nosso funciona (no Android ele alimenta o teclado)
  function sync() {
    const on = enabled();
    ta.spellcheck = IS_ANDROID ? on : on && status === 'error';
    if (!on) { layer.textContent = ''; closePop(); }
  }

  // ---------- correção automática e ajustes de digitação ----------
  let applying = false, lastFix = null;
  function apply(start, end, text, caret) {
    applying = true;
    try { editor.replace(start, end, text, caret); } finally { applying = false; }
  }
  // troca do mesmo tamanho (ou não) preservando a seleção do usuário
  function swapKeepingCaret(start, end, text) {
    const { selectionStart: a, selectionEnd: b } = ta, d = text.length - (end - start);
    applying = true;
    try { editor.replace(start, end, text); } finally { applying = false; }
    ta.setSelectionRange(a >= end ? a + d : a, b >= end ? b + d : b);
  }

  // a palavra terminada em `end` acabou de ser concluída (espaço, pontuação ou Enter)
  function wordDone(end) {
    const s = st(), v = ta.value;
    const skip = v.length < BIG ? T.skipRanges(v) : [];
    const wb = T.wordBefore(v, end);
    if (!wb || T.inRanges(skip, wb.s)) return;
    if (s.typoCapitalize !== false) {
      const ed = T.capitalize(v, end, skip);
      if (ed && !noAuto.has(wb.w)) {
        swapKeepingCaret(ed.start, ed.end, ed.text);
        lastFix = { s: wb.s, from: wb.w, to: ed.text + wb.w.slice(1), caret: ta.selectionStart };
        wb.w = lastFix.to;
      }
    }
    if (!enabled() || s.spellAuto === false || status !== 'ready') return;
    const word = wb.w, at = wb.s;
    if (personal.has(word) || ignored.has(word) || noAuto.has(word) || noAuto.has(word.toLowerCase()) || cache.get(word) === true || word.length < 2) return;
    rpc('auto', { word }).then((fix) => {
      if (!fix || fix === word || document.activeElement !== ta) return;
      if (ta.value.slice(at, at + word.length) !== word) return; // o texto mudou nesse meio-tempo
      swapKeepingCaret(at, at + word.length, fix);
      cache.set(fix, true);
      lastFix = { s: at, from: word, to: fix, caret: ta.selectionStart, accent: true };
      paint();
    }).catch(() => {});
  }

  const BOUNDARY = /[\s,.;:!?…)\]}"'”’»]/;
  ta.addEventListener('input', (e) => {
    closePop();
    if (applying) return;
    const v = ta.value, caret = ta.selectionStart, s = st();
    const inserted = e.inputType?.startsWith('insert') && !e.isComposing && ta.selectionStart === ta.selectionEnd;
    typingAt = -1;
    if (inserted && caret > 0) {
      const c = v[caret - 1];
      if (BOUNDARY.test(c) && /[\p{L}\p{M}]/u.test(v[caret - 2] || '')) wordDone(caret - 1);
      else if (/[\p{L}\p{M}'’-]/u.test(c)) typingAt = T.wordBefore(v, caret)?.e ?? -1;
      // ajustes de pontuação e espaços (sobre o texto já com a correção acima)
      const v2 = ta.value, c2 = ta.selectionStart;
      const opts = { spaces: s.typoSpaces !== false, ellipsis: s.typoPunct !== false, dash: s.typoPunct !== false };
      if (opts.spaces || opts.ellipsis) {
        const skip = v2.length < BIG ? T.skipRanges(v2) : [];
        const ed = T.typo(v2, c2, opts, skip);
        if (ed) apply(ed.start, ed.end, ed.text, ed.caret);
        else if (s.typoQuotes && /["']/.test(v2[c2 - 1]) && !T.inRanges(skip, c2 - 1)) quote(v2, c2);
      }
    } else if (e.inputType?.startsWith('insertComposition') || e.isComposing) {
      typingAt = T.wordBefore(v, caret)?.e ?? -1;
    }
    if (v.length <= SYNC_LIMIT) refresh(true); else { layer.textContent = ''; refresh(); }
  });

  // aspas tipográficas (o par automático "" vira “” e pular a aspa de fechamento continua funcionando)
  function quote(v, caret) {
    const ch = v[caret - 1];
    const open = ch === '"' ? '“' : '‘', close = ch === '"' ? '”' : '’';
    if (v[caret] === close) { apply(caret - 1, caret + 1, close, caret); return; }
    if (v[caret] === ch) { apply(caret - 1, caret + 1, open + close, caret); return; }
    apply(caret - 1, caret, T.smartQuote(v, caret - 1, ch), caret);
  }

  // Enter conclui a palavra (antes de as listas inteligentes inserirem a quebra)
  ta.parentElement.addEventListener('keydown', (e) => {
    if (e.target !== ta) return;
    if (e.key === 'Enter' && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey && ta.selectionStart === ta.selectionEnd) {
      const p = ta.selectionStart;
      if (/[\p{L}\p{M}]/u.test(ta.value[p - 1] || '')) wordDone(p);
    }
    // Backspace logo depois de uma correção automática desfaz a correção
    if (e.key === 'Backspace' && lastFix && ta.selectionStart === ta.selectionEnd && ta.selectionStart === lastFix.caret
      && ta.value.slice(lastFix.s, lastFix.s + lastFix.to.length) === lastFix.to) {
      e.preventDefault(); e.stopPropagation();
      const f = lastFix; lastFix = null;
      swapKeepingCaret(f.s, f.s + f.to.length, f.from);
      noAuto.add(f.from);
      if (f.accent) ignored.add(f.from);
      refresh(true);
      return;
    }
    if (e.key !== 'Shift') lastFix = e.key === 'Backspace' ? lastFix : null;
    if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); e.stopPropagation(); closePop(); }
  }, true);
  ta.addEventListener('mousedown', () => { lastFix = null; });

  // ---------- sugestões ----------
  let popErr = null;
  function errAt(pos) { return errs.find((r) => pos >= r.s && pos <= r.e) || null; }
  function errAtPoint(x, y) {
    for (const sp of layer.querySelectorAll('span[data-i]')) {
      for (const r of sp.getClientRects()) if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 2 && y <= r.bottom + 2) return errs[sp.dataset.i];
    }
    return null;
  }
  function placePop(err) {
    const sp = layer.querySelector(`span[data-i="${errs.indexOf(err)}"]`);
    const r = sp?.getClientRects()[0] || ta.getBoundingClientRect();
    const vv = window.visualViewport, vh = vv ? vv.height + vv.offsetTop : window.innerHeight;
    const pr = pop.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + pr.height > vh - 8 || isTouch()) top = r.top - pr.height - 6;
    if (top < 8) top = r.bottom + 6;
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pr.width - 8)) + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  }
  function showPop(err) {
    popErr = err;
    const btn = (a, label, cls = '') => `<button type="button" class="sp-btn ${cls}" data-a="${a}">${label}</button>`;
    if (err.kind === 'sp') {
      pop.innerHTML = `<div class="sp-head">${ic('type', 14)}<span>${esc(err.text)}</span></div>
        <div class="sp-sugs"><span class="sp-wait">Procurando sugestões…</span></div>
        <div class="sp-actions">${btn('add', 'Adicionar ao dicionário')}${btn('ignore', 'Ignorar')}</div>`;
      rpc('suggest', { word: err.text }).then((list) => {
        if (popErr !== err) return;
        const box = pop.querySelector('.sp-sugs');
        box.innerHTML = list.length ? list.slice(0, isTouch() ? 4 : 6).map((w) => btn('use', esc(w), 'sp-sug')).join('') : '<span class="sp-wait">Nenhuma sugestão</span>';
        placePop(err);
      }).catch(() => { const b = pop.querySelector('.sp-sugs'); if (b) b.innerHTML = '<span class="sp-wait">Corretor indisponível</span>'; });
    } else {
      pop.innerHTML = `<div class="sp-head gr">${ic('check', 14)}<span>${esc(err.short || 'Revisão')}</span></div>
        <p class="sp-msg">${esc(err.msg)}</p>
        <div class="sp-sugs">${(err.reps || []).slice(0, 5).map((w) => btn('use', esc(w) || '<i>(remover)</i>', 'sp-sug')).join('')}</div>
        <div class="sp-actions">${btn('ignore', 'Ignorar')}</div>`;
    }
    pop.hidden = false;
    placePop(err);
  }
  function closePop() { if (pop.hidden) return false; pop.hidden = true; popErr = null; return true; }

  function useText(err, text) {
    if (ta.value.slice(err.s, err.e) !== err.text) { closePop(); refresh(true); return; }
    apply(err.s, err.e, text, err.s + text.length);
    if (err.kind === 'gr') grammar = grammar.filter((g) => g.id !== err.id);
    closePop();
    refresh(true);
  }
  pop.addEventListener('pointerdown', (e) => { if (e.target.closest('.sp-btn')) e.preventDefault(); });
  pop.addEventListener('mousedown', (e) => { if (e.target.closest('.sp-btn')) e.preventDefault(); });
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('.sp-btn'), err = popErr;
    if (!b || !err) return;
    if (b.dataset.a === 'use') useText(err, b.textContent === '(remover)' ? '' : b.textContent);
    else if (b.dataset.a === 'add') { closePop(); addWord(err.text); }
    else if (b.dataset.a === 'ignore') {
      closePop();
      if (err.kind === 'sp') ignored.add(err.text);
      else { grammar = grammar.filter((g) => g.id !== err.id); window.__lumenReview?.ignored?.(err); }
      refresh(true);
    }
  });

  ta.addEventListener('contextmenu', (e) => {
    const err = errAtPoint(e.clientX, e.clientY);
    if (!err) return;
    e.preventDefault();
    showPop(err);
  });
  // no celular: tocar numa palavra marcada abre as sugestões
  ta.addEventListener('click', () => {
    if (!isTouch() || ta.selectionStart !== ta.selectionEnd) return;
    const err = errAt(ta.selectionStart);
    if (err && err.e !== typingAt) showPop(err); else closePop();
  });
  document.addEventListener('mousedown', (e) => { if (!pop.hidden && !e.target.closest('#spell-pop')) closePop(); });
  pane?.addEventListener('scroll', () => { if (!pop.hidden && popErr) placePop(popErr); }, { passive: true });
  window.addEventListener('resize', () => closePop());
  ta.addEventListener('lumen-load', () => {
    closePop(); grammar = []; prevText = ta.value; typingAt = -1; lastFix = null;
    window.__lumenReview?.onLoad?.();
    refresh(true);
  });

  const prevBack = window.__lumenBack;
  window.__lumenBack = () => closePop() || !!prevBack?.();

  window.__lumenSpell = {
    sync: () => { sync(); refresh(true); },
    status: () => ({ status, error: loadError, words: personal.size }),
    personal: () => [...personal].sort((a, b) => a.localeCompare(b, 'pt')),
    addWord, removeWord,
    setIssues: (list) => { prevText = ta.value; grammar = list; paint(); },
    issues: () => grammar,
    errors: () => errs,
    show: (err) => showPop(err),
    use: (err, text) => useText(err, text),
    ignore: (err) => { grammar = grammar.filter((g) => g.id !== err.id); refresh(true); },
    refresh: () => refresh(true),
    reloadPersonal: () => { personalFor = null; return loadPersonal().then(() => refresh(true)); },
  };
  sync();
  // espera o app abrir o cofre antes de ler o dicionário pessoal
  setTimeout(() => refresh(true), 800);
})();
