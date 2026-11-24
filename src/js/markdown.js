// Renderização de Markdown: wikilinks, tags, destaques, callouts, frontmatter
const MD = (() => {
  const IMG_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, '').trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

  // ganchos preenchidos pelo app
  const hooks = {
    resolve: () => null,   // (target) => caminho ou null
    imageSrc: (p) => p,    // (caminho relativo) => URL
    remoteImages: () => true, // false = nada da internet é carregado (imagens, vídeos, url() em estilos)
  };

  // bloqueio de conteúdo remoto: roda no documento inerte do DOMPurify, antes de qualquer download
  // (no desktop o processo principal também bloqueia; no Android esta é a única barreira)
  const REMOTE = /^\s*(?:https?:)?\/\//i;
  let blockRemote = false;
  if (typeof DOMPurify !== 'undefined' && DOMPurify.addHook) DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!blockRemote || !node.getAttribute) return;
    const src = node.getAttribute('src');
    if (src && REMOTE.test(src)) {
      if (node.tagName === 'IMG') node.setAttribute('data-remote-src', src);
      node.removeAttribute('src');
    }
    for (const a of ['srcset', 'poster']) if (node.hasAttribute(a) && /(?:https?:)?\/\//i.test(node.getAttribute(a))) node.removeAttribute(a);
    if (/url\(\s*['"]?\s*(?:https?:)?\/\//i.test(node.getAttribute('style') || '')) node.removeAttribute('style');
  });

  const wikilink = {
    name: 'wikilink',
    level: 'inline',
    start(src) { const i = src.search(/!?\[\[/); return i < 0 ? undefined : i; },
    tokenizer(src) {
      const m = /^(!?)\[\[([^\]\n|]+?)(?:\|([^\]\n]+))?\]\]/.exec(src);
      if (m) return { type: 'wikilink', raw: m[0], embed: !!m[1], target: m[2].trim(), alias: m[3]?.trim() };
    },
    renderer(t) {
      const [file, heading] = t.target.split('#');
      if (t.embed && IMG_RE.test(file)) {
        const w = /^\d+$/.test(t.alias || '') ? ` width="${t.alias}"` : '';
        return `<img src="${esc(hooks.imageSrc(file.trim(), true))}" alt="${esc(file)}"${w}>`;
      }
      const resolved = hooks.resolve(file.trim());
      const label = t.alias && !t.embed ? t.alias : (heading ? `${file} › ${heading}` : file);
      return `<a href="#" class="wikilink${resolved ? '' : ' unresolved'}${t.embed ? ' embed' : ''}" data-target="${esc(file.trim())}" data-heading="${esc(heading ? slug(heading) : '')}">${esc(label)}</a>`;
    },
  };

  const tag = {
    name: 'tag',
    level: 'inline',
    start(src) { const m = src.match(/(^|\s)#[\p{L}\p{N}_\-/]/u); return m ? m.index + m[1].length : undefined; },
    tokenizer(src) {
      const m = /^#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/u.exec(src);
      if (m) return { type: 'tag', raw: m[0], tag: m[1] };
    },
    renderer(t) { return `<a href="#" class="tag" data-tag="${esc(t.tag)}">#${esc(t.tag)}</a>`; },
  };

  const highlight = {
    name: 'highlight',
    level: 'inline',
    start(src) { const i = src.indexOf('=='); return i < 0 ? undefined : i; },
    tokenizer(src) {
      const m = /^==(?=\S)([^\n]*?\S)==/.exec(src);
      if (m) return { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
    },
    renderer(t) { return `<mark>${this.parser.parseInline(t.tokens)}</mark>`; },
  };

  // fórmulas: $$ ... $$ (bloco) e $...$ (na linha) — o KaTeX desenha depois da limpeza do HTML
  const mathBlock = {
    name: 'mathBlock',
    level: 'block',
    start(src) { const i = src.indexOf('$$'); return i < 0 ? undefined : i; },
    tokenizer(src) {
      const m = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src);
      if (m) return { type: 'mathBlock', raw: m[0], tex: m[1].trim() };
    },
    renderer(t) { return `<div class="math math-block" data-tex="${esc(t.tex)}">${esc(t.tex)}</div>\n`; },
  };
  const mathInline = {
    name: 'mathInline',
    level: 'inline',
    start(src) { const i = src.indexOf('$'); return i < 0 ? undefined : i; },
    tokenizer(src) {
      // $x$ precisa de texto colado nos dois cifrões e não pode ser valor em dinheiro ($5)
      const m = /^\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
      if (m && !/^\d+([.,]\d+)?$/.test(m[1])) return { type: 'mathInline', raw: m[0], tex: m[1] };
    },
    renderer(t) { return `<span class="math" data-tex="${esc(t.tex)}">${esc(t.tex)}</span>`; },
  };

  marked.use({
    gfm: true,
    breaks: true,
    extensions: [mathBlock, mathInline, wikilink, tag, highlight],
    renderer: {
      heading(text, level, raw) { return `<h${level} id="h-${slug(raw)}">${text}</h${level}>\n`; },
      image(href, title, text) {
        let src = href || '';
        if (!/^(https?:|data:|file:)/i.test(src)) src = hooks.imageSrc(decodeURI(src), false);
        return `<img src="${esc(src)}" alt="${esc(text || '')}"${title ? ` title="${esc(title)}"` : ''}>`;
      },
      link(href, title, text) {
        const ext = /^https?:/i.test(href || '');
        return `<a href="${esc(href || '#')}"${ext ? ' class="external" data-external="1"' : ''}${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
      },
      code(code, lang) {
        const l = (lang || '').split(/\s/)[0];
        if (l === 'mermaid') return `<div class="mermaid-block" data-src="${esc(code)}"><pre class="mermaid-src">${esc(code)}</pre></div>`;
        return `<div class="code-block"><div class="code-head"><span>${esc(l || 'texto')}</span><button class="copy-code" type="button">Copiar</button></div><pre><code class="lang-${esc(l)}">${esc(code)}</code></pre></div>`;
      },
    },
  });

  function splitFrontmatter(src) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
    if (!m) return { meta: null, body: src };
    const meta = {};
    let lastKey = null;
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([\w\-À-ÿ]+):\s*(.*)$/.exec(line);
      if (kv) {
        lastKey = kv[1];
        let v = kv[2].trim();
        if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        else v = v.replace(/^["']|["']$/g, '');
        meta[lastKey] = v === '' ? [] : v;
      } else {
        const item = /^\s*-\s+(.*)$/.exec(line);
        if (item && lastKey) {
          if (!Array.isArray(meta[lastKey])) meta[lastKey] = meta[lastKey] ? [meta[lastKey]] : [];
          meta[lastKey].push(item[1].trim().replace(/^["']|["']$/g, ''));
        }
      }
    }
    return { meta, body: src.slice(m[0].length) };
  }

  const CALLOUT_ICONS = { note: 'info', info: 'info', tip: 'sparkles', success: 'check', warning: 'info', danger: 'x', quote: 'list', todo: 'check', example: 'list', question: 'info', bug: 'x' };

  function render(src) {
    const { meta, body } = splitFrontmatter(src);
    let html = marked.parse(body);
    blockRemote = !hooks.remoteImages();
    try {
      html = DOMPurify.sanitize(html, {
        ADD_ATTR: ['data-target', 'data-heading', 'data-tag', 'data-external', 'data-tex', 'data-src'], ADD_TAGS: ['mark'],
        // igual ao padrão do DOMPurify + file: (imagens do cofre são carregadas do disco)
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
    } finally { blockRemote = false; }
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    // imagem bloqueada vira um link (abre no navegador) no lugar do ícone de imagem quebrada
    wrap.querySelectorAll('img[data-remote-src]').forEach((img) => {
      const a = document.createElement('a');
      a.className = 'external remote-img'; a.dataset.external = '1';
      a.href = img.dataset.remoteSrc; a.title = img.dataset.remoteSrc;
      a.textContent = '🖼 ' + (img.getAttribute('alt') || 'imagem da internet');
      img.replaceWith(a);
    });

    // callouts: > [!tipo] Título
    wrap.querySelectorAll('blockquote').forEach((bq) => {
      const p = bq.firstElementChild;
      if (!p || p.tagName !== 'P') return;
      const m = /^\[!(\w+)\]([+-]?)\s*([^\n<]*)/.exec(p.innerHTML);
      if (!m) return;
      const type = m[1].toLowerCase();
      const title = m[3].trim() || type.charAt(0).toUpperCase() + type.slice(1);
      p.innerHTML = p.innerHTML.slice(m[0].length).replace(/^\s*<br>\s*/, '');
      if (!p.innerHTML.trim()) p.remove();
      const div = document.createElement('div');
      div.className = `callout callout-${type}${m[2] === '-' ? ' collapsed' : ''}`;
      div.innerHTML = `<div class="callout-title">${icon(CALLOUT_ICONS[type] || 'info', 16)}<span>${esc(title)}</span></div><div class="callout-body"></div>`;
      const bodyEl = div.querySelector('.callout-body');
      while (bq.firstChild) bodyEl.appendChild(bq.firstChild);
      bq.replaceWith(div);
    });

    // checkboxes clicáveis
    wrap.querySelectorAll('input[type="checkbox"]').forEach((cb, i) => {
      cb.removeAttribute('disabled');
      cb.dataset.task = i;
      cb.closest('li')?.classList.add('task');
      if (cb.checked) cb.closest('li')?.classList.add('done');
      // envolve só o texto da própria tarefa (sem as sublistas), para o riscado não vazar para subtarefas
      const span = document.createElement('span'); span.className = 'task-text';
      let n = cb.nextSibling;
      while (n && !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))) { const next = n.nextSibling; span.appendChild(n); n = next; }
      cb.after(span);
    });

    // fórmulas (KaTeX escapa o texto da fórmula; erros aparecem em vermelho no lugar)
    if (typeof katex !== 'undefined') wrap.querySelectorAll('.math[data-tex]').forEach((el) => {
      try { katex.render(el.dataset.tex, el, { displayMode: el.classList.contains('math-block'), throwOnError: false, output: 'html' }); }
      catch { el.classList.add('math-error'); }
    });

    // tabelas roláveis
    wrap.querySelectorAll('table').forEach((t) => {
      const d = document.createElement('div'); d.className = 'table-wrap';
      t.replaceWith(d); d.appendChild(t);
    });

    if (meta && Object.keys(meta).length) {
      const props = document.createElement('div');
      props.className = 'properties';
      props.innerHTML = Object.entries(meta).map(([k, v]) => {
        const val = Array.isArray(v) ? v.map((x) => `<span class="pill">${esc(x)}</span>`).join('') : esc(v);
        return `<div class="prop"><span class="prop-key">${esc(k)}</span><span class="prop-val">${val}</span></div>`;
      }).join('');
      wrap.prepend(props);
    }
    return wrap;
  }

  // ---- análise para o índice ----
  const stripCode = (s) => s.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '');

  function analyze(src) {
    const { meta, body } = splitFrontmatter(src);
    const clean = stripCode(body);
    const links = [];
    for (const m of clean.matchAll(/(!?)\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g)) {
      if (m[1] && IMG_RE.test(m[2])) continue;
      links.push(m[2].trim());
    }
    const tags = new Set();
    for (const m of clean.matchAll(/(^|\s)#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu)) tags.add(m[2]);
    const mt = meta?.tags || meta?.tag;
    if (mt) (Array.isArray(mt) ? mt : String(mt).split(/[,\s]+/)).forEach((t) => t && tags.add(t.replace(/^#/, '')));
    const headings = [];
    let inFence = false;
    body.split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return;
      const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
      if (h) headings.push({ level: h[1].length, text: h[2].replace(/[*_`=]/g, ''), id: 'h-' + slug(h[2]), line: i });
    });
    const offset = src.length - body.length;
    const fmLines = offset ? src.slice(0, offset).split(/\r?\n/).length - 1 : 0;
    headings.forEach((h) => { h.line += fmLines; });
    const words = (clean.replace(/[#>*_\-\[\]()`|=]/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
    return { links, tags: [...tags], headings, words, meta };
  }

  // diagramas: carrega o Mermaid só quando a nota tem um (é grande) e desenha em SVG
  let mermaidP = null, seq = 0;
  function loadMermaid() {
    if (typeof mermaid !== 'undefined') return Promise.resolve(window.mermaid);
    return mermaidP || (mermaidP = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = 'vendor/mermaid/mermaid.min.js';
      s.onload = () => resolve(window.mermaid); s.onerror = () => { mermaidP = null; reject(new Error('Mermaid indisponível')); };
      document.head.appendChild(s);
    }));
  }
  async function renderDiagrams(root) {
    const blocks = [...root.querySelectorAll('.mermaid-block:not(.done)')];
    if (!blocks.length) return 0;
    let m;
    try { m = await loadMermaid(); } catch { return 0; }
    const dark = getComputedStyle(document.documentElement).colorScheme?.includes('dark') || document.documentElement.classList.contains('dark') || matchMedia('(prefers-color-scheme: dark)').matches;
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'inherit' });
    let ok = 0;
    for (const el of blocks) {
      try {
        const src = el.querySelector('.mermaid-src')?.textContent || '';
        const { svg } = await m.render('mn-diagram-' + (++seq), src);
        el.insertAdjacentHTML('afterbegin', svg); el.classList.add('done'); ok++;
      } catch (e) {
        el.classList.add('done', 'error');
        el.insertAdjacentHTML('beforeend', `<div class="mermaid-error">Diagrama com erro: ${esc(String(e?.message || e).split('\n')[0])}</div>`);
      }
    }
    return ok;
  }

  return { render, analyze, hooks, slug, esc, IMG_RE, renderDiagrams };
})();
