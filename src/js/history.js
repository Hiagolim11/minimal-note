// ---------- Histórico de versões ----------
// Antes de gravar uma nota, guarda como ela estava no disco — no máximo uma versão a cada 10 min
// por nota — em .minimal-note/historico/<caminho>.json. Só usa lumen.fs: igual no PC e no Android.
// Nota protegida: a versão guardada é o texto cifrado do disco (restaurar pede a senha).
// Restaurar guarda antes a versão atual, então sempre dá para voltar atrás.
/* global S, lumen, writeNote, renamePath, saveNote, flushSave, openNote, activeNote, editor, onEdit, openPalette, dialog, toast, esc, icon, VaultCrypto, Protect */
const History = (() => {
  const DIR = '.minimal-note/historico/';
  const LIMITS = { gap: 10 * 60000, max: 40, bytes: 5e6, age: 180 * 86400000 };
  const fileOf = (path) => DIR + path + '.json';
  const lastSnap = new Map(); // caminho → hora da última versão guardada nesta sessão

  // descarta o que passou dos limites (mantém sempre a mais recente)
  function prune(list, now = Date.now(), lim = LIMITS) {
    let out = list.filter((v) => now - v.t <= lim.age).slice(-lim.max);
    let bytes = out.reduce((s, v) => s + v.content.length, 0);
    while (out.length > 1 && bytes > lim.bytes) { bytes -= out[0].content.length; out = out.slice(1); }
    return out;
  }

  async function load(path) {
    try { const a = JSON.parse(await lumen.fs.read(fileOf(path))); return Array.isArray(a) ? a.filter((v) => v && typeof v.content === 'string') : []; }
    catch { return []; } // ainda sem histórico
  }

  // guarda o conteúdo atual do disco como versão (force: ignora o intervalo de 10 min)
  async function snapshot(path, { force = false } = {}) {
    const now = Date.now();
    if (!force && now - (lastSnap.get(path) || 0) < LIMITS.gap) return false;
    let disk;
    try { disk = await lumen.fs.read(path); } catch { return false; } // nota ainda não está no disco
    lastSnap.set(path, now);
    if (!disk.trim()) return false;
    const list = await load(path), prev = list[list.length - 1];
    if (prev && prev.content === disk) return false;
    if (!force && prev && now - prev.t < LIMITS.gap) return false; // outra sessão guardou há pouco
    list.push({ t: now, content: disk });
    await lumen.fs.write(fileOf(path), JSON.stringify(prune(list, now)));
    return true;
  }

  // gravação: guarda a versão anterior antes (falhar no histórico nunca impede salvar a nota)
  const origWrite = writeNote;
  writeNote = async function (path) {
    if (S.pending.has(path)) { try { await snapshot(path); } catch (e) { console.warn('Histórico:', e.message); } }
    return origWrite(path);
  };

  // renomear/mover: o histórico acompanha a nota (ou a pasta)
  const origRename = renamePath;
  renamePath = async function (from, to, isFolder = false) {
    const r = await origRename(from, to, isFolder);
    const moved = isFolder ? [...S.notes.keys()].some((p) => p.startsWith(to + '/')) : S.notes.has(to) && !S.notes.has(from);
    if (moved && from !== to) {
      const src = isFolder ? DIR + from : fileOf(from), dst = isFolder ? DIR + to : fileOf(to);
      try { await lumen.fs.rename(src, dst); } catch { /* sem histórico, ou já existe no destino */ }
      for (const p of [...lastSnap.keys()]) if (p === from || (isFolder && p.startsWith(from + '/'))) { lastSnap.set(p === from ? to : to + p.slice(from.length), lastSnap.get(p)); lastSnap.delete(p); }
    }
    return r;
  };

  // ao proteger com senha: as versões antigas em texto aberto saem do histórico (só as cifradas ficam).
  // Sobrescreve o .json em vez de excluir: excluir mandaria o texto aberto para a lixeira.
  async function scrub(path) {
    const list = await load(path);
    const keep = list.filter((v) => VaultCrypto.isEncrypted(v.content));
    if (keep.length !== list.length) await lumen.fs.write(fileOf(path), JSON.stringify(keep));
  }
  if (typeof Protect !== 'undefined') {
    const pNote = Protect.protectNote, pFolder = Protect.protectFolder;
    Protect.protectNote = async (path = activeNote()?.path) => { const r = await pNote(path); if (path && Protect.isProtected(path)) await scrub(path); return r; };
    Protect.protectFolder = async (folder) => {
      const r = await pFolder(folder);
      for (const p of [...S.notes.keys()]) if (p.startsWith(folder + '/') && Protect.isProtected(p)) await scrub(p);
      return r;
    };
  }

  // diferença em linhas (aproximada: linhas que existem numa versão e não na outra)
  function lineDiff(a, b) {
    const count = (s) => { const m = new Map(); for (const l of s.split('\n')) m.set(l, (m.get(l) || 0) + 1); return m; };
    const A = count(a), B = count(b); let add = 0, del = 0;
    for (const [l, n] of B) add += Math.max(0, n - (A.get(l) || 0));
    for (const [l, n] of A) del += Math.max(0, n - (B.get(l) || 0));
    return { add, del };
  }
  const when = (t) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  async function restore(path, v) {
    const note = S.notes.get(path); if (!note) return;
    if (typeof Protect !== 'undefined' && Protect.isLocked(note)) return toast('Desbloqueie a nota primeiro');
    let text = v.content;
    if (VaultCrypto.isEncrypted(text)) {
      const pw = await dialog({ title: 'Versão protegida', msg: 'Esta versão está cifrada. Digite a senha que a nota tinha nessa época.', input: '', password: true, ok: 'Abrir' });
      if (pw == null) return;
      try { text = await VaultCrypto.decrypt(text, pw); } catch (e) { return toast(e.message, 'error'); }
    }
    const d = lineDiff(note.content, text);
    const preview = text.length > 280 ? text.slice(0, 280) + '…' : text;
    const ok = await dialog({ title: `Restaurar a versão de ${when(v.t)}?`, msg: `${preview}\n\n(+${d.add} / −${d.del} linhas em relação à atual. A versão atual também fica no histórico.)`, ok: 'Restaurar' });
    if (!ok) return;
    await flushSave(path);
    await snapshot(path, { force: true });
    openNote(path);
    editor.value = text;
    onEdit(text);
    await saveNote(path);
    toast('Versão restaurada', 'success');
  }

  async function open(path = activeNote()?.path) {
    if (!path || !S.notes.has(path)) return toast('Abra uma nota primeiro');
    const list = (await load(path)).reverse();
    if (!list.length) return toast('Ainda não há versões anteriores desta nota. Elas são guardadas enquanto você edita (no máximo uma a cada 10 minutos).', 'info', 5000);
    openPalette('', () => list.map((v) => ({
      html: `<span class="pl-icon">${icon('refresh', 17)}</span><span class="pl-main">${esc(when(v.t))}<span class="pl-sub">${VaultCrypto.isEncrypted(v.content) ? 'cifrada' : esc(v.content.replace(/\s+/g, ' ').slice(0, 70))}</span></span>`,
      run: () => restore(path, v),
    })), 'Versões anteriores (mais recente primeiro)…');
  }

  return { open, snapshot, load, prune, lineDiff, LIMITS };
})();
