// Cérebro: linha do tempo, modo foco e lobos por tag.
const NL = '\\n';
const visible = `S.graph.nodes.filter((n) => S.graph.visible(n)).length`;
module.exports = [
  { wait: 400, js: `(async () => {
      const tags = ['trabalho', 'estudo', 'casa', 'saude'];
      for (let i = 0; i < 40; i++) await lumen.fs.write((i % 2 ? 'A/' : 'B/') + 'N' + i + '.md', '# N' + i + '${NL}[[N' + ((i + 1) % 40) + ']] #' + tags[i % 4]);
      await refreshVault();
      // datas de criação espalhadas por 40 dias (o arquivo de teste foi criado agora)
      const now = Date.now(); for (const n of S.notes.values()) { const i = Number((/N(\\d+)/.exec(n.name) || [0, 0])[1]); n.ctime = now - (40 - i) * 86400000; }
      await openNote('A/N1.md'); addTab({ kind: 'graph' });
      return 'notas: ' + S.notes.size; })()`, size: [1280, 800] },
  { wait: 1200, js: `JSON.stringify({ visiveis: ${visible}, total: S.graph.nodes.length, ferramentas: getComputedStyle(document.querySelector('.graph-brain-tools')).display })` },
  // linha do tempo: arrastar para o meio esconde as notas mais novas
  { js: `(() => { const r = document.getElementById('g-time'); r.value = 500; r.dispatchEvent(new Event('input')); return 'meio: ' + ${visible} + ' visíveis · ' + document.getElementById('g-time-label').textContent; })()`, wait: 300, shot: 'brain-tempo-meio' },
  { js: `(() => { const r = document.getElementById('g-time'); r.value = 1000; r.dispatchEvent(new Event('input')); return 'fim: ' + ${visible} + ' · ' + document.getElementById('g-time-label').textContent; })()` },
  { click: '#g-play', wait: 2500 },
  { js: `'tocando: ' + S.graph.playing + ' · ' + ${visible} + ' visíveis · botão ' + document.getElementById('g-play').textContent`, wait: 7000 },
  { js: `'terminou: ' + ${visible} + ' visíveis' ` },
  // foco: só a nota aberta e vizinhas até 2 passos
  { click: '#g-focus', wait: 500, js: `'foco: ' + ${visible} + ' visíveis · salvo ' + S.settings.graph.focus` },
  { shot: 'brain-foco' },
  { click: '#g-focus', wait: 300, js: `'sem foco: ' + ${visible}` },
  // lobos por tag
  { js: `(() => { const s = document.getElementById('g-lobes'); s.value = 'tag'; s.dispatchEvent(new Event('change')); return 'lobos: ' + JSON.stringify(S.graph.groups.map((g) => g.map((x) => x.name))); })()`, wait: 600, shot: 'brain-lobos-tags' },
  { js: `(() => { let fora = 0; for (const n of S.graph.nodes) if (BrainGeo.deepLobe(n.p[0], n.p[1]) !== n.lobe) fora++; return 'fora do lobo: ' + fora; })()` },
  { click: '#g-style [data-style="brain3d"]', wait: 900, js: `'3D com tags: ' + S.graph.mode + ' · ' + S.graph.groups.flat().map((x) => x.name).sort().join(',')` },
  { click: '#g-style [data-style="net"]', wait: 500, js: `'rede esconde: ' + getComputedStyle(document.querySelector('.graph-brain-tools')).display` },
];
