// ---------- Modelos de nota ----------
// Notas da pasta "Modelos" (configurável) viram modelos. Espaços automáticos:
//   {{título}} {{data}} {{data:DD/MM/YYYY}} {{hora}} {{dia_semana}} {{amanhã}} {{ontem}} {{cursor}}
// Formatos de data: YYYY MM DD HH mm, dddd (dia da semana), MMMM (mês); texto fixo entre [colchetes].
const Templates = (() => {
  const WEEK = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MONTH = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const pad = (n) => String(n).padStart(2, '0');
  function formatDate(d, fmt) {
    return fmt.replace(/\[([^\]]*)\]|YYYY|MMMM|MM|DD|dddd|HH|mm/g, (t, lit) => {
      if (lit != null) return lit;
      return { YYYY: d.getFullYear(), MMMM: MONTH[d.getMonth()], MM: pad(d.getMonth() + 1), DD: pad(d.getDate()), dddd: WEEK[d.getDay()], HH: pad(d.getHours()), mm: pad(d.getMinutes()) }[t];
    });
  }
  const iso = (d) => formatDate(d, 'YYYY-MM-DD');
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // texto do modelo → { text, cursor } (cursor = posição de {{cursor}}, ou −1)
  function apply(src, { title = '', date = new Date() } = {}) {
    let text = src.replace(/\{\{\s*([^}:]+?)\s*(?::\s*([^}]*?))?\s*\}\}/g, (all, keyRaw, arg) => {
      const key = keyRaw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '_');
      if (key === 'titulo' || key === 'title') return title;
      if (key === 'data' || key === 'date') return arg ? formatDate(date, arg) : iso(date);
      if (key === 'hora' || key === 'time') return formatDate(date, arg || 'HH:mm');
      if (key === 'dia_semana' || key === 'weekday') return WEEK[date.getDay()];
      if (key === 'amanha' || key === 'tomorrow') return arg ? formatDate(addDays(date, 1), arg) : iso(addDays(date, 1));
      if (key === 'ontem' || key === 'yesterday') return arg ? formatDate(addDays(date, -1), arg) : iso(addDays(date, -1));
      if (key === 'cursor') return '\u0000';
      return all;
    });
    const cursor = text.indexOf('\u0000');
    text = text.replace(/\u0000/g, '');
    return { text, cursor };
  }

  const DEFAULTS = {
    'Reunião': '# {{título}}\n\n**Data:** {{data:DD/MM/YYYY}} às {{hora}}\n**Participantes:** \n\n## Pauta\n- {{cursor}}\n\n## Decisões\n- \n\n## Próximos passos\n- [ ] responsável — tarefa 📅 {{amanhã}}\n\n#reunião\n',
    'Diário': '# {{data:dddd, DD [de] MMMM [de] YYYY}}\n\n## Como estou\n{{cursor}}\n\n## Tarefas de hoje\n- [ ] \n\n## Notas\n\n## Gratidão\n- \n\n#diário\n',
    'Projeto': '---\nstatus: em andamento\ninício: {{data}}\n---\n# {{título}}\n\n## Objetivo\n{{cursor}}\n\n## Entregas\n- [ ] \n\n## Ideias e referências\n- \n\n## Registro\n- {{data:DD/MM}}: projeto criado\n\n#projeto\n',
    'Leitura': '# {{título}}\n\n**Autor:** \n**Começado em:** {{data:DD/MM/YYYY}}\n**Nota:** ⭐⭐⭐⭐⭐\n\n## Resumo\n{{cursor}}\n\n## Citações\n> \n\n## O que levo disso\n- \n\n#leitura\n',
  };

  const folder = () => (typeof S !== 'undefined' && S.settings.templatesFolder) || 'Modelos';
  const list = () => [...S.notes.values()].filter((n) => n.path.startsWith(folder() + '/')).sort((a, b) => a.name.localeCompare(b.name, 'pt'));

  async function ensureDefaults() {
    if (list().length) return;
    for (const [name, body] of Object.entries(DEFAULTS)) await lumen.fs.write(`${folder()}/${name}.md`, body);
    await refreshVault();
    toast(`Criei 4 modelos de exemplo na pasta “${folder()}”`, 'success', 3200);
  }

  // nova nota a partir de um modelo (escolhido na paleta)
  async function newFromTemplate() {
    await ensureDefaults();
    openPalette('', (q) => list()
      .map((n) => ({ n, f: q ? fuzzy(q, n.name) : { idx: [], score: 0 } })).filter((x) => x.f)
      .sort((a, b) => b.f.score - a.f.score)
      .map(({ n, f }) => ({
        html: `<span class="pl-icon">${icon('copy', 17)}</span><span class="pl-main">${hlIdx(n.name, f.idx)}<span class="pl-sub">modelo</span></span>`,
        run: () => createFrom(n),
      })), 'Escolha um modelo…');
  }

  async function createFrom(tpl, { name } = {}) {
    const date = new Date();
    if (name == null) {
      name = await dialog({ title: 'Nova nota', msg: `Modelo: ${tpl.name}`, input: `${tpl.name} ${formatDate(date, 'DD-MM-YYYY')}`, ok: 'Criar' });
      if (!name) return null;
    }
    const clean = cleanName(name) || tpl.name;
    const { text, cursor } = apply(tpl.content, { title: clean, date });
    const rel = await createNote({ name: clean, content: text, newTab: true, focusTitle: false });
    if (rel && cursor >= 0) setTimeout(() => { if (activeTab()?.path === rel) { editor.ta.focus(); editor.ta.setSelectionRange(cursor, cursor); } }, 120);
    return rel;
  }

  // nota diária: usa o modelo "Diário" se existir
  const dailyTemplate = () => list().find((n) => n.name.toLowerCase() === ((S.settings.dailyTemplate || 'Diário').toLowerCase()));

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); e.stopPropagation(); newFromTemplate(); }
  }, true);

  return { apply, formatDate, newFromTemplate, createFrom, ensureDefaults, list, dailyTemplate, DEFAULTS };
})();
