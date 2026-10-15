#!/usr/bin/env bash
# Backup conferido do banco dos clientes.
#
#   BANCO_URL     banco de origem (produção), com usuário dono das tabelas
#   COPIA_URL     Postgres vazio e descartável onde o backup é restaurado para conferir
#   BACKUP_SENHA  senha que cifra o arquivo (AES-256); sem ela o arquivo não é aberto
#   SAIDA         pasta onde ficam banco-<data>.dump.gpg e o .sha256 (padrão: ./backup)
#
# 1. pg_dump dos schemas public (dados do app) e drizzle (versão das migrações);
# 2. restaura numa cópia vazia, criando antes os papéis que o backup cita;
# 3. confere tabela a tabela que a cópia tem as mesmas linhas da origem;
# 4. cifra o arquivo e apaga a versão aberta.
# Só termina com sucesso se as quatro etapas derem certo. A cópia fica restaurada em COPIA_URL,
# pronta para o ensaio da migração (scripts/banco/migrar-com-seguranca.sh).
set -euo pipefail
: "${BANCO_URL:?defina BANCO_URL}" "${COPIA_URL:?defina COPIA_URL}" "${BACKUP_SENHA:?defina BACKUP_SENHA}"
aqui="$(cd "$(dirname "$0")" && pwd)"
# A cópia é apagada antes de restaurar: ela só pode ser um Postgres local e descartável,
# nunca o banco dos clientes.
case "$COPIA_URL" in
  *@localhost:*|*@localhost/*|*@127.0.0.1:*|*@127.0.0.1/*) ;;
  *) echo "COPIA_URL precisa ser um Postgres local (localhost). Recusado para não apagar outro banco."; exit 1 ;;
esac
[ "$COPIA_URL" != "$BANCO_URL" ] || { echo "COPIA_URL igual a BANCO_URL. Recusado."; exit 1; }
SAIDA="${SAIDA:-backup}"
mkdir -p "$SAIDA"
carimbo="$(date -u +%Y%m%d-%H%M%S)"
aberto="$SAIDA/banco-$carimbo.dump"
trap 'rm -f "$aberto"' EXIT

echo "1/4 Copiando o banco (pg_dump)..."
pg_dump "$BANCO_URL" --format=custom --schema=public --schema=drizzle --file="$aberto"
"$aqui/contar-linhas.sh" "$BANCO_URL" > "$SAIDA/contagem-origem.txt"

echo "2/4 Restaurando numa cópia vazia..."
# O Supabase concede acesso a papéis próprios (anon, authenticated, service_role...). Eles
# precisam existir na cópia para os GRANT e as políticas de isolamento serem restaurados iguais.
papeis=$(pg_restore --schema-only --file=- "$aberto" \
  | grep -E '^(GRANT|REVOKE|CREATE POLICY|ALTER DEFAULT PRIVILEGES)' \
  | perl -ne 'while (/\b(?:TO|FROM|ROLE)\s+((?:"?\w+"?\s*,\s*)*"?\w+"?)/g) { print "$_\n" for split /\s*,\s*/, $1 }' \
  | tr -d '"' | grep -vxE 'public|PUBLIC' | sort -u)
for papel in $papeis; do
  psql "$COPIA_URL" -XqAt -v ON_ERROR_STOP=1 -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = '$papel') then create role \"$papel\" nologin; end if; end \$\$;"
done
psql "$COPIA_URL" -XqAt -v ON_ERROR_STOP=1 -c "set client_min_messages to warning; drop schema if exists drizzle cascade; drop schema if exists public cascade;"
pg_restore --dbname="$COPIA_URL" --no-owner --exit-on-error --single-transaction "$aberto"

echo "3/4 Conferindo a cópia tabela a tabela..."
"$aqui/contar-linhas.sh" "$COPIA_URL" > "$SAIDA/contagem-copia.txt"
"$aqui/comparar-contagens.sh" "$SAIDA/contagem-origem.txt" "$SAIDA/contagem-copia.txt" copia

echo "4/4 Cifrando o arquivo..."
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
  --output "$aberto.gpg" "$aberto" 3<<<"$BACKUP_SENHA"
(cd "$SAIDA" && sha256sum "$(basename "$aberto").gpg" > "$(basename "$aberto").gpg.sha256")
echo "Backup conferido e cifrado: $aberto.gpg"
