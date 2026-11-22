#!/usr/bin/env bash
# Uso: bash test/e2e/run.sh <roteiro.js> [comando de fundo]
# Roda o app num cofre e perfil temporários. O comando de fundo (opcional) recebe $VAULT,
# ex.: 'sleep 8; echo externo >> "$VAULT/Bem-vindo.md"' para simular outro programa mexendo no cofre.
set -u
cd "$(dirname "$0")/../.."
T=$(mktemp -d); mkdir -p "$T/ud" "$T/out"
export VAULT="$T/vault"
[ -n "${2:-}" ] && bash -c "$2" &
LUMEN_VAULT="$VAULT" LUMEN_USER_DATA="$T/ud" LUMEN_TEST_OUT="$T/out" LUMEN_TEST_SCRIPT="$1" \
  timeout 90 ./node_modules/.bin/electron . --no-sandbox 2>&1 | grep --line-buffered -E '^\[(js|js-error|renderer|shot|click-miss)\]'
wait
echo "[dir] $T"
