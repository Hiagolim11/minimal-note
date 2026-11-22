#!/usr/bin/env bash
# Roda todos os roteiros de ponta a ponta e falha se algum resultado esperado não aparecer.
cd "$(dirname "$0")/../.."
fail=0
check() { # check <nome> <saída> <padrão esperado>...
  local name=$1 out=$2 ok=1; shift 2
  for pat in "$@"; do
    if ! grep -qF -- "$pat" <<<"$out"; then echo "✖ $name: faltou: $pat"; ok=0; fi
  done
  if grep -qE '^\[(js-error|renderer)\].*(Error|error)' <<<"$out"; then echo "✖ $name: erro no renderer:"; grep -E '^\[(js-error|renderer)\]' <<<"$out"; ok=0; fi
  if [ $ok = 1 ]; then echo "✔ $name"; else fail=1; fi
}
out=$(bash test/e2e/run.sh test/e2e/smoke.js)
check smoke "$out" '"path\":\"Teste.md\"' 'corpo [[Bem-vindo]] #tag' '{\"links\":1,\"tags\":1}'
out=$(bash test/e2e/run.sh test/e2e/watcher.js 'sleep 12; echo "linha externa" >> "$VAULT/Bem-vindo.md"')
check watcher "$out" '{\"selfChanges\":0}' '\"welcomeHasLine\":true'
out=$(bash test/e2e/run.sh test/e2e/security.js)
check security "$out" 'recusado: Pasta não autorizada' 'recusado após settings:set' 'reabrir cofre salvo ok' 'recusado: Caminho fora do cofre' '"true object"'
out=$(bash test/e2e/run.sh test/e2e/remote.js 'node test/e2e/count-server.js')
check remote "$out" 'total de acessos: 2'
grep -B99 -F 'fim da fase bloqueada' <<<"$out" | grep -q 'servidor recebeu' && { echo "✖ remote: imagem baixada com a opção desligada"; fail=1; }
out=$(bash test/e2e/run.sh test/e2e/symlink.js 'sleep 3; echo segredo > "$VAULT/../fora.txt"; ln -s ../fora.txt "$VAULT/link.md"; ln -s .. "$VAULT/pasta-link"; mkdir -p "$VAULT/sub"')
check symlink "$out" 'recusado: Caminho fora do cofre (link simbólico): link.md' 'pasta-link/novo.md' 'escrita normal em subpasta nova: ok'
grep -q 'LEU O LINK\|ESCREVEU' <<<"$out" && { echo "✖ symlink: acesso indevido"; fail=1; }
out=$(bash test/e2e/run.sh test/e2e/close.js); d=$(sed -n 's/^\[dir\] //p' <<<"$out")
grep -q '"windowBounds"' "$d/ud/settings.json" && grep -q '"theme": "nord"' "$d/ud/settings.json" && echo "✔ close" || { echo "✖ close: settings.json sem windowBounds/tema"; fail=1; }
S=$(mktemp -d); out=$(LUMEN_TEST_SAVE="$S" bash test/e2e/run.sh test/e2e/tour.js)
check tour "$out" '{\"paleta\":true' '"graph"' 'Diário/' 'seções ok' 'busca ok' 'split split' 'exportHtml ok' '"[]"'
[ -s "$S/Bem-vindo.html" ] || { echo "✖ tour: HTML exportado não foi gravado"; fail=1; }
out=$(bash test/e2e/run.sh test/e2e/concurrent-save.js)
check concurrent-save "$out" '{\"final\":\" versão 29\",\"pendente\":false,\"erros\":0}'
out=$(bash test/e2e/run.sh test/e2e/rename-links.js "sleep 1; $(cat test/e2e/rename-links.setup)")
check rename-links "$out" 'daqui é a B' '[[C/Nova]] e [[B/Nota]]' '[[Nova]] e [[Nova|apelido]] e [[Nova#Seção]]'
grep -q '\[\[Nova\]\] daqui é a B' <<<"$out" && { echo "✖ rename-links: link da outra nota homônima foi reescrito"; fail=1; }
out=$(bash test/e2e/run.sh test/e2e/editor-overlay.js)
check editor-overlay "$out" 'incremental = completo' 'desalinhamento máximo=0.00px'
exit $fail
