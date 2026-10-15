# 0009 · Mudanças seguras no banco dos clientes

*15/10/2026 · primeiro cliente real*

## Contexto

- O Clepsa passou a guardar dados de um cliente real enquanto o produto ainda é construído.
- O Supabase está no plano grátis, que não guarda backup. As migrações eram aplicadas à mão pelo
  conector, sem backup antes nem ensaio.
- O repositório é público: logs e artefatos do GitHub Actions podem ser vistos por qualquer um.

## Decisão

- Migrações só aditivas; o CI barra as destrutivas sem a linha de autorização no arquivo e barra
  a edição de migração existente.
- Backup diário pelo GitHub Actions: `pg_dump`, restauração conferida tabela a tabela num
  Postgres vazio, arquivo cifrado com AES-256, 30 dias de guarda.
- A produção só muda pelo workflow *Migrar produção*: guarda, backup conferido, ensaio na cópia
  restaurada, produção, conferência. Só roda após o "sim" por escrito do Thiago.
- Procedimento em [mudancas-seguras.md](../seguranca/mudancas-seguras.md) e
  [backup-e-restauracao.md](../seguranca/backup-e-restauracao.md).

## Consequências

- Depende dos segredos `BANCO_PRODUCAO_URL` (Session pooler do Supabase) e `BACKUP_SENHA`.
  Sem eles o backup diário falha e o GitHub avisa todo dia.
- Remover coluna ou tabela vira duas entregas separadas no tempo.
- Recomendado, fora do código: Supabase Pro (backups do próprio Supabase, sem pausa por
  inatividade), Vercel Pro (o plano grátis é não comercial) e um projeto Supabase de homologação
  para os previews da Vercel.
