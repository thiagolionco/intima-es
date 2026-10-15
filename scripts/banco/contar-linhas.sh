#!/usr/bin/env bash
# Conta as linhas de cada tabela dos schemas public e drizzle. Uso: contar-linhas.sh <url>
# Saída: "schema.tabela quantidade", uma por linha, em ordem alfabética.
set -euo pipefail
psql "$1" -v ON_ERROR_STOP=1 -XAt -F ' ' -c "
  select table_schema || '.' || table_name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    from information_schema.tables
   where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE'
   order by 1"
