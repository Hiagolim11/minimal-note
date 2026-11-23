// Janela de captura rápida (Ctrl+Alt+N): anota e salva sem abrir o app
(function () {
  const t = document.getElementById('t'), mode = document.getElementById('mode'), msg = document.getElementById('msg');
  try { mode.value = localStorage.getItem('mn-capture-mode') || 'inbox'; } catch { /* sem armazenamento */ }
  mode.addEventListener('change', () => { try { localStorage.setItem('mn-capture-mode', mode.value); } catch { /* ok */ } });
  async function save() {
    if (!t.value.trim()) { msg.textContent = 'Escreva algo primeiro'; t.focus(); return; }
    try { await window.capture.save(t.value, mode.value); t.value = ''; window.capture.close(); }
    catch (e) { msg.textContent = e.message || 'Não foi possível salvar'; }
  }
  document.getElementById('save').addEventListener('click', save);
  document.getElementById('cancel').addEventListener('click', () => window.capture.close());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); window.capture.close(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  });
  t.addEventListener('input', () => { msg.textContent = ''; });
  window.addEventListener('focus', () => t.focus());
  t.focus();
})();
