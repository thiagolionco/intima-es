# 0006 · PostgreSQL com isolamento por escritório (RLS)

*10/10/2026 · aceita · Fase 1*

## Contexto

Até a versão 2, os dados ficavam em arquivos JSON (`.data/`), com um espaço de trabalho por
usuário. A versão 4 isola os dados por **escritório**, e o isolamento precisa ser garantido
pelo banco, não só pelo código: um filtro esquecido numa consulta não pode vazar dados.

## Decisão

- **Drizzle ORM** sobre `pg` (node-postgres). Tabelas em `server/infra/postgres/schema.ts`,
  migrações em `drizzle/` (`npm run db:gerar` cria uma nova a partir do schema;
  `npm run db:migrar` aplica as pendentes).
- **Duas famílias de tabelas:**
  - *Identidade* (`usuarios`, `sessoes`, `tokens_verificacao`, `desafios_dois_fatores`,
    `auditoria`): consultadas antes de se saber o escritório (login, validação de sessão).
    RLS ligado e sem política: só o dono das tabelas (a conexão do app) as lê.
  - *Escritório* (`escritorios`, `membros`, `espacos_trabalho`, e as próximas fases):
    RLS **forçado** por `escritorio_id`.
- **Papel restrito `sentinela_app`** (sem `BYPASSRLS`), criado na migração 0001. Toda
  consulta às tabelas do escritório roda em `comEscritorio` (`server/infra/postgres/contexto.ts`):
  abre uma transação, faz `SET LOCAL ROLE sentinela_app`, grava `app.usuario_id`, descobre o
  escritório pela filiação e grava `app.escritorio_id`. As políticas comparam com esses valores.
  Sem contexto, o papel não enxerga nada. Como é `SET LOCAL`, funciona com pooler em modo
  transação (o do Supabase, porta 6543).
- **Mesmas interfaces de antes.** Os repositórios Postgres implementam as mesmas portas dos
  repositórios em arquivo. O app usa o Postgres quando há `DATABASE_URL`; sem ela, continua
  com os arquivos.
- **Cada conta é dona do próprio escritório.** Ao criar uma conta, o repositório cria o
  escritório (com o nome informado no cadastro, ou o nome da pessoa), a filiação como `dono`
  e o espaço de trabalho vazio. Excluir a conta remove a filiação e apaga o escritório que
  ficar sem ninguém.
- **Supabase:** a migração tira o acesso dos papéis `anon` e `authenticated` (expostos pela API
  de dados do Supabase) a todas as tabelas, e o RLS ligado em todas garante o mesmo.

## Como se verifica

- A suíte de autenticação inteira roda duas vezes: em memória e contra o Postgres.
- `tests/isolamento-escritorios.test.ts` tenta ler, alterar, apagar e gravar dados de outro
  escritório com o contexto de um usuário; o banco precisa recusar. Foi conferido que, com
  uma política afrouxada de propósito, esses testes falham.
- No CI, um Postgres 16 sobe como serviço e `TEST_DATABASE_URL` é obrigatória.

## Migrar os dados atuais

```bash
npm run db:migrar     # cria as tabelas
npm run db:importar   # copia .data/ para o banco (pode repetir; não duplica)
```

## Pendências e riscos

- **Conexão segura com o Supabase.** Use a string de conexão do painel do Supabase. Para
  exigir TLS com verificação do certificado, baixe o certificado do projeto (Database ›
  SSL Configuration) e use `?sslmode=verify-full&sslrootcert=/caminho/prod-ca-2021.crt`.
  As migrações 0000 e 0001 foram aplicadas no projeto real (São Paulo) em 2026-10-11 pelo
  conector do Supabase, com o isolamento conferido lá; o app em si ainda não rodou contra ele.
- Os testes rodam como superusuário, que enxerga tudo fora do contexto; o isolamento é
  testado sempre dentro de `comEscritorio`, que é como o app acessa os dados.
- **Recursos posteriores (migração 0002).** `espacos_trabalho` ganhou `suspensoes` e
  `preferencias` (avisos e equipe). Cliente antigo que não manda esses campos não os apaga. A tabela
  `documentos` (chave → JSON) guarda a conexão do Google Agenda e o registro de avisos enviados,
  com RLS ligado e sem política, como a identidade. `npm run db:importar` também copia esses dois
  documentos.
- **`LINKS_SECRET` é obrigatório em produção com banco.** Ele assina o link "Já cumpri" e cifra o
  token do Google. Sem a variável, o app gerava um segredo em arquivo; num servidor que perde o
  disco a cada publicação isso invalidaria os links e a conexão com a Agenda. O app agora se
  recusa a subir nessa situação.
- A caixa de saída de e-mails de desenvolvimento continua em arquivo.
- As intimações e os clientes continuam como documento JSON por escritório. As tabelas
  próprias (Processo, Comunicacao, Monitoramento…) vêm nas fases 2 a 4.
