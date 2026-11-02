#!/usr/bin/env bash
# Baixa os clipes da OpenArt para clipes/ (precisa de cdn.openart.ai liberado na rede).
# Uso: bash preso_no_jogo/parte2/baixar_clipes.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p clipes
while read -r nome url; do
  [ -z "$nome" ] || [ "${nome:0:1}" = "#" ] && continue
  [ "$url" = "-" ] && { echo "pendente: $nome"; continue; }
  echo "baixando $nome"; curl -fsSL --retry 3 -o "clipes/$nome.mp4" "$url"
done < clipes.txt
