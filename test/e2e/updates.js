// Atualizações: a consulta automática mostra o aviso; "Depois" não insiste na mesma versão;
// procurar à mão mostra de novo; a tela Sobre mostra a versão real.
// Rodar com: LUMEN_UPDATE_URL=http://127.0.0.1:47125/latest bash test/e2e/run.sh test/e2e/updates.js 'node test/e2e/update-server.js'
module.exports = [
  { wait: 9500 }, // a consulta automática roda 8 s depois de abrir (e o js de um passo roda antes do wait)
  { js: `JSON.stringify({ aviso: document.querySelector('.update-card .uc-text')?.innerText.replace(/\\n/g, ' | ') })` },
  { click: '.update-card [data-a="later"]', wait: 400, js: `JSON.stringify({ fechado: !document.querySelector('.update-card'), dispensada: S.settings.updateDismissed })` },
  { js: `Updates.check().then((r) => JSON.stringify({ temNova: r.has, avisoDeNovo: !!document.querySelector('.update-card') }))` },
  { js: `Updates.check({ manual: true }).then(() => 'manual mostra: ' + !!document.querySelector('.update-card'))` },
  { js: `(async () => { openSettings('about'); await new Promise((r) => setTimeout(r, 500)); return 'sobre: versão ' + document.getElementById('app-version').textContent + ' | opção: ' + document.querySelector('[data-key="checkUpdates"]').checked; })()` },
];
