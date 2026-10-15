# Mudanças seguras: como o banco dos clientes é alterado

Desde 15/10/2026 o Clepsa tem cliente real. Regra: **nenhuma manutenção altera o ambiente dos
clientes sem antes garantir que os dados deles estão a salvo.** Ver a
[decisão 0009](../decisoes/0009-mudancas-seguras.md).

## As quatro travas

| Trava | Onde | O que garante |
| --- | --- | --- |
| Guarda das migrações | CI de todo PR (`scripts/verificar-migracoes.mts`) | Migração já existente não muda nem some. Migração nova só acrescenta: apagar tabela ou coluna, `DELETE`, `UPDATE` em massa, `TRUNCATE`, renomear, mudar tipo ou desligar o isolamento entre escritórios barra o PR. |
| Backup diário conferido | `.github/workflows/backup.yml`, 03:17 de Brasília | Cópia do banco restaurada num Postgres vazio e conferida tabela a tabela; o arquivo fica cifrado (AES-256) por 30 dias. Falhou, o GitHub avisa por e-mail. |
| Migração só pela porta segura | `.github/workflows/migrar-producao.yml` | Pendentes conferidas pela guarda → backup conferido → ensaio na cópia restaurada → produção → conferência de que nenhuma tabela perdeu linha. Qualquer falha para tudo. |
| Autorização por escrito | Thread do projeto | O workflow só roda depois do "sim" do Thiago para aquela migração, e pede que se digite APLICAR. |

No CI, o job "Guarda das migrações e ensaio do backup" também roda a porta segura inteira num
banco de mentira com os papéis do Supabase, para a ferramenta nunca quebrar sem ninguém ver.

## Ordem de uma entrega que mexe no banco

1. O PR traz a migração **só aditiva** (tabela, coluna que aceita vazio, índice, política) e o
   código que funciona **com e sem** ela. CI verde.
2. Thiago aprova por escrito na thread.
3. Roda-se **Migrar produção** no ramo do PR (Actions › Migrar produção › Run workflow ›
   escolher o ramo › APLICAR). Depois de aplicada, a migração não muda mais: correção é migração nova.
4. Logo em seguida o PR é juntado ao `main` (a Vercel publica o código novo).
5. Se o código novo der problema: *Instant Rollback* na Vercel volta ao anterior em segundos; o
   banco não precisa voltar, porque a migração só acrescentou.

Remover algo antigo (coluna sem uso, tabela abandonada) é uma segunda entrega, semanas depois,
com a linha `-- mudanca-destrutiva-autorizada: <quem, quando, por quê>` no arquivo, depois de
um backup conferido do dia.

## O que nunca se faz

- Rodar SQL que escreve no banco dos clientes direto pelo painel ou pelo conector, fora do
  workflow. Leitura para diagnóstico pode; escrita, só com autorização por escrito e backup do dia.
- Editar uma migração que já foi aplicada.
- Apagar ou trocar o segredo `BACKUP_SENHA` sem guardar o antigo: sem ele os backups antigos
  não abrem.

Restauração: [backup-e-restauracao.md](backup-e-restauracao.md).
