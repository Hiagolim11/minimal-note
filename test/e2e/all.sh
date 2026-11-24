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
check smoke "$out" '"path\":\"Teste.md\"' 'Corpo [[Bem-vindo]] #tag' '{\"links\":1,\"tags\":1}'
out=$(bash test/e2e/run.sh test/e2e/watcher.js 'sleep 12; echo "linha externa" >> "$VAULT/Bem-vindo.md"')
check watcher "$out" '{\"selfChanges\":0}' '\"welcomeHasLine\":true'
out=$(bash test/e2e/run.sh test/e2e/security.js)
check security "$out" 'recusado: Pasta não autorizada' 'recusado após settings:set' 'reabrir cofre salvo ok' 'recusado: Caminho fora do cofre' '"true object"'
out=$(bash test/e2e/run.sh test/e2e/remote.js 'node test/e2e/count-server.js')
# 3: a, b e o fundo c (antes o pedido cancelado do fundo ficava em cache e ele não carregava nem depois de ligar)
check remote "$out" 'total de acessos: 3'
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
out=$(bash test/e2e/run.sh test/e2e/find.js)
check find "$out" '\"count\":\"1/6\",\"marks\":6' '\"sel\":\"Gato\"' 'volta ao fim: 6/6' 'maiúsculas: 5/5' '{\"left\":0,\"caes\":6,\"count\":\"Nenhuma\",\"saved\":true}' 'desfazer: 5' '{\"closed\":true,\"focus\":\"editor\",\"marks\":0}' '{\"mode\":\"edit\",\"open\":true}'
grep -qE 'desalinhamento das marcas=0\.[0-4]' <<<"$out" || { echo "✖ find: marcas desalinhadas do texto"; fail=1; }
out=$(bash test/e2e/run.sh test/e2e/spell.js 'node test/e2e/lt-server.js')
check spell "$out" 'corretor: ready' 'erros: [\"nao\",\"exenplo\",\"Hiago\"]' 'desalinhamento=0.00' 'digitado: \"Hoje você vai \"' 'auto: \"vai não \"' 'desfeito: \"vai nao \"' 'virgula: \" Fim,\"' 'reticencias: \" e isso…\"' 'espacos: \"… um b\"' 'depois: [\"Informação\"]' '{\"open\":true,\"sugs\":[\"exemplo\"]}' '{\"fixed\":true,\"closed\":true}' '{\"file\":\"Hiago\\n\",\"underlined\":false}' '[\"a\",\"Crase\",[\"à\"]],[\"a\",\"Crase\",[\"à\"]]' '\"linha\":\"Fui à praia ontem. Depois, Fui a praia de novo.\",\"restam\":1' '{\"trecho\":\"Fui a praia\",\"s\":43}' '{\"dialog\":true,\"title\":\"Revisão gramatical\"}' '{\"ltEnabled\":false}' 'código como texto: false'
out=$(bash test/e2e/run.sh test/e2e/brain.js)
check brain "$out" '"classe\":\"BrainView\",\"modo\":\"2d\"' 'fora do lobo (2D): 0' '{\"aba\":\"Diário/Nota 2.md\",\"tipo\":\"note\"}' '\"modo\":\"3d\",\"mesma\":\"BrainView\"' 'fora do lobo (3D): 0' 'girou: true' '{\"aba\":\"Ideias/Nota 3.md\"}' '{\"estilo\":\"net\",\"classe\":\"GraphView\",\"brainClass\":false,\"canvases\":1}' '{\"classe\":\"BrainView\",\"canvases\":1}' 'erros: []'
out=$(bash test/e2e/run.sh test/e2e/features.js)
check features "$out" 'busca com erro: Roadmap | marca: orçamento' 'pasta receitas · tarefas pendentes | - [ ] comprar ovos' 'chips: 8' 'modelos: Diário,Leitura,Projeto,Reunião' '\"cursorNaPauta\":true,\"sobrou\":false' 'hoje: enviar contrato,revisar orçamento | badge: 2' 'concluída no arquivo: true'
grep -q 'data rápida: - \[ \] comprar ovos 📅 ' <<<"$out" || { echo "✖ features: data rápida"; fail=1; }
out=$(bash test/e2e/run.sh test/e2e/features2.js)
check features2 "$out" '\"katex\":2,\"bloco\":1,\"dinheiro\":true,\"svg\":true,\"erro\":false' 'ligado: Falei com o [[Cliente X|cliente x]]' 'outra nota: Valores do projeto. [[Ciência]]' 'nova linha começa com: \"| \"' 'Caixa de entrada.md' 'Notas rápidas/Ideia de app.md' 'janela de captura: true' 'vazio recusado: Nada para salvar'
out=$(bash test/e2e/run.sh test/e2e/brain-tools.js)
check brain-tools "$out" 'meio: 22 visíveis' 'fim: 42 · hoje' 'terminou: 42 visíveis' 'foco: 5 visíveis · salvo true' 'sem foco: 42' 'fora do lobo: 0' 'rede esconde: none'
out=$(bash test/e2e/run.sh test/e2e/protect.js)
check protect "$out" '{\"cifrado\":true,\"vazou\":false,\"naTela\":true}' 'Nova linha secreta' '\"bloqueadas\":1,\"tela\":true,\"somenteLeitura\":true,\"busca\":\"0 nota(s)\"' 'errada: Senha incorreta' '{\"aberta\":true,\"texto\":true}' '{\"novoCifrado\":true,\"vazou\":false}' 'cópias: 1' '{\"cifrado\":false,\"texto\":true}' '{\"a\":true,\"b\":true}' '{\"aAberta\":true,\"texto\":\"nota a\"}'
out=$(bash test/e2e/run.sh test/e2e/templates-seed.js)
check templates-seed "$out" '\"modelos\":[\"Diário\",\"Leitura\",\"Projeto\",\"Reunião\"],\"marcado\":true,\"avisos\":[]' '{\"noGrafo\":0' 'depois de apagar e reabrir: 0'
out=$(bash test/e2e/run.sh test/e2e/protect-review.js 'node test/e2e/lt-server.js')
check protect-review "$out" 'protegida: true' '{\"aberto\":true,\"titulo\":\"Revisar nota protegida?\"}' 'lt-server: 1 pedidos'
out=$(bash test/e2e/run.sh test/e2e/trash.js)
check trash "$out" '\"onde\":[\"vault\",\"vault\"],\"naLixeira\":2,\"naArvore\":false,\"notas\":[]' '{\"linha\":true,\"texto\":\"2 itens\"}' 'depois de esvaziar: 0' 'linha visível com lixeira vazia: false'
out=$(bash test/e2e/run.sh test/e2e/capture-protected.js)
check capture-protected "$out" 'protegida: true' 'é protegida por senha: salve como nota nova' '\"continuaCifrada\":true,\"textoAbertoNoArquivo\":false' 'modo nota: Notas rápidas/nota avulsa.md'
out=$(bash test/e2e/run.sh test/e2e/remote-dom.js)
check remote-dom "$out" '{\"remotos\":0,\"links\":[\"🖼 foto\",\"🖼 imagem da internet\"],\"local\":true}' '{\"imagensRemotas\":2,\"linksBloqueio\":0}'
out=$(bash test/e2e/run.sh test/e2e/history.js)
check history "$out" 'guardadas: [\"versão 1\",\"versão 2\"]' '{\"tela\":\"versão 1\",\"disco\":\"versão 1\",\"historico\":[\"versão 1\",\"versão 2\",\"versão 3\"]}' '{\"novo\":3,\"antigo\":0}' '{\"vazouTextoAberto\":false,\"vazouVersoesAntigas\":false,\"ultimaCifrada\":true}' '{\"tela\":\"segredo girassol\",\"discoCifrado\":true,\"disco\":\"segredo girassol\"}'
out=$(LUMEN_UPDATE_URL=http://127.0.0.1:47125/latest bash test/e2e/run.sh test/e2e/updates.js 'node test/e2e/update-server.js')
check updates "$out" '{\"aviso\":\"Versão 9.9.9 disponível | Você está na ' '{\"fechado\":true,\"dispensada\":\"9.9.9\"}' '{\"temNova\":true,\"avisoDeNovo\":false}' 'manual mostra: true' '| opção: true' 'update-server: 3 consultas'
exit $fail
