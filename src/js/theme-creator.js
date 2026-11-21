// ---------- Criador de temas ----------
// Edita um rascunho de tema com pré-visualização ao vivo e salva em settings.customThemes.

const TC = {
  draft: null,      // tema em edição (normalizado)
  editingId: null,  // id do tema personalizado sendo editado (null = novo)
  gen: { base: '#8b7bff', dark: true, tint: 35, contrast: 50 },
  live: false,      // aplicar o rascunho no app inteiro
  dirty: false,
};

function tcNew(fromId) {
  const src = fromId ? themeOf(S.settings, fromId) : generatePalette(TC.gen);
  const baseName = fromId ? `${themeOf(S.settings, fromId).name} (cópia)` : 'Meu tema';
  TC.draft = normalizeTheme({ ...src, name: baseName });
  TC.editingId = null;
  TC.dirty = false;
}
function tcEdit(id) {
  const t = S.settings.customThemes?.[id];
  if (!t) return tcNew(id);
  TC.draft = normalizeTheme(structuredClone(t));
  TC.editingId = id;
  TC.dirty = false;
}
function tcStopLive() {
  if (!TC.live) return;
  TC.live = false;
  applyAppearance(S.settings);
  applyEffects();
  S.graph?.readColors();
}
function tcApplyLive() {
  if (!TC.live || !TC.draft) return;
  applyThemeVars(document.documentElement, TC.draft, TC.draft.accent);
  document.documentElement.dataset.mode = TC.draft.dark ? 'dark' : 'light';
  applyEffects();
}

function tcSlug(name) {
  const base = 'custom-' + (String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tema');
  let id = base, i = 2;
  while (S.settings.customThemes?.[id] || THEMES[id]) id = `${base}-${i++}`;
  return id;
}

function tcSave(apply) {
  const d = TC.draft;
  d.name = (d.name || '').trim() || 'Meu tema';
  d.surface = d.dark ? d.bg3.slice(0, 7) + '80' : d.bg.slice(0, 7) + 'cc';
  const id = TC.editingId || tcSlug(d.name);
  const themes = { ...(S.settings.customThemes || {}), [id]: normalizeTheme(d) };
  TC.editingId = id;
  TC.dirty = false;
  if (apply) { S.settings.accent = null; S.settings.theme = id; }
  setSetting('customThemes', themes);
  TC.live = false;
  toast(apply ? `Tema “${d.name}” salvo e aplicado` : `Tema “${d.name}” salvo`, 'success');
  renderSection();
}

async function tcDelete(id) {
  const t = S.settings.customThemes?.[id]; if (!t) return;
  const ok = await dialog({ title: 'Excluir tema', msg: `Excluir o tema “${t.name}”? Isso não pode ser desfeito.`, ok: 'Excluir', danger: true });
  if (!ok) return;
  const themes = { ...S.settings.customThemes }; delete themes[id];
  const ov = { ...S.settings.overrides }; delete ov[id];
  S.settings.overrides = ov;
  if (S.settings.theme === id) S.settings.theme = 'midnight';
  if (TC.editingId === id) tcNew();
  setSetting('customThemes', themes);
  toast('Tema excluído');
  renderSection();
}

function tcExportJson(t) {
  const { surface, ...rest } = normalizeTheme(t);
  return JSON.stringify({ minimalNoteTheme: 1, ...rest }, null, 2);
}
function tcDownload(t) {
  const blob = new Blob([tcExportJson(t)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (t.name || 'tema').replace(/[\\/:*?"<>|]+/g, '-') + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function tcImportText(txt) {
  let d;
  try { d = JSON.parse(txt); } catch { toast('JSON inválido', 'error'); return false; }
  if (d && typeof d === 'object' && d.colors && typeof d.colors === 'object') d = { ...d.colors, name: d.name, dark: d.dark };
  if (!d || !THEME_TOKENS.some(([k]) => isHex(d[k]))) { toast('Esse JSON não tem cores de tema', 'error'); return false; }
  TC.draft = normalizeTheme(d, d.dark === false ? THEMES.paper : THEMES.midnight);
  TC.editingId = null; TC.dirty = true;
  toast(`Tema “${TC.draft.name}” carregado — salve para guardar`, 'success');
  return true;
}

function tcRandom() {
  const h = Math.floor(Math.random() * 360);
  TC.gen = {
    base: hslToHex(h, 60 + Math.random() * 30, 58 + Math.random() * 10),
    dark: Math.random() < 0.65,
    tint: Math.round(15 + Math.random() * 60),
    contrast: Math.round(35 + Math.random() * 40),
  };
}

function tcGenerate() {
  const name = TC.draft?.name;
  const extras = Object.fromEntries(THEME_EXTRA_TOKENS.filter(([k]) => TC.draft?.[k]).map(([k]) => [k, TC.draft[k]]));
  TC.draft = normalizeTheme({ ...generatePalette(TC.gen), ...extras, name });
  TC.dirty = true;
}

function tcContrastBadge(fg, bg, min) {
  const r = contrastRatio(fg, bg);
  const cls = r >= min ? 'ok' : r >= min * 0.7 ? 'warn' : 'bad';
  return `<span class="tc-ratio ${cls}" title="Contraste ${r.toFixed(2)}:1 (recomendado ≥ ${min}:1)">${r.toFixed(1)}:1</span>`;
}

function tcColorField([k, label, hint], value, optional) {
  const v = value || '';
  return `<div class="tc-field${optional && !v ? ' empty' : ''}" data-field="${k}">
    <input type="color" class="color-input" data-tc="${k}" value="${(v || '#888888').slice(0, 7)}">
    <div class="tc-fl"><b>${label}</b><small>${hint}</small></div>
    <input type="text" class="tc-hex" data-tc-hex="${k}" value="${v.slice(0, 7)}" placeholder="${optional ? 'auto' : '#000000'}" spellcheck="false" maxlength="7">
    ${optional ? `<button class="icon-btn sm tc-clear" data-tc-clear="${k}" title="Usar padrão">${icon('x', 14)}</button>` : ''}
  </div>`;
}

function tcPreviewHtml() {
  return `<div class="tcp" id="tc-preview">
    <div class="tcp-top">
      <span class="tcp-dots"><i></i><i></i><i></i></span>
      <span class="tcp-tab active">Ideias</span><span class="tcp-tab">Diário</span>
    </div>
    <div class="tcp-body">
      <div class="tcp-side">
        <div class="tcp-item">${icon('folder', 12)}Projetos</div>
        <div class="tcp-item active">${icon('note', 12)}Ideias</div>
        <div class="tcp-item">${icon('note', 12)}Leituras</div>
        <div class="tcp-item faint">${icon('note', 12)}Arquivo</div>
      </div>
      <div class="tcp-main">
        <div class="tcp-h">Ideias para o projeto</div>
        <p>Texto normal com um <a class="tcp-link">link interno</a> e uma <span class="tcp-tag">#tag</span>.</p>
        <p class="tcp-muted">Texto secundário, usado em legendas.</p>
        <p><mark class="tcp-mark">trecho destacado</mark> e <code class="tcp-code-i">código</code></p>
        <div class="tcp-code"><span class="faint">// exemplo</span><br>const ideia = <span class="acc">"brilhante"</span>;</div>
        <div class="tcp-btns"><span class="tcp-btn primary">Salvar</span><span class="tcp-btn">Cancelar</span><span class="tcp-check"></span></div>
      </div>
    </div>
    <div class="tcp-status"><span>Salvo</span><span>124 palavras</span></div>
  </div>`;
}

function renderCreator(c) {
  if (!TC.draft) tcNew();
  const d = TC.draft, g = TC.gen;
  const mine = Object.entries(S.settings.customThemes || {});
  const baseOpts = Object.entries(allThemes(S.settings)).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join('');
  c.innerHTML = `<h2>Criador de temas</h2>
    <p class="sub">Monte seu próprio tema: gere uma paleta a partir de uma cor, ajuste cada detalhe e veja o resultado na hora.</p>
    <div class="tc-layout">
      <div class="tc-form">
        <div class="set-group"><h4>Identidade</h4>
          <div class="tc-namebar">
            <input type="text" id="tc-name" class="tc-input" value="${esc(d.name)}" placeholder="Nome do tema" maxlength="40" spellcheck="false">
            <div class="tc-seg" role="group">
              <button data-tc-mode="dark" class="${d.dark ? 'active' : ''}">Escuro</button>
              <button data-tc-mode="light" class="${!d.dark ? 'active' : ''}">Claro</button>
            </div>
          </div>
          <div class="tc-status">${TC.editingId ? `Editando “${esc(S.settings.customThemes[TC.editingId]?.name || d.name)}”` : 'Novo tema (ainda não salvo)'}${TC.dirty ? ' · <b>alterações não salvas</b>' : ''}</div>
        </div>

        <div class="set-group"><h4>Gerar paleta automaticamente</h4>
          <div class="tc-gen">
            <label class="tc-gen-color"><input type="color" class="color-input lg" id="tc-gen-base" value="${g.base}"><span>Cor base</span></label>
            <div class="tc-gen-sliders">
              <label><span>Tom no fundo <em id="tc-tint-v">${g.tint}%</em></span><input type="range" id="tc-gen-tint" min="0" max="100" value="${g.tint}"></label>
              <label><span>Contraste <em id="tc-con-v">${g.contrast}%</em></span><input type="range" id="tc-gen-contrast" min="0" max="100" value="${g.contrast}"></label>
            </div>
          </div>
          <div class="tc-actions">
            <button class="btn primary" id="tc-generate">${icon('wand', 15)}Gerar paleta</button>
            <button class="btn" id="tc-random">${icon('shuffle', 15)}Surpreenda-me</button>
            <span class="tc-from"><select id="tc-base">${baseOpts}</select><button class="btn" id="tc-load">Copiar de um tema</button></span>
          </div>
        </div>

        <div class="set-group"><h4>Cores</h4>
          <div class="tc-fields">${THEME_TOKENS.map((tk) => tcColorField(tk, d[tk[0]], false)).join('')}</div>
        </div>
        <div class="set-group"><h4>Cores do conteúdo <span class="tc-opt">opcional</span></h4>
          <div class="tc-fields">${THEME_EXTRA_TOKENS.map((tk) => tcColorField(tk, d[tk[0]], true)).join('')}</div>
        </div>
        <div class="set-group"><h4>Legibilidade</h4>
          <div class="tc-checks">
            <div>Texto sobre fundo ${tcContrastBadge(d.text, d.bg, 7)}</div>
            <div>Texto secundário ${tcContrastBadge(d.muted, d.bg, 4.5)}</div>
            <div>Texto nas barras ${tcContrastBadge(d.text, d.bg2, 7)}</div>
            <div>Destaque sobre fundo ${tcContrastBadge(d.accent, d.bg, 3)}</div>
          </div>
        </div>
      </div>

      <div class="tc-aside">
        <div class="tc-sticky">
          ${tcPreviewHtml()}
          <label class="tc-live"><span class="toggle"><input type="checkbox" id="tc-live" ${TC.live ? 'checked' : ''}><span></span></span>Pré-visualizar no app inteiro</label>
          <div class="tc-save">
            <button class="btn primary" id="tc-save-apply">${icon('check', 15)}Salvar e aplicar</button>
            <button class="btn" id="tc-save">${icon('save', 15)}Salvar</button>
          </div>
          <div class="tc-io">
            <button class="btn" id="tc-new">${icon('plus', 15)}Novo</button>
            <button class="btn" id="tc-copy" title="Copiar JSON">${icon('copy', 15)}Copiar</button>
            <button class="btn" id="tc-file" title="Salvar arquivo .json">${icon('download', 15)}Arquivo</button>
            <button class="btn" id="tc-import" title="Importar JSON">${icon('upload', 15)}Importar</button>
          </div>
          <input type="file" id="tc-file-input" accept=".json,application/json" hidden>
        </div>
      </div>
    </div>

    <div class="set-group"><h4>Meus temas (${mine.length})</h4>
      ${mine.length ? `<div class="tc-mine">${mine.map(([id, t]) => `
        <div class="tc-card${id === S.settings.theme ? ' active' : ''}${id === TC.editingId ? ' editing' : ''}">
          <div class="tc-card-prev" style="background:${t.bg}">
            ${['bg2', 'bg3', 'text', 'muted', 'accent'].map((k) => `<i style="background:${t[k]}"></i>`).join('')}
          </div>
          <div class="tc-card-body">
            <b>${esc(t.name)}</b><small>${t.dark ? 'Escuro' : 'Claro'}${id === S.settings.theme ? ' · em uso' : ''}</small>
          </div>
          <div class="tc-card-act">
            <button class="icon-btn sm" data-tc-use="${id}" title="Aplicar">${icon('check', 15)}</button>
            <button class="icon-btn sm" data-tc-edit="${id}" title="Editar">${icon('edit', 15)}</button>
            <button class="icon-btn sm" data-tc-dup="${id}" title="Duplicar">${icon('copy', 15)}</button>
            <button class="icon-btn sm" data-tc-dl="${id}" title="Exportar arquivo">${icon('download', 15)}</button>
            <button class="icon-btn sm danger" data-tc-del="${id}" title="Excluir">${icon('trash', 15)}</button>
          </div>
        </div>`).join('')}</div>` : '<p class="sub">Você ainda não criou temas. Os temas salvos aparecem aqui e na lista de temas em Aparência.</p>'}
    </div>`;
  const sel = $('#tc-base', c);
  if (sel) sel.value = TC.editingId || S.settings.theme;
  tcBind(c);
  tcRefreshPreview();
}

// Atualiza pré-visualização, campos e indicadores sem re-renderizar o formulário inteiro.
function tcRefreshPreview() {
  const d = TC.draft, p = $('#tc-preview');
  if (!p) return;
  applyThemeVars(p, d, d.accent);
  p.dataset.mode = d.dark ? 'dark' : 'light';
  tcApplyLive();
  const c = $('#settings-content');
  const checks = c.querySelector('.tc-checks');
  if (checks) checks.innerHTML = `
    <div>Texto sobre fundo ${tcContrastBadge(d.text, d.bg, 7)}</div>
    <div>Texto secundário ${tcContrastBadge(d.muted, d.bg, 4.5)}</div>
    <div>Texto nas barras ${tcContrastBadge(d.text, d.bg2, 7)}</div>
    <div>Destaque sobre fundo ${tcContrastBadge(d.accent, d.bg, 3)}</div>`;
  const st = c.querySelector('.tc-status');
  if (st) st.innerHTML = `${TC.editingId ? `Editando “${esc(S.settings.customThemes[TC.editingId]?.name || d.name)}”` : 'Novo tema (ainda não salvo)'}${TC.dirty ? ' · <b>alterações não salvas</b>' : ''}`;
}

function tcSetColor(k, v, from) {
  const c = $('#settings-content');
  const optional = THEME_EXTRA_TOKENS.some(([x]) => x === k);
  if (!v && optional) delete TC.draft[k];
  else if (isHex(v)) TC.draft[k] = v.length === 4 ? '#' + v.slice(1).split('').map((x) => x + x).join('') : v.slice(0, 7);
  else return;
  TC.dirty = true;
  const field = c.querySelector(`[data-field="${k}"]`);
  if (field) {
    field.classList.toggle('empty', optional && !TC.draft[k]);
    if (from !== 'color') field.querySelector('[data-tc]').value = (TC.draft[k] || '#888888').slice(0, 7);
    if (from !== 'hex') field.querySelector('[data-tc-hex]').value = TC.draft[k] || '';
  }
  tcRefreshPreview();
}

function tcBind(c) {
  $('#tc-name', c).addEventListener('input', (e) => { TC.draft.name = e.target.value; TC.dirty = true; tcRefreshPreview(); });
  c.querySelectorAll('[data-tc-mode]').forEach((b) => b.addEventListener('click', () => {
    const dark = b.dataset.tcMode === 'dark';
    if (dark === TC.draft.dark) return;
    // troca de modo: regera a paleta mantendo o destaque, para manter a legibilidade
    TC.gen = { ...TC.gen, dark, base: TC.draft.accent };
    tcGenerate();
    renderSection();
  }));
  c.querySelectorAll('[data-tc]').forEach((inp) => inp.addEventListener('input', () => tcSetColor(inp.dataset.tc, inp.value, 'color')));
  c.querySelectorAll('[data-tc-hex]').forEach((inp) => {
    inp.addEventListener('input', () => {
      let v = inp.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (!v || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { inp.classList.remove('invalid'); tcSetColor(inp.dataset.tcHex, v, 'hex'); }
      else inp.classList.add('invalid');
    });
    inp.addEventListener('blur', () => { inp.classList.remove('invalid'); inp.value = TC.draft[inp.dataset.tcHex] || ''; });
  });
  c.querySelectorAll('[data-tc-clear]').forEach((b) => b.addEventListener('click', () => tcSetColor(b.dataset.tcClear, '', 'btn')));

  const tint = $('#tc-gen-tint', c), con = $('#tc-gen-contrast', c), base = $('#tc-gen-base', c);
  tint.addEventListener('input', () => { TC.gen.tint = Number(tint.value); $('#tc-tint-v', c).textContent = tint.value + '%'; });
  con.addEventListener('input', () => { TC.gen.contrast = Number(con.value); $('#tc-con-v', c).textContent = con.value + '%'; });
  base.addEventListener('input', () => { TC.gen.base = base.value; });
  $('#tc-generate', c).addEventListener('click', () => { TC.gen.dark = TC.draft.dark; tcGenerate(); renderSection(); });
  $('#tc-random', c).addEventListener('click', () => { tcRandom(); tcGenerate(); renderSection(); });
  $('#tc-load', c).addEventListener('click', () => {
    const id = $('#tc-base', c).value;
    const keepName = TC.draft.name;
    TC.draft = normalizeTheme({ ...structuredClone(themeOf(S.settings, id)), name: keepName });
    TC.dirty = true; renderSection();
  });

  $('#tc-live', c).addEventListener('change', (e) => { TC.live = e.target.checked; if (TC.live) tcApplyLive(); else tcStopLive(); });
  $('#tc-save', c).addEventListener('click', () => tcSave(false));
  $('#tc-save-apply', c).addEventListener('click', () => tcSave(true));
  $('#tc-new', c).addEventListener('click', () => { tcRandom(); tcNew(); renderSection(); });
  $('#tc-copy', c).addEventListener('click', () => { navigator.clipboard.writeText(tcExportJson(TC.draft)); toast('JSON do tema copiado', 'success'); });
  $('#tc-file', c).addEventListener('click', () => tcDownload(TC.draft));
  $('#tc-import', c).addEventListener('click', async () => {
    const choice = await dialog({ title: 'Importar tema', msg: 'Cole o JSON do tema abaixo — ou deixe vazio e clique em “Escolher arquivo”.', input: '', ok: 'Importar' });
    if (choice === null || choice === false || choice === undefined) return;
    if (String(choice).trim()) { if (tcImportText(choice)) renderSection(); }
    else $('#tc-file-input', c).click();
  });
  $('#tc-file-input', c).addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 200000) return toast('Arquivo grande demais', 'error');
    if (tcImportText(await f.text())) renderSection();
  });

  c.querySelectorAll('[data-tc-use]').forEach((b) => b.addEventListener('click', () => { TC.live = false; S.settings.accent = null; setSetting('theme', b.dataset.tcUse); renderSection(); }));
  c.querySelectorAll('[data-tc-edit]').forEach((b) => b.addEventListener('click', () => { tcEdit(b.dataset.tcEdit); renderSection(); c.closest('.settings-body')?.scrollTo({ top: 0, behavior: 'smooth' }); }));
  c.querySelectorAll('[data-tc-dup]').forEach((b) => b.addEventListener('click', () => { tcNew(b.dataset.tcDup); TC.dirty = true; renderSection(); c.closest('.settings-body')?.scrollTo({ top: 0, behavior: 'smooth' }); }));
  c.querySelectorAll('[data-tc-dl]').forEach((b) => b.addEventListener('click', () => tcDownload(S.settings.customThemes[b.dataset.tcDl])));
  c.querySelectorAll('[data-tc-del]').forEach((b) => b.addEventListener('click', () => tcDelete(b.dataset.tcDel)));
}
