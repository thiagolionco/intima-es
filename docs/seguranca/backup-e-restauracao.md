# Backup e restauração

## Onde estão os backups

- **GitHub Actions** (todo dia, 30 dias): Actions › *Backup do banco* › uma execução verde ›
  *Artifacts*. Antes de cada migração há outro, guardado por 90 dias (*Migrar produção*).
  O arquivo é `banco-AAAAMMDD-HHMMSS.dump.gpg`, cifrado com o segredo `BACKUP_SENHA`.
- **Supabase** (só no plano Pro): backups diários de 7 dias no painel, em Database › Backups.

O repositório é público: qualquer conta do GitHub consegue baixar o artefato, mas sem a senha ele
é ilegível. A senha fica só nos segredos do GitHub e no gerenciador de senhas do Thiago.

## Abrir um backup

```bash
sha256sum -c banco-*.dump.gpg.sha256
gpg --decrypt --output banco.dump banco-*.dump.gpg     # pede a BACKUP_SENHA
pg_restore --list banco.dump | head                    # confere o conteúdo
```

## Restaurar: sempre primeiro numa cópia

```bash
# Postgres 17 local ou o projeto de homologação; nunca a produção neste passo.
COPIA_URL=postgres://postgres@localhost:5432/postgres
for p in sentinela_app anon authenticated service_role; do psql "$COPIA_URL" -c "create role $p nologin" || true; done
psql "$COPIA_URL" -c "drop schema if exists drizzle cascade; drop schema if exists public cascade;"
pg_restore --dbname="$COPIA_URL" --no-owner --exit-on-error --single-transaction banco.dump
scripts/banco/contar-linhas.sh "$COPIA_URL"
```

Conferido na cópia, há dois caminhos para a produção, **ambos só com autorização por escrito do
Thiago e com um backup novo da produção feito antes** (para poder desfazer a restauração):

1. **Recuperar só o que se perdeu** (preferido): copiar da cópia para a produção apenas as linhas
   ou a tabela afetada, com `INSERT ... ON CONFLICT DO NOTHING`. Os dados que os clientes
   gravaram depois do backup continuam lá.
2. **Voltar o banco inteiro** (último recurso): pausar as rondas (Actions › Rondas › Disable),
   `pg_restore --clean --if-exists --no-owner --single-transaction` na produção pela Session
   pooler, conferir com `contar-linhas.sh`, reativar as rondas. Tudo o que foi gravado depois do
   backup se perde; a ronda busca de novo as intimações, mas edições e prazos digitados não voltam.

## Ensaio de restauração

Todo backup diário já é restaurado e conferido antes de ser guardado. Uma vez por mês, vale
baixar um artefato e abrir com a senha, para ter certeza de que a senha guardada é a certa.
