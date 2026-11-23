// Criptografia das notas protegidas (WebCrypto): AES-256-GCM com chave derivada da senha (PBKDF2-SHA256).
// O arquivo continua sendo um .md de texto, mas com o conteúdo cifrado:
//   <!-- Nota protegida pelo Minimal Note: abra no app e digite a senha. -->
//   MNENC1:<base64 de {"v":1,"k":iterações,"s":sal,"i":iv,"c":cifra}>
const VaultCrypto = (() => {
  const C = globalThis.crypto;
  const HEADER = '<!-- Nota protegida pelo Minimal Note: abra no app e digite a senha. -->';
  const ITER = 250000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  const isEncrypted = (text) => /^\s*(?:<!--[^\n]*-->\s*)?MNENC1:[A-Za-z0-9+/=]+\s*$/.test(String(text || ''));

  async function key(password, salt, iter) {
    const base = await C.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return C.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encrypt(plain, password, { iterations = ITER } = {}) {
    if (!password) throw new Error('Senha vazia');
    const salt = C.getRandomValues(new Uint8Array(16)), iv = C.getRandomValues(new Uint8Array(12));
    const k = await key(password, salt, iterations);
    const c = await C.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(String(plain)));
    const payload = JSON.stringify({ v: 1, k: iterations, s: b64(salt), i: b64(iv), c: b64(c) });
    return `${HEADER}\nMNENC1:${btoa(payload)}\n`;
  }

  async function decrypt(text, password) {
    const m = /MNENC1:([A-Za-z0-9+/=]+)/.exec(String(text || ''));
    if (!m) throw new Error('Esta nota não está protegida');
    let p;
    try { p = JSON.parse(atob(m[1])); } catch { throw new Error('Arquivo protegido danificado'); }
    if (p.v !== 1) throw new Error('Versão de proteção desconhecida');
    try {
      const k = await key(password, unb64(p.s), p.k);
      const plain = await C.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.i) }, k, unb64(p.c));
      return dec.decode(plain);
    } catch { throw new Error('Senha incorreta'); }
  }

  const api = { isEncrypted, encrypt, decrypt, HEADER };
  if (typeof module === 'object' && module.exports) module.exports = api;
  return api;
})();
