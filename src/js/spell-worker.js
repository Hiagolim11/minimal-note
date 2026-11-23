// Worker do corretor ortográfico: Hunspell (WebAssembly) com o dicionário pt-BR.
// Fica fora da thread da interface: carregar o dicionário leva ~0,5 s e as sugestões
// de palavras longas podem levar centenas de ms.
/* global Module, SPELL_DICT, SpellText */
let hs = null;
const ready = new Promise((resolve, reject) => {
  try {
    importScripts('../vendor/spell/hunspell.js', '../vendor/spell/pt-BR.js', 'spell-text.js');
  } catch (e) { reject(new Error('arquivos do corretor ausentes (rode build/make-spell.js)')); return; }
  const timer = setTimeout(() => reject(new Error('o Hunspell não iniciou')), 20000);
  Module({
    onRuntimeInitialized() {
      const M = this;
      try {
        const c = (n, r, a) => M.cwrap(n, r, a);
        const api = {
          create: c('Hunspell_create', 'number', ['number', 'number']),
          spell: c('Hunspell_spell', 'number', ['number', 'number']),
          suggest: c('Hunspell_suggest', 'number', ['number', 'number', 'number']),
          free: c('Hunspell_free_list', null, ['number', 'number', 'number']),
          add: c('Hunspell_add', 'number', ['number', 'number']),
          remove: c('Hunspell_remove', 'number', ['number', 'number']),
        };
        M.FS.mkdir('/d');
        M.FS.writeFile('/d/pt.aff', SPELL_DICT.aff);
        M.FS.writeFile('/d/pt.dic', SPELL_DICT.dic);
        self.SPELL_DICT = null; // libera ~5 MB de texto
        const h = api.create(M.allocateUTF8('/d/pt.aff'), M.allocateUTF8('/d/pt.dic'));
        const withStr = (s, fn) => { const p = M.allocateUTF8(s.normalize('NFC')); try { return fn(p); } finally { M._free(p); } };
        clearTimeout(timer);
        resolve({
          spell: (w) => !!withStr(w, (p) => api.spell(h, p)),
          suggest: (w) => withStr(w, (p) => {
            const lp = M._malloc(4);
            const n = api.suggest(h, lp, p), arr = M.getValue(lp, '*'), out = [];
            for (let i = 0; i < n; i++) out.push(M.UTF8ToString(M.getValue(arr + i * 4, '*')));
            api.free(h, lp, n); M._free(lp);
            return out;
          }),
          add: (w) => withStr(w, (p) => api.add(h, p)),
          remove: (w) => withStr(w, (p) => api.remove(h, p)),
        });
      } catch (e) { clearTimeout(timer); reject(e); }
    },
  });
});

// palavras que o usuário mandou ignorar ou adicionou (o Hunspell só aceita a forma exata)
const extra = new Set();
const known = (w) => extra.has(w) || extra.has(w.toLowerCase()) || hs.spell(w);

const handlers = {
  init: async ({ words }) => { (words || []).forEach((w) => { extra.add(w); hs.add(w); }); return true; },
  check: ({ words }) => words.filter((w) => !known(w)),
  suggest: ({ word }) => hs.suggest(word).slice(0, 8),
  // correção automática: só quando a troca é óbvia (ver SpellText.pickAuto)
  // formas que só mudam acentos e existem no dicionário (rápido: só confere, não pede sugestões)
  auto: ({ word }) => (known(word) ? null : SpellText.pickAuto(word, SpellText.accentVariants(word, 2).filter((v) => hs.spell(v)))),
  add: ({ word }) => { extra.add(word); hs.add(word); return true; },
  remove: ({ word }) => { extra.delete(word); hs.remove(word); return true; },
};

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (!hs) hs = await ready;
    const result = await handlers[type](data);
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
