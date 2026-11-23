// Regras de texto do corretor (sem DOM): o que ignorar no Markdown, quais palavras conferir,
// quando corrigir sozinho e os ajustes de digitação. Usado pela página, pelo worker e pelos testes.
(function (root) {
  const WORD = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
  const LETTER = /[\p{L}\p{M}]/u;

  // trechos que não são texto corrido: código, links, endereços, tags, HTML…
  const SPAN_RULES = [
    /`+[^`\n]*?`+/g,                            // código em linha
    /!?\[\[[^\]\n]*\]\]/g,                      // [[links]]
    /\]\([^)\n]*\)/g,                           // destino de [texto](url)
    /<[a-zA-Z/!][^>\n]*>/g,                     // tags HTML
    /\b(?:https?:\/\/|www\.)[^\s<>()\]]+/g,     // endereços
    /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,            // e-mails
    /(?<=^|\s)#[\p{L}\p{N}_\-/]+/gu,            // #tags
    /\[![\w-]+\]/g,                              // callouts [!note]
    /\[\^[^\]\n]*\]/g,                           // notas de rodapé [^1]
    /&[#\w]+;/g,                                 // entidades HTML
    /\$\$[\s\S]*?\$\$/g,                         // fórmulas em bloco
    /\$(?!\s)[^$\n]+?(?<!\s)\$(?!\d)/g,          // fórmulas na linha ($x^2$)
  ];

  function skipRanges(text) {
    const out = [];
    // front matter
    const fm = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
    if (fm) out.push([0, fm[0].length]);
    // blocos de código cercados (``` ou ~~~); um bloco sem fechamento vai até o fim
    const fence = /^[ \t]*(```|~~~)[^\n]*$/gm;
    let m, open = null;
    while ((m = fence.exec(text))) {
      if (open === null) open = { at: m.index, mark: m[1] };
      else if (m[1] === open.mark) { out.push([open.at, m.index + m[0].length]); open = null; }
    }
    if (open) out.push([open.at, text.length]);
    for (const re of SPAN_RULES) { re.lastIndex = 0; while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]); }
    return merge(out);
  }

  function merge(ranges) {
    ranges.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const r of ranges) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else out.push([r[0], r[1]]);
    }
    return out;
  }

  // posição dentro de algum intervalo (busca binária)
  function inRanges(ranges, pos) {
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, r = ranges[mid];
      if (pos < r[0]) hi = mid - 1; else if (pos >= r[1]) lo = mid + 1; else return true;
    }
    return false;
  }

  // palavras a conferir: [{w, s, e}]
  function words(text, skip = skipRanges(text)) {
    const out = [];
    WORD.lastIndex = 0;
    let m;
    while ((m = WORD.exec(text))) {
      const w = m[0], s = m.index, e = s + w.length;
      if (w.length < 2 || inRanges(skip, s)) continue;
      const before = text[s - 1] || '', after = text[e] || '';
      if (/[\d_@\\/]/.test(before) || /[\d_@\\/]/.test(after)) continue;         // abc123, caminhos
      if (before === '.' && LETTER.test(text[s - 2] || '')) continue;             // nota.md, site.com
      if (after === '.' && LETTER.test(text[e + 1] || '')) continue;
      if (w === w.toUpperCase() && w.length <= 6) continue;                       // siglas (ONU, HTML)
      if (/^.[\p{L}\p{M}]*\p{Lu}/u.test(w.replace(/['’-].*$/, ''))) continue;      // iPhone, camelCase
      out.push({ w, s, e });
    }
    return out;
  }

  const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

  function applyCase(orig, sug) {
    if (orig.length > 1 && orig === orig.toUpperCase()) return sug.toUpperCase();
    if (orig[0] !== orig[0].toLowerCase()) return sug[0].toUpperCase() + sug.slice(1);
    return sug;
  }

  // palavras frequentes que desempatam quando há mais de uma forma acentuada (ja → já, não jã)
  const COMMON = new Set(('já só mês três até após você vocês não então também porém além alguém ninguém está estão '
    + 'é há lá cá aí pé fé nó dó pó só sé vê lê crê dê têm vêm pôr ônibus água fácil difícil útil possível impossível '
    + 'número página código mãe pão irmão irmã avó avô café país países saúde baú ruído conteúdo análise '
    + 'informação ação função opção situação atenção solução coração razão questão relação mês português inglês '
    + 'lâmpada médico música público último único próximo rápido óculos ótimo péssimo céu réu chapéu herói '
    + 'automóvel nível móvel imóvel amável incrível horrível terrível sensível agradável responsável').split(/\s+/));

  // correção automática: só troca quando a palavra não existe e a única forma parecida difere
  // apenas em acentos/cedilha (nao → não, informacao → informação). Ambíguas nunca mudam sozinhas.
  function pickAuto(word, suggestions) {
    if (!word || word.length < 2) return null;
    const lower = word.toLowerCase(), key = fold(word);
    const seen = new Set(), cands = [];
    for (const s of suggestions || []) {
      if (/[\s-]/.test(s) || fold(s) !== key) continue;
      const l = s.toLowerCase();
      if (l === lower || seen.has(l)) continue;
      seen.add(l); cands.push(s);
    }
    let pick = null;
    if (cands.length === 1) pick = cands[0];
    else if (cands.length > 1) {
      const common = cands.filter((c) => COMMON.has(c.toLowerCase()));
      if (common.length === 1) pick = common[0];
    }
    if (!pick) return null;
    // nomes próprios vêm com maiúscula do dicionário (jose → José); o resto segue o que foi digitado
    return pick[0] !== pick[0].toLowerCase() && word === lower ? pick : applyCase(word, pick);
  }

  // formas da palavra com até `max` letras trocadas por outra acentuação (nao → não, idéia → ideia).
  // Conferir cada uma no dicionário é muito mais rápido que pedir sugestões ao Hunspell.
  const ACCENT_GROUPS = ['aáàâã', 'eéê', 'ií', 'oóôõ', 'uúü', 'cç', 'AÁÀÂÃ', 'EÉÊ', 'IÍ', 'OÓÔÕ', 'UÚÜ', 'CÇ'];
  const ACCENT_OF = {};
  for (const g of ACCENT_GROUPS) for (const ch of g) ACCENT_OF[ch] = [...g].filter((x) => x !== ch);
  function accentVariants(word, max = 2) {
    const chars = [...word.normalize('NFC')];
    if (chars.length > 24) return [];
    const spots = chars.map((c, i) => (ACCENT_OF[c] ? i : -1)).filter((i) => i >= 0);
    const out = new Set();
    const rec = (from, left, arr) => {
      for (let k = from; k < spots.length; k++) {
        const i = spots[k], orig = arr[i];
        for (const v of ACCENT_OF[orig]) {
          arr[i] = v; out.add(arr.join(''));
          if (left > 1) rec(k + 1, left - 1, arr);
        }
        arr[i] = orig;
      }
    };
    rec(0, max, chars.slice());
    out.delete(word);
    return [...out];
  }

  // ---------- ajustes de digitação ----------
  const ABBR = new Set(['sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'profa', 'ex', 'p', 'pág', 'pag', 'vs', 'obs', 'nº', 'n', 'av', 'tel', 'cel', 'aprox', 'etc', 'q', 'pq', 'vc']);
  // o início da linha é só marcação Markdown (título, citação, lista, tarefa)?
  const LINE_PREFIX = /^[ \t]*(?:#{1,6}[ \t]+|(?:>[ \t]?)+|(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)*$/;

  function sentenceStart(text, s) {
    const ls = text.lastIndexOf('\n', s - 1) + 1;
    const before = text.slice(ls, s);
    if (LINE_PREFIX.test(before)) return !/^[ \t]*\|/.test(before);
    const m = /([\p{L}\p{N}]*)([.!?]+)["'”’)\]]*[ \t]+$/u.exec(before); // "…" não encerra a frase
    if (!m) return false;
    if (m[2] === '.' && ABBR.has(m[1].toLowerCase())) return false;
    if (m[2] === '.' && /^\p{L}$/u.test(m[1])) return false; // iniciais: "J. Silva"
    return true;
  }

  // a palavra que termina em `end` (exclusivo)
  function wordBefore(text, end) {
    let s = end;
    while (s > 0 && /[\p{L}\p{M}'’-]/u.test(text[s - 1])) s--;
    while (s < end && /['’-]/.test(text[s])) s++;
    return s < end ? { s, e: end, w: text.slice(s, end) } : null;
  }

  // maiúscula no início da frase: devolve a edição (mesmo tamanho) ou null
  function capitalize(text, end, skip) {
    const wb = wordBefore(text, end);
    if (!wb || !/^\p{Ll}/u.test(wb.w) || (skip && inRanges(skip, wb.s))) return null;
    if (/^(?:https?|www|ftp)$/i.test(wb.w)) return null;
    if (!sentenceStart(text, wb.s)) return null;
    return { start: wb.s, end: wb.s + 1, text: wb.w[0].toUpperCase() };
  }

  // depois de digitar o caractere text[caret-1]: ajustes de pontuação e espaços
  function typo(text, caret, opts = {}, skip) {
    const c = text[caret - 1];
    if (!c || (skip && inRanges(skip, caret - 1))) return null;
    const ls = text.lastIndexOf('\n', caret - 2) + 1;
    if (/^[ \t]*\|/.test(text.slice(ls, caret))) return null; // tabelas: espaços alinham colunas
    if (opts.ellipsis && c === '.' && text.slice(caret - 3, caret) === '...' && text[caret - 4] !== '.' && LETTER.test(text[caret - 4] || '')) {
      return { start: caret - 3, end: caret, text: '…', caret: caret - 2 };
    }
    if (opts.dash && c === ' ' && text.slice(caret - 4, caret) === ' -- ' && /\S/.test(text[caret - 5] || '') && caret - 4 > ls) {
      return { start: caret - 4, end: caret, text: ' — ', caret: caret - 1 };
    }
    if (opts.spaces) {
      // espaço antes de pontuação: "palavra ," → "palavra,"
      if (/[,.;:!?]/.test(c) && text[caret - 2] === ' ' && /[\p{L}\p{N}\p{M}]/u.test(text[caret - 3] || '')
        && !(c === '.' && text[caret] === '.')) {
        return { start: caret - 2, end: caret, text: c, caret: caret - 1 };
      }
      // espaço repetido no meio da linha (dois espaços no fim da linha continuam valendo como quebra)
      if (/[^\s]/.test(c) && text[caret - 2] === ' ' && text[caret - 3] === ' ') {
        let s = caret - 3;
        while (s > ls && text[s - 1] === ' ') s--;
        if (s > ls && /\S/.test(text[s - 1])) return { start: s, end: caret - 1, text: ' ', caret: s + 2 };
      }
    }
    return null;
  }

  // aspas tipográficas para o caractere " digitado na posição pos
  function smartQuote(text, pos, ch = '"') {
    const prev = text[pos - 1] || '';
    const opening = !prev || /[\s([{\-—–]/.test(prev);
    if (ch === "'") return opening ? '‘' : '’';
    return opening ? '“' : '”';
  }

  // ---------- revisão gramatical (LanguageTool) ----------
  // divide o texto em partes "text" e "markup" (o LanguageTool ignora a marcação e usa interpretAs)
  const MD_MARKUP = [
    [/^[ \t]*#{1,6}[ \t]+/gm, ''],
    [/^[ \t]*(?:>[ \t]?)+/gm, ''],
    [/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, ''],
    [/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '\n'],
    [/^[ \t]*\|.*$/gm, '\n'],
    [/(\*\*|__|~~|==)(?=\S)/g, ''],
    [/(?<=\S)(\*\*|__|~~|==)/g, ''],
    [/(?<![\w*])\*(?=[^\s*])/g, ''],
    [/(?<=[^\s*])\*(?![\w*])/g, ''],
    [/!?\[(?=[^\]\n]*\]\()/g, ''],
  ];
  function ltAnnotation(text) {
    const marks = [];
    for (const [s, e] of skipRanges(text)) {
      const t = text.slice(s, e);
      let as = 'X';
      if (/^(```|~~~|---|\$\$)/.test(t.trimStart()) || t.includes('\n')) as = '\n\n';
      else if (/^!?\[\[/.test(t)) as = (/\|([^\]]*)\]\]$/.exec(t)?.[1] || t.replace(/^!?\[\[|\]\]$/g, '').split('#')[0].split('/').pop() || 'X');
      else if (/^\]\(/.test(t)) as = '';
      else if (/^<|^\[!|^\[\^|^&/.test(t)) as = '';
      else if (/^#/.test(t)) as = '';
      marks.push([s, e, as]);
    }
    for (const [re, as] of MD_MARKUP) { re.lastIndex = 0; let m; while ((m = re.exec(text))) if (m[0].length) marks.push([m.index, m.index + m[0].length, as]); }
    marks.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const items = [];
    let pos = 0;
    for (const [s, e, as] of marks) {
      if (e <= pos) continue;
      const st = Math.max(s, pos);
      if (st > pos) items.push({ text: text.slice(pos, st) });
      items.push({ markup: text.slice(st, e), interpretAs: st === s ? as : '' });
      pos = e;
    }
    if (pos < text.length) items.push({ text: text.slice(pos) });
    return items;
  }

  // agrupa os itens em partes de até `max` caracteres, cortando em parágrafos
  function ltChunks(items, max = 15000) {
    // textos maiores que o limite viram pedaços (cortados em parágrafo, linha ou espaço)
    const pieces = [];
    for (const it of items) {
      if (it.text == null || it.text.length <= max) { pieces.push(it); continue; }
      let t = it.text;
      while (t.length > max) {
        let cut = t.lastIndexOf('\n\n', max);
        if (cut < max / 2) cut = t.lastIndexOf('\n', max);
        if (cut < max / 2) cut = t.lastIndexOf(' ', max);
        if (cut <= 0) cut = max;
        pieces.push({ text: t.slice(0, cut) }); t = t.slice(cut);
      }
      if (t) pieces.push({ text: t });
    }
    const chunks = [];
    let cur = [], size = 0, start = 0, pos = 0;
    const flush = () => { if (cur.length) chunks.push({ offset: start, annotation: cur }); cur = []; size = 0; start = pos; };
    for (const it of pieces) {
      const len = (it.text ?? it.markup).length;
      if (it.text != null && size > 0 && size + len > max) flush();
      cur.push(it); pos += len;
      if (it.text != null) size += len;
    }
    flush();
    return chunks;
  }

  // desloca intervalos [s, e] depois de uma edição; os que tocam no trecho alterado somem
  function shiftRanges(list, oldText, newText) {
    let a = 0;
    const max = Math.min(oldText.length, newText.length);
    while (a < max && oldText[a] === newText[a]) a++;
    let b = 0;
    while (b < max - a && oldText[oldText.length - 1 - b] === newText[newText.length - 1 - b]) b++;
    const oldEnd = oldText.length - b, delta = newText.length - oldText.length;
    return list.filter((r) => r.e <= a || r.s >= oldEnd).map((r) => (r.s >= oldEnd ? { ...r, s: r.s + delta, e: r.e + delta } : r));
  }

  const api = { accentVariants, skipRanges, inRanges, words, fold, applyCase, pickAuto, sentenceStart, wordBefore, capitalize, typo, smartQuote, ltAnnotation, ltChunks, shiftRanges, merge };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpellText = api;
})(typeof self !== 'undefined' ? self : this);
