#!/usr/bin/env bash
# Compara duas contagens de contar-linhas.sh. Uso: comparar-contagens.sh <antes> <depois> <modo>
#   modo "copia":    o depois é a cópia restaurada; toda tabela do antes precisa estar lá, com as
#                    mesmas linhas (folga de 2% para o que a ronda gravou entre o backup e a contagem).
#   modo "migracao": o depois é o mesmo banco após migrar; nenhuma tabela pode sumir nem perder linha
#                    (folga de 2% só quando o banco está no ar e o app pode podar dados antigos).
# Não imprime as quantidades: o log do GitHub Actions deste repositório é público.
set -euo pipefail
antes="$1"; depois="$2"; modo="$3"; folga="${FOLGA_PERCENTUAL:-2}"
falhas=0
while read -r tabela n_antes; do
  n_depois=$(awk -v t="$tabela" '$1 == t { print $2 }' "$depois")
  if [ -z "$n_depois" ]; then
    echo "FALTA: $tabela sumiu"; falhas=$((falhas + 1)); continue
  fi
  minimo=$(( n_antes - (n_antes * folga + 99) / 100 ))
  if [ "$n_depois" -lt "$minimo" ] || { [ "$n_antes" -gt 0 ] && [ "$n_depois" -eq 0 ]; }; then
    echo "PERDA: $tabela tem menos linhas do que deveria"; falhas=$((falhas + 1)); continue
  fi
  echo "ok: $tabela"
done < "$antes"
if [ "$falhas" -gt 0 ]; then
  echo "Conferência ($modo) FALHOU em $falhas tabela(s)."; exit 1
fi
echo "Conferência ($modo): todas as $(wc -l < "$antes") tabelas conferem."
