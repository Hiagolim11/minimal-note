// ---------- Atualizações ----------
// Uma vez por dia (opção em Configurações › Sobre) consulta a última versão publicada no GitHub e,
// se houver uma mais nova, mostra um aviso com o link da página de download. Nada é baixado sozinho.
/* global S, lumen, saveSettings, toast, esc, icon */
const Updates = (() => {
  const DAY = 86400000;
  const RELEASES = 'https://github.com/Hiagolim11/minimal-note/releases/latest';

  // "1.10.0" é mais nova que "1.9.3" (compara número a número, não como texto)
  function newer(a, b) {
    const p = (v) => String(v).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    const A = p(a), B = p(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0);
    return false;
  }

  let card = null;
  function show(cur, r) {
    card?.remove();
    card = document.createElement('div');
    card.className = 'update-card';
    card.setAttribute('role', 'status');
    card.innerHTML = `<div class="uc-icon">${icon('download', 20)}</div>
      <div class="uc-text"><b>Versão ${esc(r.latest)} disponível</b><small>Você está na ${esc(cur)}.</small></div>
      <button class="btn primary" data-a="get">Baixar</button><button class="btn" data-a="later">Depois</button>`;
    card.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      // só abre página do próprio repositório (o endereço vem da resposta da internet)
      if (a === 'get') lumen.shell.external(/^https:\/\/github\.com\/Hiagolim11\/minimal-note\//.test(r.url) ? r.url : RELEASES);
      else { S.settings.updateDismissed = r.latest; saveSettings(); } // não insiste nesta versão
      card.remove(); card = null;
    });
    document.body.appendChild(card);
  }

  async function check({ manual = false } = {}) {
    if (!window.lumen?.update || !lumen.app) return null;
    let cur, r;
    try { [cur, r] = await Promise.all([lumen.app.version(), lumen.update.check()]); }
    catch (e) { if (manual) toast('Não foi possível procurar atualizações: ' + e.message, 'error', 4500); return null; }
    S.settings.updateCheckedAt = Date.now(); saveSettings();
    const has = !!r.latest && newer(r.latest, cur);
    if (has && (manual || S.settings.updateDismissed !== r.latest)) show(cur, r);
    else if (manual && !has) toast(`Você já está na versão mais recente (${cur})`, 'success');
    return { cur, ...r, has };
  }

  function auto() {
    if (!S.settings || S.settings.checkUpdates === false) return;
    if (Date.now() - (S.settings.updateCheckedAt || 0) < DAY) return;
    check();
  }
  setTimeout(auto, 8000); // depois da abertura, para não atrasar o início

  return { check, newer };
})();
