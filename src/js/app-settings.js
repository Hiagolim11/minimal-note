// Minimal Note — modal de configurações, Android (compartilhar/backup) e exportação.
// Scripts comuns (sem módulos): compartilham o escopo global e são carregados em ordem pelo index.html.

// ---------- configurações (modal) ----------
const SECTIONS = [
  { id: 'appearance', name: 'Aparência', icon: 'palette' },
  { id: 'creator', name: 'Criador de temas', icon: 'wand' },
  { id: 'effects', name: 'Partículas e cursor', icon: 'sparkles' },
  { id: 'typography', name: 'Tipografia', icon: 'type' },
  { id: 'editor', name: 'Editor', icon: 'edit' },
  { id: 'vault', name: 'Cofre e arquivos', icon: 'vault' },
  { id: 'css', name: 'CSS personalizado', icon: 'code' },
  { id: 'keys', name: 'Atalhos', icon: 'command' },
  { id: 'about', name: 'Sobre', icon: 'info' },
];
let curSection = 'appearance';

function openSettings(section) {
  if (section) curSection = section;
  if (curSection !== 'creator') tcStopLive();
  $('#settings').hidden = false;
  $('#settings-nav').innerHTML = '<div class="sn-title">Configurações</div>' + SECTIONS.map((s) => `<button data-sec="${s.id}" class="${s.id === curSection ? 'active' : ''}">${icon(s.icon, 17)}<span>${s.name}</span></button>`).join('');
  renderSection();
}
function closeSettings() { tcStopLive(); $('#settings').hidden = true; }

const row = (label, hint, ctl) => `<div class="set-row"><div class="lbl"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div><div class="ctl">${ctl}</div></div>`;
const toggleCtl = (key) => `<label class="toggle"><input type="checkbox" data-key="${key}" ${S.settings[key] ? 'checked' : ''}><span></span></label>`;
const rangeCtl = (key, min, max, step, fmt = (v) => v) => `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${S.settings[key]}"><span class="val" data-val="${key}">${fmt(S.settings[key])}</span>`;
const selectCtl = (key, opts) => `<select data-key="${key}">${Object.entries(opts).map(([v, l]) => `<option value="${v}" ${String(S.settings[key]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const FMT = { fontSize: (v) => v + 'px', lineHeight: (v) => Number(v).toFixed(2), contentWidth: (v) => (v >= 1400 ? 'Total' : v + 'px'), radius: (v) => v + 'px', autosaveDelay: (v) => v + 'ms' };

function renderSection() {
  const s = S.settings;
  const c = $('#settings-content');
  const fontOpts = Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.name]));
  if (curSection === 'appearance') {
    const t = { ...themeOf(s), ...(s.overrides[s.theme] || {}) };
    c.innerHTML = `<h2>Aparência</h2><p class="sub">Temas, cores e efeitos visuais. As mudanças são aplicadas na hora.</p>
      <div class="set-group"><h4>Tema</h4><div class="theme-grid">${Object.entries(allThemes(s)).map(([k, th]) => `
        <button class="theme-card${k === s.theme ? ' active' : ''}${s.customThemes[k] ? ' custom' : ''}" data-theme="${k}">${s.customThemes[k] ? `<span class="tc-badge" data-edit-theme="${k}" title="Editar no criador">${icon('edit', 13)}</span>` : ''}
          <div class="tc-prev" style="background:${th.bg}">
            <div class="tc-side" style="background:${th.bg2}"></div>
            <div class="tc-main" style="background:${th.bg3}">
              <div class="tc-line" style="background:${th.text};width:60%;opacity:.8"></div>
              <div class="tc-line" style="background:${th.muted};width:85%;opacity:.5"></div>
              <div class="tc-line" style="background:${th.accent};width:40%"></div>
            </div>
          </div>
          <div class="tc-name" style="background:${th.bg2};color:${th.text}"><span>${esc(th.name)}</span><span style="opacity:.6;font-weight:500">${th.dark ? 'Escuro' : 'Claro'}</span></div>
        </button>`).join('')}
        <button class="theme-card new-theme" id="tc-open-creator"><div class="nt-inner">${icon('wand', 22)}<span>Criar tema</span></div></button></div></div>
      <div class="set-group"><h4>Cor de destaque</h4>
        <div class="swatches">
          <button class="swatch auto${!s.accent ? ' active' : ''}" data-accent="" title="Cor do tema"></button>
          ${ACCENTS.map((a) => `<button class="swatch${s.accent === a ? ' active' : ''}" data-accent="${a}" style="background:${a}" title="${a}"></button>`).join('')}
          <input type="color" class="color-input" id="accent-custom" value="${s.accent || t.accent}" title="Cor personalizada">
        </div></div>
      <div class="set-group"><h4>Ajustar cores do tema “${esc(themeOf(s).name)}”</h4>
        <div class="color-overrides">${[['bg', 'Fundo'], ['bg2', 'Barras laterais'], ['bg3', 'Elementos'], ['border', 'Bordas'], ['text', 'Texto'], ['muted', 'Texto secundário']].map(([k, l]) =>
          `<label class="co-item"><input type="color" class="color-input" data-override="${k}" value="${String(t[k]).slice(0, 7)}">${l}</label>`).join('')}</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="reset-overrides">Restaurar cores do tema</button><button class="btn" id="export-theme">${icon('copy', 15)}Copiar tema (JSON)</button><button class="btn" id="import-theme">${icon('download', 15)}Importar tema</button></div>
      </div>
      <div class="set-group"><h4>Efeitos</h4>
        ${row('Fundo', 'Brilho suave da cor de destaque atrás da interface.', selectCtl('background', { plain: 'Liso', glow: 'Brilho', mesh: 'Aurora animada' }))}
        ${row('Vidro (translucidez)', 'Desfoque nas barras e janelas.', toggleCtl('glass'))}
        ${row('Arredondamento', '', rangeCtl('radius', 0, 20, 1, FMT.radius))}
        ${row('Densidade', '', selectCtl('density', { comfortable: 'Confortável', compact: 'Compacta' }))}
        ${row('Animações', '', toggleCtl('animations'))}
        ${row('Faixa de ícones', 'Barra vertical à esquerda.', toggleCtl('ribbon'))}
      </div>`;
  } else if (curSection === 'creator') {
    renderCreator(c);
    return;
  } else if (curSection === 'effects') {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const pct = (v) => v + '%';
    c.innerHTML = `<h2>Partículas e cursor</h2><p class="sub">Dê vida ao fundo e ao ponteiro do mouse. Tudo roda num único loop leve, que pausa quando a janela é minimizada.</p>
      ${!s.animations ? `<p class="fx-hint warn">As animações estão desligadas em Aparência — os efeitos ficam pausados. <button class="btn" id="fx-enable-anim" style="margin-left:6px">Ligar animações</button></p>` : ''}
      ${reduce ? '<p class="fx-hint warn">O sistema pediu “reduzir movimento”, então os efeitos ficam desligados.</p>' : ''}
      <div class="set-group"><h4>Estilos prontos</h4><div class="fx-presets">${Object.entries(FX_PRESETS).map(([id, p]) => `
        <button class="fx-preset${presetActive(id) ? ' active' : ''}" data-fx-preset="${id}"><span class="fx-ic">${icon(id === 'none' ? 'x' : 'sparkles', 16)}</span><b>${p.name}</b><small>${id === 'none' ? 'Sem efeitos' : `${FX_STYLES[p.fx.fxStyle]} · ${FX_CURSORS[p.fx.fxCursor]}`}</small></button>`).join('')}</div></div>
      <div class="set-group"><h4>Partículas de fundo</h4>
        ${row('Mostrar partículas', '', toggleCtl('fxParticles'))}
        ${row('Estilo', '', selectCtl('fxStyle', FX_STYLES))}
        ${row('Quantidade', '', rangeCtl('fxDensity', 5, 150, 5))}
        ${row('Velocidade', '', rangeCtl('fxSpeed', 5, 150, 5, pct))}
        ${row('Tamanho', '', rangeCtl('fxSize', 20, 150, 5, pct))}
        ${row('Intensidade', 'Brilho e opacidade das partículas.', rangeCtl('fxOpacity', 10, 100, 5, pct))}
        ${row('Cor', '', `<div class="fx-color-row">${selectCtl('fxColor', FX_COLORS)}<input type="color" class="color-input" data-key="fxCustomColor" value="${s.fxCustomColor}" title="Cor personalizada" ${s.fxColor === 'custom' ? '' : 'hidden'}></div>`)}
        ${row('Reação ao mouse', 'As partículas fogem ou são atraídas pelo ponteiro.', selectCtl('fxMouse', { none: 'Nenhuma', repel: 'Fugir', attract: 'Atrair' }))}
        ${row('Camada', 'Na frente: as partículas passam por cima das notas (sem bloquear cliques).', selectCtl('fxLayer', { back: 'Atrás da interface', front: 'Na frente' }))}
        ${row('Transparência da área de escrita', 'Quanto menor, mais o fundo e as partículas aparecem atrás do texto.', rangeCtl('workspaceOpacity', 40, 100, 2, pct))}
      </div>
      <div class="set-group"><h4>Cursor</h4>
        ${row('Efeito ao mover', '', selectCtl('fxCursor', FX_CURSORS))}
        ${row('Explosão ao clicar', 'Um estouro de brilhos a cada clique.', toggleCtl('fxClickBurst'))}
      </div>`;
  } else if (curSection === 'typography') {
    c.innerHTML = `<h2>Tipografia</h2><p class="sub">Fontes e medidas do texto.</p>
      <div class="set-group">
        ${row('Fonte da interface', '', selectCtl('fontUi', fontOpts))}
        ${row('Fonte do texto', 'Usada no editor e na leitura.', selectCtl('fontEditor', fontOpts))}
        ${row('Fonte personalizada', 'Nome de qualquer fonte instalada no sistema (sobrepõe a fonte do texto).', `<input type="text" data-key="customFont" value="${esc(s.customFont)}" placeholder="ex.: Segoe UI, Calibri">`)}
        ${row('Fonte de código', '', selectCtl('fontMono', fontOpts))}
        ${row('Tamanho', 'Ctrl + / Ctrl − também funcionam.', rangeCtl('fontSize', 11, 26, 1, FMT.fontSize))}
        ${row('Altura da linha', '', rangeCtl('lineHeight', 1.2, 2.2, 0.05, FMT.lineHeight))}
        ${row('Largura do texto', 'Linha legível; arraste ao máximo para largura total.', rangeCtl('contentWidth', 520, 1400, 20, FMT.contentWidth))}
      </div>
      <div class="font-preview"><div class="fp-h">O rápido gato marrom</div><div class="fp-p">Escrever é pensar com clareza. Este é um exemplo do seu texto com <code>código</code>, <b>negrito</b> e <i>itálico</i> — 0123456789.</div></div>`;
  } else if (curSection === 'editor') {
    c.innerHTML = `<h2>Editor</h2><p class="sub">Comportamento ao escrever.</p>
      <div class="set-group">
        ${row('Modo padrão de novas abas', '', selectCtl('defaultMode', { edit: 'Edição', split: 'Dividido', preview: 'Leitura' }))}
        ${row('Listas inteligentes', 'Enter continua listas, numeração e tarefas.', toggleCtl('smartLists'))}
        ${row('Fechar pares automaticamente', 'Parênteses, colchetes, aspas e crases.', toggleCtl('autoPair'))}
        ${row('Carregar imagens da internet', 'Desligado, abrir uma nota não avisa nenhum site (evita rastreadores em notas recebidas). Cada imagem vira um link que abre no navegador.', toggleCtl('remoteImages'))}
        ${IS_ANDROID ? '' : row('Captura rápida (Ctrl+Alt+N)', 'Em qualquer programa, abre uma janelinha para anotar; salva na nota “Caixa de entrada” ou numa nota nova.', toggleCtl('quickCapture'))}
        ${row('Bloquear notas protegidas', 'Depois de quantos minutos sem uso as notas com senha voltam a pedir a senha (0 = só ao fechar o app).', `<input type="number" min="0" max="240" step="1" data-key="lockMinutes" value="${Number(s.lockMinutes ?? 10)}" style="width:80px">`)}
        ${row('Lembrete de tarefas', 'Avisa uma vez por dia das tarefas para hoje e atrasadas (📅 data).', toggleCtl('taskReminders'))}
        ${row('Atraso do salvamento automático', '', rangeCtl('autosaveDelay', 200, 3000, 100, FMT.autosaveDelay))}
      </div>
      <div class="set-group"><h4>Correção ao escrever</h4>
        ${row('Corretor ortográfico', 'Português do Brasil, sem internet. Clique direito (ou toque) numa palavra sublinhada para ver sugestões.', toggleCtl('spellcheck'))}
        ${row('Corrigir acentos automaticamente', 'Só quando não há dúvida: nao → não, voce → você. Backspace logo depois desfaz.', toggleCtl('spellAuto'))}
        ${row('Maiúscula no início da frase', '', toggleCtl('typoCapitalize'))}
        ${row('Espaços e pontuação', 'Tira o espaço antes de vírgula e ponto e junta espaços repetidos.', toggleCtl('typoSpaces'))}
        ${row('Reticências e travessão', '... vira … e -- vira —', toggleCtl('typoPunct'))}
        ${row('Aspas tipográficas', '" vira “ ” (fora de código).', toggleCtl('typoQuotes'))}
        ${row('Dicionário pessoal', 'Palavras que você adicionou. Fica no cofre, em .minimal-note/dicionario.txt.', `<span class="val" id="dict-count">…</span><button class="btn" id="dict-edit">${icon('list', 15)}Ver palavras</button>`)}
        <div id="dict-list" class="dict-list" hidden></div>
      </div>
      <div class="set-group"><h4>Revisão gramatical (LanguageTool)</h4>
        ${row('Revisar vírgulas, crase e concordância', 'Use F7 ou o painel Revisão. O texto da nota é enviado ao servidor abaixo.', toggleCtl('ltEnabled'))}
        ${row('Servidor', s.ltServer === 'custom' ? 'O seu servidor LanguageTool (ex.: http://localhost:8081).' : 'languagetool.org: grátis, com limite de uso por minuto e de tamanho do texto.', selectCtl('ltServer', { public: 'Público (languagetool.org)', custom: 'Servidor próprio' }))}
        ${s.ltServer === 'custom' ? row('Endereço do servidor', 'https://… ou http:// só na sua rede.', `<input type="text" data-key="ltUrl" value="${esc(s.ltUrl)}" placeholder="http://localhost:8081">`) : ''}
      </div>`;
  } else if (curSection === 'vault') {
    c.innerHTML = `<h2>Cofre e arquivos</h2><p class="sub">Suas notas são arquivos .md comuns nesta pasta.</p>
      <div class="set-group">
        ${IS_ANDROID
          ? row('Cofre atual', esc(S.vault?.root || '') + (S.vault?.kind === 'app' ? ' — pasta privada: é apagada se o app for desinstalado. Faça backups ou escolha uma pasta do aparelho.' : ''), `<button class="btn primary" id="set-switch">${icon('vault', 15)}Escolher pasta</button>`)
            + row('Backup', 'Gera um .zip com todas as notas e anexos para salvar no Drive, enviar por e-mail etc.', `<button class="btn" id="set-backup">${icon('download', 15)}Fazer backup (.zip)</button>`)
            + row('Lixeira do cofre', 'Notas excluídas ficam na pasta .lixeira até você esvaziá-la.', `<span class="val" id="trash-count">…</span><button class="btn" id="set-empty-trash">${icon('trash', 15)}Esvaziar</button>`)
          : row('Cofre atual', esc(S.vault?.root || ''), `<button class="btn" id="set-reveal">${icon('external', 15)}Abrir pasta</button><button class="btn primary" id="set-switch">${icon('vault', 15)}Trocar</button>`)
            // só aparece quando algo foi para a .lixeira do cofre (local sem lixeira do sistema)
            + row('Lixeira do cofre', 'Itens excluídos onde não há lixeira do sistema (pendrive, rede…) ficam na pasta .lixeira do cofre.', `<span class="val" id="trash-count">…</span><button class="btn" id="set-empty-trash">${icon('trash', 15)}Esvaziar</button>`)}
        ${row('Pasta para novas notas', 'Vazio = raiz do cofre.', `<input type="text" data-key="newNoteFolder" value="${esc(s.newNoteFolder)}" placeholder="(raiz)">`)}
        ${row('Pasta de anexos', 'Onde imagens coladas são salvas.', `<input type="text" data-key="attachmentsFolder" value="${esc(s.attachmentsFolder)}">`)}
        ${row('Pasta das notas diárias', '', `<input type="text" data-key="dailyFolder" value="${esc(s.dailyFolder)}">`)}
        ${row('Pasta de modelos', 'Cada nota desta pasta vira um modelo (Ctrl+Shift+N). Use {{título}}, {{data}}, {{hora}}, {{cursor}}…', `<input type="text" data-key="templatesFolder" value="${esc(s.templatesFolder)}">`)}
        ${row('Modelo da nota diária', 'Nome do modelo usado pela nota diária (vazio = padrão do app).', `<input type="text" data-key="dailyTemplate" value="${esc(s.dailyTemplate)}">`)}
        ${row('Ordenação da árvore', '', selectCtl('sort', { name: 'Nome (A–Z)', mtime: 'Modificação recente' }))}
      </div>`;
  } else if (curSection === 'css') {
    c.innerHTML = `<h2>CSS personalizado</h2><p class="sub">Ajuste qualquer detalhe. Variáveis úteis: <code>--accent</code>, <code>--bg</code>, <code>--text</code>, <code>--font-editor</code>, <code>--radius</code>.</p>
      <textarea class="css-editor" id="css-editor" spellcheck="false" placeholder=".markdown h1 { color: var(--accent); }\n.tree-item { font-size: 14px; }">${esc(s.customCss)}</textarea>`;
  } else if (curSection === 'keys') {
    const keys = [['Nova nota', 'Ctrl N'], ['Paleta / abrir nota', 'Ctrl P'], ['Comandos', 'Ctrl Shift P'], ['Buscar no cofre', 'Ctrl Shift F'], ['Localizar na nota', 'Ctrl F'], ['Substituir na nota', 'Ctrl H'], ['Revisar gramática', 'F7'], ['Edição ↔ leitura', 'Ctrl E'], ['Modo dividido', 'Ctrl \\'], ['Grafo', 'Ctrl G'], ['Nota diária', 'Ctrl Shift D'], ['Fechar aba', 'Ctrl W'], ['Próxima aba', 'Ctrl Tab'], ['Salvar agora', 'Ctrl S'], ['Configurações', 'Ctrl ,'], ['Modo foco', 'F11'], ['Negrito / itálico', 'Ctrl B / Ctrl I'], ['Link', 'Ctrl K'], ['Tarefa', 'Ctrl L'], ['Riscado', 'Ctrl Shift X'], ['Destaque', 'Ctrl Shift H'], ['Indentar', 'Tab / Shift Tab'], ['Fonte maior / menor', 'Ctrl + / Ctrl −']];
    c.innerHTML = `<h2>Atalhos</h2><p class="sub">Atalhos de teclado disponíveis.</p><div class="set-group">${keys.map(([a, k]) => row(a, '', `<kbd>${k}</kbd>`)).join('')}</div>`;
  } else {
    c.innerHTML = `<div class="about"><div class="empty-logo">${icon('sparkles', 34)}</div><h2>Minimal Note</h2><p class="sub">Versão <span id="app-version">…</span> · notas em Markdown, locais e suas.</p>
      <p class="sub">${S.notes.size} notas · ${[...S.notes.values()].reduce((a, n) => a + n.words, 0).toLocaleString('pt-BR')} palavras no cofre</p></div>
      <div class="set-group">
        ${row('Procurar atualizações', 'Uma vez por dia o app consulta o GitHub e avisa se há versão nova. Nada é baixado sozinho.', toggleCtl('checkUpdates'))}
        ${row('Procurar agora', '', `<button class="btn" id="upd-now">${icon('refresh', 15)}Procurar</button>`)}
      </div>`;
    lumen.app?.version().then((v) => { const el = $('#app-version', c); if (el) el.textContent = v; }).catch(() => {});
    $('#upd-now', c)?.addEventListener('click', () => Updates.check({ manual: true }));
  }
  bindSection();
}

function bindSection() {
  const c = $('#settings-content');
  c.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'range') v = Number(v);
      if (['newNoteFolder', 'attachmentsFolder', 'dailyFolder', 'templatesFolder'].includes(key)) v = v.split('/').map(cleanName).filter(Boolean).join('/');
      setSetting(key, v);
      const out = c.querySelector(`[data-val="${key}"]`);
      if (out) out.textContent = (FMT[key] || ((x) => x))(v);
      if (key === 'spellcheck') window.__lumenSpell?.sync();
      if (key === 'ltServer') renderSection();
      if (key === 'quickCapture') lumen.settings.set(S.settings); // o atalho global fica no processo principal
      if (key === 'remoteImages') lumen.settings.set(S.settings).then(renderPreview); // o processo principal (desktop) lê daqui
      if (key === 'sort') renderTree();
      requestAnimationFrame(() => editor.autosize());
    });
  });
  c.querySelectorAll('[data-fx-preset]').forEach((b) => b.addEventListener('click', () => { applyFxPreset(b.dataset.fxPreset); renderSection(); }));
  $('#fx-enable-anim', c)?.addEventListener('click', () => { setSetting('animations', true); renderSection(); });
  c.querySelectorAll('select[data-key="fxColor"], select[data-key="fxStyle"], select[data-key="fxCursor"], select[data-key="fxMouse"], select[data-key="fxLayer"], input[data-key="fxParticles"], input[data-key="fxClickBurst"]').forEach((el) => el.addEventListener('change', () => renderSection()));
  c.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', (e) => {
    if (e.target.closest('[data-edit-theme]')) { tcEdit(b.dataset.theme); curSection = 'creator'; openSettings(); return; }
    S.settings.accent = null; setSetting('theme', b.dataset.theme); renderSection();
  }));
  $('#tc-open-creator', c)?.addEventListener('click', () => { tcNew(); curSection = 'creator'; openSettings(); });
  c.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => { setSetting('accent', b.dataset.accent || null); renderSection(); }));
  $('#accent-custom', c)?.addEventListener('input', (e) => { setSetting('accent', e.target.value); c.querySelectorAll('.swatch').forEach((x) => x.classList.remove('active')); });
  c.querySelectorAll('[data-override]').forEach((inp) => inp.addEventListener('input', () => {
    const th = S.settings.theme;
    S.settings.overrides = { ...S.settings.overrides, [th]: { ...(S.settings.overrides[th] || {}), [inp.dataset.override]: inp.value } };
    setSetting('overrides', S.settings.overrides);
  }));
  $('#reset-overrides', c)?.addEventListener('click', () => { const o = { ...S.settings.overrides }; delete o[S.settings.theme]; setSetting('overrides', o); renderSection(); });
  $('#export-theme', c)?.addEventListener('click', () => {
    const s = S.settings;
    const data = { theme: s.theme, accent: s.accent, overrides: s.overrides[s.theme] || {}, fontUi: s.fontUi, fontEditor: s.fontEditor, fontMono: s.fontMono, fontSize: s.fontSize, lineHeight: s.lineHeight, radius: s.radius, background: s.background, glass: s.glass, customCss: s.customCss, ...Object.fromEntries(FX_KEYS.map((k) => [k, s[k]])) };
    if (s.customThemes[s.theme]) data.customTheme = s.customThemes[s.theme];
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)); toast('Tema copiado para a área de transferência', 'success');
  });
  $('#import-theme', c)?.addEventListener('click', async () => {
    const txt = await dialog({ title: 'Importar tema', msg: 'Cole o JSON exportado de um tema.', input: '', ok: 'Importar' });
    if (!txt) return;
    try {
      const d = JSON.parse(txt);
      const allowed = ['theme', 'accent', 'fontUi', 'fontEditor', 'fontMono', 'fontSize', 'lineHeight', 'radius', 'background', 'glass', 'customCss', ...FX_KEYS];
      // só aceita valores do mesmo tipo que o padrão (evita configurações quebradas)
      allowed.forEach((k) => { if (d[k] !== undefined && (DEFAULT_SETTINGS[k] === null || typeof d[k] === typeof DEFAULT_SETTINGS[k])) S.settings[k] = d[k]; });
      if (d.customTheme && String(d.theme).startsWith('custom-')) S.settings.customThemes = { ...S.settings.customThemes, [d.theme]: normalizeTheme(d.customTheme) };
      if (!allThemes(S.settings)[S.settings.theme]) S.settings.theme = 'midnight';
      if (d.overrides) S.settings.overrides = { ...S.settings.overrides, [S.settings.theme]: d.overrides };
      setSetting('theme', S.settings.theme); renderSection(); toast('Tema importado', 'success');
    } catch { toast('JSON inválido', 'error'); }
  });
  $('#css-editor', c)?.addEventListener('input', debounce((e) => setSetting('customCss', e.target.value), 250));
  $('#css-editor', c)?.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } });
  $('#set-switch', c)?.addEventListener('click', async () => { await chooseVault(); renderSection(); });
  $('#set-reveal', c)?.addEventListener('click', () => lumen.shell.reveal(''));
  $('#set-backup', c)?.addEventListener('click', backupVault);
  if ($('#dict-count', c)) {
    const SP = window.__lumenSpell;
    const upd = () => {
      const words = SP?.personal() || [], st = SP?.status() || {};
      $('#dict-count', c).textContent = st.status === 'error' ? 'corretor indisponível' : `${words.length} ${words.length === 1 ? 'palavra' : 'palavras'}`;
      const list = $('#dict-list', c);
      list.innerHTML = words.length
        ? words.map((w) => `<span class="dict-word">${esc(w)}<button title="Remover" data-word="${esc(w)}">${icon('x', 12)}</button></span>`).join('')
        : '<span class="dict-empty">Nenhuma palavra ainda. Clique direito numa palavra sublinhada › Adicionar ao dicionário.</span>';
    };
    upd();
    $('#dict-edit', c).addEventListener('click', () => { const l = $('#dict-list', c); l.hidden = !l.hidden; });
    $('#dict-list', c).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-word]');
      if (b) { await SP?.removeWord(b.dataset.word); upd(); }
    });
  }
  if ($('#trash-count', c)) {
    const upd = async () => {
      const n = await lumen.vault.trashCount(); const el = $('#trash-count', c); if (!el) return;
      el.textContent = n ? `${n} ${n > 1 ? 'itens' : 'item'}` : 'vazia'; $('#set-empty-trash', c).disabled = !n;
      if (!IS_ANDROID) el.closest('.set-row').hidden = !n;
    };
    upd();
    $('#set-empty-trash', c).addEventListener('click', async () => {
      if (!await confirmBox('Esvaziar lixeira?', 'Os itens da pasta .lixeira serão apagados de vez. Isso não pode ser desfeito.', 'Esvaziar')) return;
      try { await lumen.vault.emptyTrash(); toast('Lixeira esvaziada', 'success'); } catch (e) { toast(e.message, 'error'); }
      upd();
    });
  }
}

async function chooseVault() {
  const dir = await lumen.vault.choose();
  if (!dir) return;
  await openVault(dir);
  toast(`Cofre “${S.vault.name}” aberto`, 'success');
}

function cycleTheme() {
  const all = allThemes(S.settings), keys = Object.keys(all);
  const next = keys[(keys.indexOf(S.settings.theme) + 1) % keys.length];
  S.settings.accent = null;
  setSetting('theme', next);
  toast(`Tema: ${all[next].name}`);
}

// ---------- Android: compartilhar, backup, textos recebidos ----------
async function shareNote(path = activeNote()?.path) {
  const n = path && S.notes.get(path); if (!n) return toast('Abra uma nota primeiro', 'error');
  await flushSave(n.path);
  lumen.share?.(n.name, n.content);
}
async function backupVault() {
  await flushAll();
  try { const r = await lumen.vault.backup(); toast(`Backup pronto: ${r.files} arquivos`, 'success'); } catch (e) { toast('Não foi possível criar o backup: ' + e.message, 'error'); }
}
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
async function handleIntent(it) {
  if (!it || !S.vault) return;
  if (it.type === 'new') return createNote({});
  if (it.type === 'daily') return dailyNote();
  if (it.type === 'search') return showLeftPanel('search');
  if (it.type === 'tasks') { Tasks.setFilter('today'); return showLeftPanel('tasks'); }
  if (it.type === 'error') return toast('Não foi possível abrir: ' + it.message, 'error', 5000);
  // arquivo .md/.txt enviado por "Compartilhar" (como anexo): importa com o nome dele
  if (it.type === 'share' && it.name && /\.(md|markdown|txt)$/i.test(it.name)) it = { ...it, type: 'file' };
  const text = String(it.text || '').replace(/\r\n?/g, '\n');
  if (it.type === 'file') {
    const name = safeName(String(it.name || '').replace(/\.(md|markdown|txt)$/i, '')) || 'Nota importada';
    const same = [...S.notes.values()].find((n) => n.content === text);
    if (same) { openNote(same.path, { mode: 'preview' }); return toast('Essa nota já está no cofre'); }
    const rel = await createNote({ name, content: text, focusTitle: false });
    if (rel) toast('Nota importada para o cofre', 'success');
    return;
  }
  if (it.type === 'share') {
    const t = text.trim();
    if (!t) return;
    const url = /^https?:\/\/\S+$/.test(t) ? t : null;
    const subject = safeName(it.subject);
    let name = subject;
    if (!name && url) { try { name = 'Link ' + new URL(url).hostname.replace(/^www\./, ''); } catch { name = 'Link'; } }
    if (!name) name = safeName(t.split('\n').find((l) => l.trim()).replace(/^[#>*\-\s]+/, '').slice(0, 60));
    const content = url ? `[${subject || url}](${url})\n` : t + '\n';
    const rel = await createNote({ name: name || 'Compartilhado', content, focusTitle: false });
    if (rel) toast('Nota criada a partir do compartilhamento', 'success');
  }
}

// ---------- exportação ----------
function collectCss() {
  let css = '';
  for (const sh of document.styleSheets) {
    try { if (sh.href && sh.href.includes('content.css')) css += [...sh.cssRules].map((r) => r.cssText).join('\n'); } catch { /* bloqueado */ }
  }
  const cs = getComputedStyle(document.documentElement);
  const vars = ['--bg', '--bg-3', '--border', '--text', '--text-muted', '--text-faint', '--code-bg', '--accent', '--accent-soft', '--accent-softer', '--hover', '--font-editor', '--font-mono', '--font-size', '--line-height', '--radius', '--radius-sm'].map((v) => `${v}:${cs.getPropertyValue(v)}`).join(';');
  const extra = ['--heading', '--link', '--tag', '--highlight'].map((v) => [v, cs.getPropertyValue(v).trim()]).filter(([, x]) => x).map(([v, x]) => `${v}:${x}`).join(';');
  return `:root{${vars};${extra};color-scheme:${document.documentElement.dataset.mode || 'dark'}} body{margin:0;background:var(--bg);color:var(--text)} .wrap{max-width:780px;margin:0 auto;padding:48px 24px} ${css}`;
}
async function exportHtml() {
  const n = activeNote(); if (!n) return toast('Abra uma nota primeiro', 'error');
  const frag = MD.render(n.content);
  await MD.renderDiagrams(frag);
  frag.querySelectorAll('.copy-code').forEach((b) => b.remove());
  const body = frag.innerHTML;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.name)}</title><style>${collectCss()}</style></head><body><div class="wrap">${startsWithOwnTitle(n) ? '' : `<h1 class="note-title-static">${esc(n.name)}</h1>`}<article class="markdown">${body}</article></div></body></html>`;
  const out = await lumen.fs.exportHtml(n.name + '.html', html).catch((e) => toast(e.message, 'error'));
  if (out) toast('Exportado: ' + out, 'success', 4000);
}
async function exportPdf() {
  const n = activeNote(); if (!n) return toast('Abra uma nota primeiro', 'error');
  const root = $('#print-root');
  root.innerHTML = startsWithOwnTitle(n) ? '' : `<h1 class="print-title">${esc(n.name)}</h1>`;
  const art = document.createElement('article'); art.className = 'markdown';
  art.append(...MD.render(n.content).childNodes);
  root.appendChild(art);
  try {
    const out = await lumen.fs.exportPdf(n.name + '.pdf');
    if (out) toast('PDF salvo: ' + out, 'success', 4000);
  } catch (e) { toast(e.message, 'error'); }
  root.innerHTML = '';
}
