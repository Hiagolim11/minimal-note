// ---------- Painel de tarefas ----------
// Junta todas as "- [ ]" do cofre. Datas: "📅 2026-12-01", "@2026-12-01" ou "due:2026-12-01".
// Ao digitar numa tarefa, "@hoje ", "@amanhã ", "@sexta ", "@+3d " viram "📅 AAAA-MM-DD ".
const Tasks = (() => {
  const LINE = /^(\s*)((?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s?(.*)$/;
  const DUE = /(?:📅\s*|@|due:)(\d{4}-\d{2}-\d{2})/u;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // tarefas de um texto: [{ line, done, text, due, raw }]
  function parse(content) {
    const out = [];
    let fence = false;
    content.split('\n').forEach((raw, line) => {
      if (/^\s*(```|~~~)/.test(raw)) fence = !fence;
      if (fence) return;
      const m = LINE.exec(raw);
      if (!m) return;
      const due = DUE.exec(m[4])?.[1] || null;
      const text = m[4].replace(/\s*(?:📅\s*|@|due:)\d{4}-\d{2}-\d{2}/gu, '').replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/gu, '').trim();
      out.push({ line, done: m[3] !== ' ', text, due, raw });
    });
    return out;
  }

  // em qual grupo a tarefa cai hoje
  function bucket(t, today = iso(new Date())) {
    if (t.done) return 'done';
    if (!t.due) return 'none';
    if (t.due < today) return 'overdue';
    if (t.due === today) return 'today';
    const week = iso(addDays(new Date(today + 'T12:00'), 7));
    return t.due <= week ? 'soon' : 'later';
  }

  // marcar/desmarcar (ao concluir, registra a data: "✅ AAAA-MM-DD")
  function toggleLine(raw, today = iso(new Date())) {
    const m = LINE.exec(raw); if (!m) return raw;
    if (m[3] === ' ') return `${m[1]}${m[2]}[x] ${m[4].replace(/\s+$/, '')} ✅ ${today}`.replace(/\[x\] \s*✅/, '[x] ✅');
    return `${m[1]}${m[2]}[ ] ${m[4].replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/gu, '')}`.replace(/\s+$/, '');
  }

  // "@hoje" → data; devolve AAAA-MM-DD ou null
  const WEEK = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  function quickDate(word, now = new Date()) {
    const w = word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/-feira$/, '');
    if (w === 'hoje') return iso(now);
    if (w === 'amanha') return iso(addDays(now, 1));
    if (w === 'semana') return iso(addDays(now, 7));
    const plus = /^\+(\d{1,3})d$/.exec(w); if (plus) return iso(addDays(now, Number(plus[1])));
    const wd = WEEK.indexOf(w);
    if (wd >= 0) { let d = (wd - now.getDay() + 7) % 7; if (d === 0) d = 7; return iso(addDays(now, d)); }
    return null;
  }

  const api = { parse, bucket, toggleLine, quickDate, iso };
  if (typeof module === 'object' && module.exports) { module.exports = api; return api; }

  // ---------------- interface ----------------
  const FILTERS = [['today', 'Hoje'], ['overdue', 'Atrasadas'], ['soon', 'Próximos 7 dias'], ['none', 'Sem data'], ['all', 'Todas'], ['done', 'Feitas']];
  let filter = 'today';
  const sidebar = document.getElementById('sidebar-left'), ribbon = document.querySelector('.ribbon');
  const panel = document.createElement('section');
  panel.className = 'panel'; panel.dataset.panel = 'tasks'; panel.hidden = true;
  panel.innerHTML = `<div class="panel-head"><span class="panel-title">Tarefas</span><div class="panel-actions"><button class="icon-btn sm" id="tasks-add-date" title="Pôr data na tarefa (ou digite @hoje, @amanhã, @sexta…)">${icon('calendar', 16)}</button></div></div>
    <div class="task-filters" id="task-filters">${FILTERS.map(([k, l]) => `<button data-f="${k}">${l}<span class="n"></span></button>`).join('')}</div>
    <div class="task-list" id="task-list"></div>`;
  sidebar.insertBefore(panel, sidebar.querySelector('.resizer'));
  const btn = document.createElement('button');
  btn.className = 'rb-btn'; btn.dataset.panel = 'tasks'; btn.title = 'Tarefas'; btn.innerHTML = icon('check', 20) + '<span class="rb-badge" hidden></span>';
  ribbon.querySelector('[data-panel="tags"]').after(btn);
  btn.addEventListener('click', () => showLeftPanel('tasks'));

  const excluded = (path) => path.startsWith(((S.settings.templatesFolder || 'Modelos') + '/')) || path.startsWith('.lixeira/');
  function collect() {
    const all = [];
    for (const n of S.notes.values()) { if (excluded(n.path)) continue; for (const t of parse(n.content)) all.push({ ...t, note: n }); }
    return all;
  }

  function render() {
    const today = iso(new Date()), all = collect(), counts = {};
    for (const t of all) { const b = bucket(t, today); counts[b] = (counts[b] || 0) + 1; }
    counts.all = all.filter((t) => !t.done).length;
    const urgent = (counts.overdue || 0) + (counts.today || 0);
    counts.today = urgent; // o filtro "Hoje" também mostra as atrasadas
    const badge = btn.querySelector('.rb-badge'); badge.hidden = !urgent; badge.textContent = urgent > 99 ? '99+' : urgent;
    if (panel.hidden) return;
    panel.querySelectorAll('[data-f]').forEach((b) => { b.classList.toggle('active', b.dataset.f === filter); b.querySelector('.n').textContent = counts[b.dataset.f] ? ' ' + counts[b.dataset.f] : ''; });
    const shown = all.filter((t) => (filter === 'all' ? !t.done : filter === 'today' ? ['today', 'overdue'].includes(bucket(t, today)) : bucket(t, today) === filter));
    shown.sort((a, b) => (a.due || '9999') .localeCompare(b.due || '9999') || b.note.mtime - a.note.mtime || a.line - b.line);
    const groups = new Map();
    for (const t of shown) { if (!groups.has(t.note.path)) groups.set(t.note.path, []); groups.get(t.note.path).push(t); }
    const fmt = (d) => { const b = bucket({ due: d }, today); const dt = new Date(d + 'T12:00'); return `<span class="due ${b}">${b === 'today' ? 'hoje' : b === 'overdue' ? 'atrasada · ' + dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</span>`; };
    const empty = { today: 'Nada para hoje. 🎉', overdue: 'Nenhuma tarefa atrasada.', soon: 'Nada nos próximos 7 dias.', none: 'Todas as tarefas têm data.', all: 'Nenhuma tarefa pendente. Crie uma com “- [ ]”.', done: 'Nenhuma tarefa feita ainda.' }[filter];
    $('#task-list').innerHTML = shown.length ? [...groups].map(([path, ts]) => `
      <div class="task-group"><div class="task-note" data-path="${esc(path)}">${icon('note', 14)}<span>${esc(ts[0].note.name)}</span></div>
      ${ts.map((t) => `<div class="task-item${t.done ? ' done' : ''}" data-path="${esc(path)}" data-line="${t.line}"><input type="checkbox"${t.done ? ' checked' : ''} aria-label="Concluir"><span class="task-txt">${esc(t.text) || '<i>(vazia)</i>'}</span>${t.due ? fmt(t.due) : ''}</div>`).join('')}</div>`).join('')
      : `<div class="rp-empty">${empty}</div>`;
  }

  // muda uma linha de uma nota (pelo editor se estiver aberta: mantém o desfazer)
  async function editLine(path, line, fn) {
    const note = S.notes.get(path); if (!note) return;
    const lines = note.content.split('\n'), old = lines[line]; if (old == null) return;
    const neu = fn(old); if (neu === old) return;
    if (activeNote()?.path === path && editor.ta.value === note.content) {
      const start = lines.slice(0, line).join('\n').length + (line ? 1 : 0);
      const sel = [editor.ta.selectionStart, editor.ta.selectionEnd];
      editor.replace(start, start + old.length, neu);
      editor.ta.setSelectionRange(...sel);
    } else {
      lines[line] = neu;
      indexNote(path, lines.join('\n'));
      note.version = (note.version || 0) + 1;
      S.pending.add(path); await saveNote(path);
    }
    render();
  }

  panel.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; render(); return; }
    const it = e.target.closest('.task-item');
    if (it && e.target.matches('input[type="checkbox"]')) { editLine(it.dataset.path, Number(it.dataset.line), (l) => toggleLine(l)); return; }
    const target = e.target.closest('[data-path]'); if (!target) return;
    openNote(target.dataset.path);
    if (target.dataset.line != null) setTimeout(() => { if (activeTab()?.mode === 'preview') setMode('edit'); editor.scrollToLine(Number(target.dataset.line)); }, 80);
    closeDrawersIfOverlay?.();
  });
  panel.querySelector('#tasks-add-date').addEventListener('click', () => addDateToCurrent());

  // põe/troca a data da tarefa na linha do cursor
  async function addDateToCurrent() {
    const n = activeNote(); if (!n) { toast('Abra uma nota com tarefas'); return; }
    const ln = editor.lineRange(editor.ta.selectionStart);
    if (!LINE.test(ln.text)) { toast('Coloque o cursor numa linha de tarefa (- [ ])'); return; }
    const cur = DUE.exec(ln.text)?.[1] || iso(new Date());
    const v = await dialog({ title: 'Data da tarefa', msg: 'AAAA-MM-DD, ou: hoje, amanhã, sexta, +3d', input: cur, ok: 'Definir' });
    if (!v) return;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : quickDate(v.trim());
    if (!d) { toast('Data não reconhecida', 'error'); return; }
    const out = DUE.test(ln.text) ? ln.text.replace(/(?:📅\s*|@|due:)\d{4}-\d{2}-\d{2}/u, '📅 ' + d) : ln.text.replace(/\s*$/, '') + ' 📅 ' + d;
    editor.replace(ln.start, ln.end, out);
    render();
  }

  // digitando numa tarefa: "@hoje " → "📅 2026-11-23 "
  const QUICK = /@(hoje|amanh[ãa]|semana|segunda(?:-feira)?|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado|domingo|\+\d{1,3}d) $/i;
  document.getElementById('editor').addEventListener('input', (e) => {
    if (!e.inputType?.startsWith('insert') || editor.ta.selectionStart !== editor.ta.selectionEnd) return;
    const c = editor.ta.selectionStart, ln = editor.lineRange(c), before = ln.text.slice(0, c - ln.start);
    if (!LINE.test(ln.text)) return;
    const m = QUICK.exec(before); if (!m) return;
    const d = quickDate(m[1]); if (!d) return;
    const s = c - m[0].length, rep = '📅 ' + d + ' ';
    editor.replace(s, c, rep, s + rep.length);
  });

  // lembretes: uma vez por dia, ao abrir e a cada 30 min
  function remind() {
    if (S.settings.taskReminders === false || !S.notes.size) return;
    const today = iso(new Date()), key = 'mn-remind-' + today;
    let sent = {}; try { sent = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* sem armazenamento */ }
    const due = collect().filter((t) => ['today', 'overdue'].includes(bucket(t, today)) && !sent[t.note.path + ':' + t.text]);
    if (!due.length) return;
    due.forEach((t) => { sent[t.note.path + ':' + t.text] = 1; });
    try { localStorage.setItem(key, JSON.stringify(sent)); } catch { /* ok */ }
    const body = due.slice(0, 4).map((t) => '• ' + t.text).join('\n') + (due.length > 4 ? `\n+${due.length - 4}` : '');
    const title = due.length === 1 ? '1 tarefa para hoje' : `${due.length} tarefas para hoje`;
    if (!IS_ANDROID && 'Notification' in window) {
      try { const n = new Notification(title, { body, silent: false }); n.onclick = () => { window.focus(); filter = 'today'; showLeftPanel('tasks'); }; return; } catch { /* cai no aviso */ }
    }
    toast(`${title}: ${due.slice(0, 2).map((t) => t.text).join(', ')}${due.length > 2 ? '…' : ''}`, 'info', 6000);
  }
  setTimeout(remind, 6000); setInterval(remind, 30 * 60000);

  // atualiza o painel quando as notas mudam (barato: assinatura pelos mtimes)
  let sig = '';
  setInterval(() => {
    if (!S.notes.size) return;
    let s = S.notes.size; for (const n of S.notes.values()) s += (n.version || 0) * 7 + (n.mtime % 100000);
    if (String(s) !== sig) { sig = String(s); render(); }
  }, 1500);

  return { ...api, render, collect, addDateToCurrent, remind, setFilter: (f) => { filter = f; render(); } };
})();
