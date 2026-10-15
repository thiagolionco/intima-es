#!/usr/bin/env bash
# Aplica as migrações pendentes no banco dos clientes, na única ordem permitida:
#
#   1. guarda: lista as pendentes e barra as destrutivas sem autorização;
#   2. backup conferido e cifrado (fazer-backup.sh), que deixa uma cópia restaurada em COPIA_URL;
#   3. ensaio: aplica as migrações na cópia e confere que nenhuma tabela perdeu linha;
#   4. só então aplica na produção e confere de novo.
#
# Se qualquer etapa falhar, as seguintes não rodam. Mesmas variáveis de fazer-backup.sh.
set -euo pipefail
: "${BANCO_URL:?defina BANCO_URL}" "${COPIA_URL:?defina COPIA_URL}" "${BACKUP_SENHA:?defina BACKUP_SENHA}"
aqui="$(cd "$(dirname "$0")" && pwd)"
export SAIDA="${SAIDA:-backup}"

echo "== Etapa 1: migrações pendentes"
pendentes="$(node --experimental-strip-types --no-warnings "$aqui/../verificar-migracoes.mts" --pendentes)"
echo "$pendentes"
if grep -q "Nenhuma migração pendente" <<<"$pendentes"; then
  echo "Nada a aplicar. Banco dos clientes não foi tocado."
  exit 0
fi

echo "== Etapa 2: backup conferido"
"$aqui/fazer-backup.sh"

echo "== Etapa 3: ensaio na cópia"
DATABASE_URL="$COPIA_URL" npm run --silent db:migrar
"$aqui/contar-linhas.sh" "$COPIA_URL" > "$SAIDA/contagem-ensaio.txt"
FOLGA_PERCENTUAL=0 "$aqui/comparar-contagens.sh" "$SAIDA/contagem-copia.txt" "$SAIDA/contagem-ensaio.txt" migracao

echo "== Etapa 4: produção"
DATABASE_URL="$BANCO_URL" npm run --silent db:migrar
"$aqui/contar-linhas.sh" "$BANCO_URL" > "$SAIDA/contagem-depois.txt"
if ! "$aqui/comparar-contagens.sh" "$SAIDA/contagem-origem.txt" "$SAIDA/contagem-depois.txt" migracao; then
  echo "ATENÇÃO: a produção perdeu linhas depois da migração. Não mexa em mais nada;"
  echo "o backup cifrado desta execução está nos artefatos. Ver docs/seguranca/backup-e-restauracao.md."
  exit 1
fi
echo "Migrações aplicadas na produção, com backup conferido antes e nenhuma linha perdida."
