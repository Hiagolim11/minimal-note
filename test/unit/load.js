// Carrega os scripts do navegador (sem módulos) num contexto vm e devolve os globais.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
module.exports = function load(files, globals = {}) {
  const ctx = vm.createContext({ console, ...globals });
  for (const f of files) {
    // `const`/`function` de nível superior ficam no escopo do script; o sufixo os copia para o contexto
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    const names = [...code.matchAll(/^(?:const|let|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    vm.runInContext(code + '\n' + names.map((n) => `globalThis.${n} = ${n};`).join('\n'), ctx, { filename: f });
  }
  return ctx;
};
