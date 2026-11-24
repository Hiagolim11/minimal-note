// ---------- Revisão gramatical (LanguageTool) ----------
// Vírgulas, crase, concordância, regência… O texto da nota vai para o servidor escolhido nas
// configurações (o público, languagetool.org, ou um próprio). Desligado até o usuário ativar.
// Os problemas aparecem sublinhados no editor (camada do corretor) e no painel "Revisão".
/* global SpellText, editor, S, icon, toast, dialog, activeNote, setSetting, renderRight, applyLayout, openSettings */
(function () {
  const T = window.SpellText;
  const ta = document.getElementById('editor');
  const tabs = document.getElementById('right-tabs');
  if (!T || !ta || !tabs) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ic = (n, s) => (typeof icon === 'function' ? icon(n, s) : '');
  const SP = () => window.__lumenSpell;
  const st = () => (typeof S !== 'undefined' && S.settings) || {};

  // aba e painel no lado direito
  const tabBtn = document.createElement('button');
  tabBtn.dataset.rpanel = 'review';
  tabBtn.title = 'Revisão gramatical (F7)';
  tabBtn.innerHTML = ic('check', 16);
  tabs.appendChild(tabBtn);
  const panel = document.createElement('div');
  panel.className = 'rpanel';
  panel.dataset.rpanel = 'review';
  panel.hidden = true;
  panel.innerHTML = '<div class="rp-title">Revisão</div><div id="review"></div>';
  tabs.parentElement.appendChild(panel);
  const box = panel.querySelector('#review');

  let state = { running: false, error: '', done: false, path: null, count: 0 };
  const ignoredKeys = new Set(); // regra + trecho ignorados nesta sessão
  const keyOf = (i) => `${i.rule}|${i.text}`;

  async function ensureEnabled() {
    if (st().ltEnabled) return true;
    const ok = await dialog({
      title: 'Revisão gramatical',
      msg: 'A revisão de vírgulas, crase e concordância usa o LanguageTool.\n\nCom o servidor público, o texto desta nota é enviado para languagetool.org (há limite de uso por minuto). Se preferir, use um servidor próprio em Configurações › Editor.',
      ok: 'Usar servidor público', cancel: 'Cancelar',
    });
    if (!ok) return false;
    setSetting('ltEnabled', true);
    if (!st().ltServer) setSetting('ltServer', 'public');
    return true;
  }

  function showPanel() {
    if (window.innerWidth <= 760) return; // no celular, as marcas no texto bastam (tocar abre a sugestão)
    S.settings.rightPanel = 'review';
    if (!S.settings.rightOpen) { S.settings.rightOpen = true; applyLayout?.(); }
    renderRight?.();
  }

  async function run() {
    const note = typeof activeNote === 'function' ? activeNote() : null;
    if (!note) { toast?.('Abra uma nota para revisar'); return; }
    if (state.running) return;
    if (!(await ensureEnabled())) return;
    // nota protegida: o texto sai sem cifra para o servidor; o "sim" geral da revisão não vale para ela
    // (Protect é um const global, não fica em window)
    if (typeof Protect !== 'undefined' && Protect.isProtected(note.path)) {
      const where = st().ltServer === 'custom' ? `o servidor ${st().ltUrl || 'próprio'}` : 'languagetool.org';
      const ok = await dialog({
        title: 'Revisar nota protegida?',
        msg: `“${note.name}” é protegida por senha. Para revisar, o texto vai sem cifra para ${where}.`,
        ok: 'Enviar e revisar', cancel: 'Cancelar', danger: true,
      });
      if (!ok) return;
    }
    await window.lumen.settings.set(S.settings).catch(() => {}); // o processo principal lê o servidor daqui
    const text = ta.value;
    if (!text.trim()) { toast?.('A nota está vazia'); return; }
    state = { running: true, error: '', done: false, path: note.path, count: 0 };
    showPanel(); render();
    const max = st().ltServer === 'custom' ? 60000 : 15000;
    const found = [];
    try {
      const chunks = T.ltChunks(T.ltAnnotation(text), max);
      for (const c of chunks) {
        if (!c.annotation.some((i) => i.text?.trim())) continue;
        const matches = await window.lumen.lt.check({ data: JSON.stringify({ annotation: c.annotation }), language: 'pt-BR' });
        for (const m of matches) {
          if (m.rule?.issueType === 'misspelling') continue; // ortografia fica com o Hunspell
          const s = c.offset + m.offset, e = s + m.length;
          const item = {
            s, e, text: text.slice(s, e), msg: m.message || '', short: m.shortMessage || m.rule?.category || 'Revisão',
            reps: (m.replacements || []).filter((r) => r !== text.slice(s, e)).slice(0, 5), rule: m.rule?.id || '', cat: m.rule?.issueType || '',
          };
          item.id = `${item.rule}:${s}`;
          if (e > s && !ignoredKeys.has(keyOf(item))) found.push(item);
        }
      }
    } catch (e) {
      state.error = e.message || String(e);
    }
    if (activeNote()?.path !== state.path) { state.running = false; render(); return; } // trocou de nota
    // o usuário pode ter digitado durante a revisão: ajusta as posições
    const list = T.shiftRanges(found, text, ta.value);
    SP()?.setIssues(list);
    state = { ...state, running: false, done: !state.error, count: list.length };
    render();
    if (state.error) toast?.(state.error, 'error', 4000);
    else toast?.(list.length ? `${list.length} ${list.length === 1 ? 'sugestão' : 'sugestões'} de revisão` : 'Nenhum problema encontrado', list.length ? 'info' : 'success', 2200);
  }

  function lineContext(v, s, e) {
    const a = Math.max(v.lastIndexOf('\n', s - 1) + 1, s - 40), b = Math.min((v.indexOf('\n', e) + 1 || v.length + 1) - 1, e + 40);
    return `${a > 0 && v[a - 1] !== '\n' ? '…' : ''}${esc(v.slice(a, s))}<mark>${esc(v.slice(s, e)) || '&nbsp;'}</mark>${esc(v.slice(e, b))}${b < v.length && v[b] !== '\n' ? '…' : ''}`;
  }

  function render() {
    if (panel.hidden && !state.running) return;
    const s = st();
    if (!s.ltEnabled) {
      box.innerHTML = `<p class="rv-empty">Vírgulas, crase, concordância e regência com o <b>LanguageTool</b>. O texto da nota é enviado ao servidor escolhido.</p>
        <button class="btn primary rv-run">${ic('check', 15)}Revisar esta nota</button>
        <button class="btn rv-settings">${ic('settings', 15)}Configurar servidor</button>`;
      return;
    }
    const issues = SP()?.issues() || [];
    const v = ta.value;
    let head = `<div class="rv-head"><button class="btn primary rv-run" ${state.running ? 'disabled' : ''}>${ic('refresh', 15)}${state.running ? 'Revisando…' : (state.done ? 'Revisar de novo' : 'Revisar esta nota')}</button><span class="rv-kbd">F7</span></div>`;
    if (state.error) head += `<p class="rv-error">${esc(state.error)}</p>`;
    if (!state.done || state.running) { box.innerHTML = head + (state.running ? '' : '<p class="rv-empty">A revisão mostra aqui os problemas de pontuação e gramática da nota aberta.</p>'); return; }
    if (!issues.length) { box.innerHTML = head + '<p class="rv-empty">Nenhum problema encontrado. ✨</p>'; return; }
    box.innerHTML = head + `<div class="rv-count">${issues.length} ${issues.length === 1 ? 'sugestão' : 'sugestões'}</div>` + issues.map((i, n) => `
      <div class="rv-item" data-n="${n}">
        <div class="rv-short">${esc(i.short)}</div>
        <div class="rv-ctx">${lineContext(v, i.s, i.e)}</div>
        <div class="rv-msg">${esc(i.msg)}</div>
        <div class="rv-acts">${i.reps.map((r, k) => `<button class="rv-rep" data-k="${k}">${esc(r) || '<i>remover</i>'}</button>`).join('')}<button class="rv-ign">Ignorar</button></div>
      </div>`).join('');
  }

  box.addEventListener('click', (e) => {
    if (e.target.closest('.rv-run')) { run(); return; }
    if (e.target.closest('.rv-settings')) { openSettings?.('editor'); return; }
    const item = e.target.closest('.rv-item');
    if (!item) return;
    const issue = SP()?.issues()[item.dataset.n];
    if (!issue) return;
    const err = { ...issue, kind: 'gr' };
    const rep = e.target.closest('.rv-rep');
    if (rep) { SP().use(err, issue.reps[rep.dataset.k]); return; }
    if (e.target.closest('.rv-ign')) { ignoredKeys.add(keyOf(issue)); SP().ignore(err); return; }
    // clicar no item leva até o trecho
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(issue.s, issue.e);
    const c = editor.caretCoords(issue.s), pane = ta.closest('.pane'), pr = pane.getBoundingClientRect();
    if (c.top < pr.top + 60 || c.top > pr.bottom - 60) pane.scrollTo({ top: pane.scrollTop + c.top - pr.top - pr.height / 3, behavior: 'smooth' });
  });
  tabBtn.addEventListener('click', () => requestAnimationFrame(render));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F7' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); run(); }
  });

  let rt = 0;
  window.__lumenReview = {
    run,
    onPaint: () => { clearTimeout(rt); rt = setTimeout(render, 150); },
    onLoad: () => { state = { running: false, error: '', done: false, path: null, count: 0 }; render(); },
    ignored: (err) => ignoredKeys.add(keyOf(err)),
    render,
  };
})();
