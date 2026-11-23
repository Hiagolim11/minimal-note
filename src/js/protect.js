// ---------- Notas protegidas por senha ----------
// O arquivo no disco fica sempre cifrado (VaultCrypto). Depois de desbloquear, o texto fica só na
// memória desta sessão; cada salvamento cifra de novo. "Bloquear agora" (ou o tempo sem uso) esquece as senhas.
// No Android, dá para guardar a senha protegida pela digital (cofre de chaves do sistema).
/* global VaultCrypto */
const Protect = (() => {
  const V = VaultCrypto;
  const unlocked = new Map();   // caminho → senha (só nesta sessão)
  const lastCipher = new Map(); // caminho → texto cifrado mais recente (lido ou gravado)
  const folderPw = new Map();   // pasta → senha (desbloqueia as outras notas da mesma pasta)
  let lastActivity = Date.now();

  const isLocked = (n) => !!n && V.isEncrypted(n.content) && !unlocked.has(n.path);
  const isProtected = (path) => unlocked.has(path) || V.isEncrypted(S.notes.get(path)?.content);

  // ---- gravação: cifra as notas desbloqueadas ----
  const origWrite = writeNote;
  writeNote = async function (path) {
    const pw = unlocked.get(path);
    if (!pw) return origWrite(path);
    clearTimeout(S.timers.get(path));
    if (!S.pending.has(path)) return;
    const note = S.notes.get(path);
    if (!note) { S.pending.delete(path); return; }
    const v = note.version;
    try {
      const c = await V.encrypt(note.content, pw);
      lastCipher.set(path, c);
      await lumen.fs.write(path, c);
      note.mtime = Date.now();
      if (note.version === v) S.pending.delete(path);
      if (!S.pending.size) setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      toast('Falha ao salvar: ' + err.message, 'error', 5000);
      if (S.notes.has(path)) S.timers.set(path, setTimeout(() => saveNote(path), 5000));
    }
    renderTabs();
  };

  // ---- índice: o disco devolve o texto cifrado; para notas abertas, mantém o texto da memória ----
  const origIndex = indexNote;
  indexNote = function (path, content, mtime, ctime) {
    if (V.isEncrypted(content)) {
      if (unlocked.has(path)) {
        const cur = S.notes.get(path);
        if (cur && lastCipher.get(path) === content) return origIndex(path, cur.content, mtime, ctime);
        unlocked.delete(path); // mudou fora do app (outro aparelho): pede a senha de novo
      }
      lastCipher.set(path, content);
    }
    return origIndex(path, content, mtime, ctime);
  };

  // ---- renomear/mover: a senha acompanha o novo caminho (senão a próxima gravação sairia sem cifra) ----
  const origRename = renamePath;
  renamePath = async function (from, to, isFolder = false) {
    const moved = [];
    for (const [p, pw] of [...unlocked]) {
      if (p === from || (isFolder && p.startsWith(from + '/'))) {
        const np = p === from ? to : to + p.slice(from.length);
        unlocked.set(np, pw); if (lastCipher.has(p)) lastCipher.set(np, lastCipher.get(p)); moved.push(p);
      }
    }
    try { return await origRename(from, to, isFolder); }
    finally { for (const p of moved) if (!S.notes.has(p)) { unlocked.delete(p); lastCipher.delete(p); } }
  };
  // duplicar uma nota protegida geraria uma cópia sem cifra
  const origDuplicate = duplicateNote;
  duplicateNote = async function (path) {
    if (isProtected(path)) return toast('Notas protegidas não podem ser duplicadas (a cópia ficaria sem senha)', 'error', 3500);
    return origDuplicate(path);
  };
  // a busca não procura dentro do texto cifrado
  const origRun = SmartSearch.run;
  SmartSearch.run = (notes, raw, opts) => origRun(notes.map((n) => (V.isEncrypted(n.content) ? { ...n, content: '' } : n)), raw, opts);

  // ---- tela de bloqueio ----
  const view = document.getElementById('note-view');
  const lock = document.createElement('div');
  lock.id = 'lock-view'; lock.hidden = true;
  lock.innerHTML = `<form class="lock-card" autocomplete="off">
      <div class="lock-icon">${icon('vault', 30)}</div>
      <h2>Nota protegida</h2>
      <p class="lock-sub">Digite a senha para abrir. Ela fica só na memória até você bloquear ou fechar o app.</p>
      <input type="password" id="lock-pw" placeholder="Senha" autocomplete="current-password" aria-label="Senha">
      <div class="lock-err" id="lock-err"></div>
      <div class="lock-actions"><button type="submit" class="btn primary" id="lock-ok">Desbloquear</button><button type="button" class="btn" id="lock-bio" hidden>Usar digital</button></div>
    </form>`;
  view.appendChild(lock);
  const pwInput = lock.querySelector('#lock-pw'), err = lock.querySelector('#lock-err');

  async function refreshLock() {
    const note = activeNote(), locked = isLocked(note);
    lock.hidden = !locked;
    view.classList.toggle('locked', locked);
    document.getElementById('editor').readOnly = locked;
    if (!locked) return;
    err.textContent = ''; pwInput.value = '';
    // senha da mesma pasta já desbloqueada: tenta sozinha
    const fp = folderPw.get(note.folder);
    if (fp) { try { await unlockWith(note, fp, { silent: true }); return; } catch { /* outra senha */ } }
    const bio = await bioAvailable() && bioKeys().includes(bioKey(note));
    lock.querySelector('#lock-bio').hidden = !bio;
    setTimeout(() => pwInput.focus(), 30);
  }

  async function unlockWith(note, pw, { silent = false } = {}) {
    const plain = await V.decrypt(note.content, pw);
    unlocked.set(note.path, pw);
    lastCipher.set(note.path, note.content);
    folderPw.set(note.folder, pw);
    origIndex(note.path, plain, note.mtime, note.ctime);
    if (activeNote() === note) { const t = activeTab(); loadNoteIntoView(t); }
    lock.hidden = true; view.classList.remove('locked'); document.getElementById('editor').readOnly = false;
    renderTabs(); renderRight();
    if (!silent) offerBio(note, pw);
    return plain;
  }

  lock.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = activeNote(); if (!note) return;
    const btn = lock.querySelector('#lock-ok'); btn.disabled = true; err.textContent = 'Abrindo…';
    try { await unlockWith(note, pwInput.value); err.textContent = ''; }
    catch (x) { err.textContent = x.message; pwInput.select(); }
    finally { btn.disabled = false; }
  });
  lock.querySelector('#lock-bio').addEventListener('click', async () => {
    const note = activeNote(); if (!note) return;
    try { const pw = await lumen.bio.load(bioKey(note)); await unlockWith(note, pw, { silent: true }); }
    catch (x) {
      const msg = x.message || 'Não foi possível usar a digital';
      // a senha guardada sumiu (app reinstalado, digitais trocadas) ou não abre mais a nota: desliga a digital
      if (/Nenhuma digital|digitais do aparelho mudaram|Senha incorreta/i.test(msg)) {
        setBioKeys(bioKeys().filter((k) => k !== bioKey(note)));
        lock.querySelector('#lock-bio').hidden = true;
        err.textContent = 'A digital precisa ser ativada de novo: digite a senha.';
      } else err.textContent = msg;
    }
  });
  document.getElementById('editor').addEventListener('lumen-load', () => refreshLock());

  // ---- ações ----
  async function askNewPassword(title) {
    const a = await dialog({ title, msg: 'Escolha uma senha. Sem ela não há como recuperar o texto — guarde bem.', input: '', ok: 'Continuar', password: true });
    if (!a) return null;
    if (a.length < 4) { toast('Use pelo menos 4 caracteres', 'error'); return null; }
    const b = await dialog({ title: 'Confirme a senha', msg: 'Digite a mesma senha de novo.', input: '', ok: 'Proteger', password: true });
    if (b == null) return null;
    if (a !== b) { toast('As senhas não são iguais', 'error'); return null; }
    return a;
  }
  async function encryptNote(path, pw) {
    const note = S.notes.get(path); if (!note || V.isEncrypted(note.content)) return false;
    await flushSave(path);
    unlocked.set(path, pw);
    note.version++; S.pending.add(path);
    await saveNote(path);
    return true;
  }
  async function protectNote(path = activeNote()?.path) {
    const note = S.notes.get(path); if (!note) return toast('Abra uma nota primeiro');
    if (isProtected(path)) return toast('Esta nota já é protegida');
    const pw = await askNewPassword('Proteger nota com senha'); if (!pw) return;
    await encryptNote(path, pw);
    folderPw.set(note.folder, pw);
    toast('Nota protegida. O arquivo agora está cifrado no disco.', 'success', 3000);
    renderTabs();
  }
  async function protectFolder(folder) {
    const notes = [...S.notes.values()].filter((n) => n.path.startsWith(folder + '/') && !V.isEncrypted(n.content));
    if (!notes.length) return toast('Nenhuma nota sem proteção nesta pasta');
    const pw = await askNewPassword(`Proteger a pasta “${baseName(folder)}”`); if (!pw) return;
    let n = 0; for (const note of notes) if (await encryptNote(note.path, pw)) n++;
    for (const note of notes) folderPw.set(note.folder, pw);
    toast(`${n} nota(s) protegida(s) com senha`, 'success', 3000);
  }
  async function removeProtection(path = activeNote()?.path) {
    const note = S.notes.get(path); if (!note) return;
    if (!unlocked.has(path)) return toast(isLocked(note) ? 'Desbloqueie a nota primeiro' : 'Esta nota não é protegida');
    if (!(await dialog({ title: 'Remover senha?', msg: `“${note.name}” voltará a ser um arquivo de texto comum, legível por qualquer programa.`, ok: 'Remover senha', danger: true }))) return;
    unlocked.delete(path); lastCipher.delete(path);
    note.version++; S.pending.add(path); await saveNote(path);
    bioForget(note);
    toast('Senha removida', 'success');
    renderTabs();
  }
  async function lockAll() {
    if (!unlocked.size) return 0;
    await flushAll();
    const paths = [...unlocked.keys()];
    unlocked.clear(); folderPw.clear();
    for (const p of paths) { const c = lastCipher.get(p); if (c) origIndex(p, c); }
    const a = activeTab(); if (a?.kind === 'note' && paths.includes(a.path)) loadNoteIntoView(a);
    renderTabs(); renderRight();
    return paths.length;
  }

  // bloqueio automático depois de um tempo sem uso
  ['keydown', 'pointerdown'].forEach((ev) => document.addEventListener(ev, () => { lastActivity = Date.now(); }, true));
  setInterval(async () => {
    const min = Number(S.settings?.lockMinutes ?? 10);
    if (!min || !unlocked.size) return;
    if (Date.now() - lastActivity > min * 60000) { const n = await lockAll(); if (n) toast('Notas protegidas bloqueadas por falta de uso'); }
  }, 30000);

  // ---- digital (Android) ----
  const bioKey = (note) => 'note:' + note.path;
  const bioKeys = () => { try { return JSON.parse(localStorage.getItem('mn-bio-keys') || '[]'); } catch { return []; } };
  const setBioKeys = (k) => { try { localStorage.setItem('mn-bio-keys', JSON.stringify(k)); } catch { /* ok */ } };
  async function bioAvailable() { try { return !!(window.lumen?.bio && (await lumen.bio.status()).available); } catch { return false; } }
  async function offerBio(note, pw) {
    if (!(await bioAvailable()) || bioKeys().includes(bioKey(note))) return;
    const ok = await dialog({ title: 'Usar a digital?', msg: 'Da próxima vez, abrir esta nota com a digital em vez da senha. A senha fica guardada no cofre de chaves do aparelho.', ok: 'Usar digital', cancel: 'Agora não' });
    if (!ok) return;
    try { await lumen.bio.save(bioKey(note), pw); setBioKeys([...bioKeys(), bioKey(note)]); toast('Digital ativada para esta nota', 'success'); }
    catch (x) { toast(x.message || 'Não foi possível ativar a digital', 'error'); }
  }
  function bioForget(note) {
    const k = bioKey(note); if (!bioKeys().includes(k)) return;
    setBioKeys(bioKeys().filter((x) => x !== k)); lumen.bio?.clear?.(k).catch(() => {});
  }

  return { isLocked, isProtected, protectNote, protectFolder, removeProtection, lockAll, unlockWith, refreshLock, get unlockedCount() { return unlocked.size; } };
})();
