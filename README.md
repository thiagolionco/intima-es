# Clepsa: controle de intimações (Comunica PJe)

Aplicação web em Next.js 15 (React 19) para acompanhar as intimações publicadas no
[Comunica PJe](https://comunica.pje.jus.br/) (Diário de Justiça Eletrônico Nacional)
para uma carteira de clientes.

**Versão 2:** contas de usuário com autenticação de nível corporativo, espaço de trabalho
isolado por usuário no servidor, e-mails transacionais e uma central de exportação.
Veja [Autenticação e contas](#autenticação-e-contas-versão-2).

**Versão 4 (Sentinela), em construção:** o app está sendo transformado numa vigília que
avisa, em fases com aprovação entre elas. Roteiro, decisões e perguntas em aberto em
[`docs/`](docs/README.md).

## Requisitos

- Node.js 22.6 ou superior (o arquivo `.nvmrc` fixa a versão 22)
- npm
- git

## Como rodar

### No Windows, do zero

1. Instale o **Node.js 22 ou superior** em https://nodejs.org (versão LTS) e o **Git** em
   https://git-scm.com. Aceite as opções padrão dos instaladores.
2. Abra o **PowerShell** e baixe o projeto:

   ```powershell
   cd $HOME
   git clone https://github.com/thiagolionco/intima-es.git
   cd intima-es
   ```

3. Se você já usava o app numa pasta antiga, copie a pasta de dados para cá
   (contas, sessões e intimações ficam nela):

   ```powershell
   Copy-Item -Recurse ..\projetointimações-v2\.data .\.data
   ```

4. Instale as dependências e inicie:

   ```powershell
   npm ci
   npm run dev
   ```

5. Abra http://localhost:3000 no navegador. Para parar, volte ao PowerShell e tecle `Ctrl+C`.

Para pegar as novidades depois: `git pull` e `npm ci` dentro da pasta `intima-es`.

### Produção

```bash
npm ci
npm run build
npm start
```

Não é preciso nenhuma variável de ambiente para testar: os e-mails vão para uma caixa de
saída local (`/dev/caixa-de-saida`) e os dados ficam em `./.data`. Para produção, copie
`.env.example` para `.env.local` e configure `APP_URL` e o envio de e-mail (SMTP ou Resend).

> A pasta `.data/` guarda dados reais e **nunca** vai para o git. Faça cópia de segurança dela.

## Funcionalidades

| Página | O que faz |
| --- | --- |
| **Painel** (`/`) | Cards de resumo (total, novas, em análise, prazos vencidos), gráfico por mês, distribuição por status, por tipo de comunicação, por cliente e por tribunal, intimações recentes e prazos a acompanhar. |
| **Intimações** (`/intimacoes`) | Lista em cards ou tabela, busca livre (ignora acentos), filtros por intervalo de datas, tipo de comunicação (categoria), status, cliente e tribunal, ordenação, paginação, ações em lote e exportação CSV. |
| **Detalhe** (`/intimacoes/[id]`) | Órgão, data de disponibilização, tipo de comunicação, meio, tipo de documento, classe (tipo de ação), partes com polo, advogados com OAB, inteiro teor, status, prazo e observações. |
| **Nova / Editar** | Formulário validado com seletor de datas, máscara do número CNJ e listas dinâmicas de partes e advogados. |
| **Buscar no Comunica** (`/comunica`) | Pesquisa todos os clientes ativos, um cliente específico ou uma pesquisa avulsa num período; mostra o andamento por cliente, marca o que já está no acervo e importa as novas sem duplicar. |
| **Clientes monitorados** (`/clientes`) | Campo configurável com o que deve ser pesquisado: nome da parte, nome do advogado, número da OAB + UF ou número do processo, com filtro opcional por tribunal. |
| **Dados e backup** (`/dados`) | Exportar CSV, backup e restauração em JSON, dados de demonstração e limpeza total. |

Os dados de cada usuário ficam no servidor, em `DATA_DIR/espacos/<id-do-usuário>.json`.
Na primeira vez que você entrar num navegador que tinha dados da Versão 1 (localStorage),
a aplicação oferece importá-los para a sua conta.

## Autenticação e contas (Versão 2)

| Recurso | Detalhes |
| --- | --- |
| **Cadastro em 3 etapas** (`/criar-conta`) | Identificação → senha (medidor de força, checklist, gerador de senha forte) → revisão e consentimento LGPD. |
| **Confirmação de e-mail** | Link de uso único válido por 24 h, reenvio com contagem regressiva. Sem confirmar, não entra. |
| **Login em etapas** (`/entrar`) | E-mail → senha (aviso de Caps Lock, "manter conectado por 30 dias") → código de 6 dígitos quando há 2FA. |
| **Verificação em duas etapas** | TOTP (Google/Microsoft Authenticator, Authy, 1Password) com QR code, 10 códigos de recuperação, proteção contra reutilização de código. |
| **Esqueci a senha** | Link de 30 min; ao redefinir, todas as sessões são encerradas e o titular recebe aviso. |
| **Minha conta** (`/conta`) | Perfil; placar de segurança; troca de senha; dispositivos conectados com encerramento remoto; registro de atividade com filtros; exportação dos dados (LGPD) e exclusão da conta. |
| **Espaço próprio** | Intimações e clientes de cada conta ficam isolados no servidor; o usuário vem sempre do cookie de sessão, nunca do navegador. Gravação automática com controle de concorrência entre abas. |
| **Central de exportação** | Modal com escopo (resultado filtrado, selecionadas, acervo), formato (Excel .xlsx, CSV, PDF/impressão, JSON), escolha e ordem das colunas, presets, formato de data, separador, nome do arquivo, pré-visualização ao vivo e "copiar como tabela". |

### Segurança

- Senhas com **scrypt** (sal aleatório, parâmetros versionados); política de senha única no navegador e no servidor.
- Sessões com token aleatório de 256 bits em cookie **HttpOnly + SameSite=Lax** (`__Host-` e `Secure` em produção); no servidor só fica o **hash** do token. Expiração por inatividade (8 h, ou 30 dias com "manter conectado") e absoluta.
- **Bloqueio** de 15 min após 5 senhas erradas, com aviso por e-mail; **limite de taxa** por IP e por e-mail em login, cadastro, reenvio e recuperação.
- Respostas que **não revelam** se um e-mail está cadastrado (cadastro, login e recuperação), inclusive no tempo de resposta.
- Tokens de e-mail de **uso único**, guardados como hash, enviados no fragmento da URL (`#token=`), que não vai para logs nem para o cabeçalho Referer.
- **CSRF**: toda requisição que altera dados precisa vir da mesma origem. Cabeçalhos de segurança (X-Frame-Options, nosniff, Referrer-Policy, HSTS em produção).
- **Auditoria** de logins, falhas, bloqueios, trocas de senha, 2FA e sessões; alerta por e-mail em acesso de dispositivo novo.

### Arquitetura (SOLID)

```
server/
  core/            erros de aplicação, relógio, utilitários de criptografia
  auth/
    model.ts       entidades (Usuario, Sessao, Token…) — sem dependência de infraestrutura
    ports.ts       interfaces: repositórios, HashDeSenha, LimitadorDeTaxa, SegundoFator, NotificacoesDeConta
    services/      um serviço por responsabilidade: Cadastro, Autenticacao, Sessao,
                   RecuperacaoSenha, DoisFatores, Conta
  workspace/       espaço de trabalho por usuário (repositório + serviço)
  infra/           implementações: armazenamento em arquivo/memória, scrypt, TOTP,
                   limitador em memória, e-mail (caixa local, SMTP, Resend) e templates
  http/rota.ts     adaptador HTTP: CSRF, sessão, leitura de JSON e tradução de erros
  container.ts     raiz de composição — único lugar que conhece as classes concretas
app/api/...        rotas finas: leem a requisição, chamam um serviço, devolvem JSON
lib/exportacao/    colunas, formatos (registro aberto para novos formatos) e gerador de ZIP/XLSX
```

- **S**: cada serviço tem uma responsabilidade; templates de e-mail são separados do transporte.
- **O**: novos formatos de exportação, colunas ou provedores de e-mail entram por registro, sem alterar quem os usa.
- **L**: qualquer `ArmazenamentoDocumentos` (arquivo ou memória) ou `EnviadorDeEmail` serve no lugar do outro; os testes rodam o sistema inteiro em memória.
- **I**: cada serviço declara com `Pick<>` só as dependências que usa.
- **D**: serviços dependem de interfaces; `server/container.ts` injeta as implementações. Trocar o banco em arquivo por Postgres, ou o limitador por Redis, é escrever uma classe nova e registrá-la lá.

> O armazenamento em arquivo atende a uma instalação em um servidor ou máquina. Em
> hospedagens serverless (ex.: Vercel), onde o disco não é persistente, implemente os
> repositórios com um banco de dados.

### Hospedar na internet (Fly.io, São Paulo)

O Comunica PJe recusa chamadas vindas de fora do Brasil, então o servidor precisa estar
no Brasil. O repositório já traz um `Dockerfile` e um `fly.toml` com a região `gru`
(São Paulo), um volume em `/data` para os dados e desligamento automático quando ninguém
está usando.

```bash
fly launch --no-deploy --copy-config   # cria o app (ajuste o nome em fly.toml se já existir)
fly secrets set EMAIL_PROVIDER=smtp SMTP_HOST=... SMTP_USER=... SMTP_PASSWORD=... EMAIL_FROM="..."
fly deploy
```

Ajuste `APP_URL` em `fly.toml` para o endereço final. Mantenha uma única máquina: os
dados ficam no volume dela.

### Configurar o envio real de e-mails

Em `.env.local`:

```bash
APP_URL=http://localhost:3000
EMAIL_PROVIDER=smtp
EMAIL_FROM="Clepsa <voce@gmail.com>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=voce@gmail.com
SMTP_PASSWORD=sua-senha-de-app   # Gmail: Conta Google › Segurança › Senhas de app
```

Ou, com Resend: `EMAIL_PROVIDER=resend` e `RESEND_API_KEY=...`.

### Roteiro de teste da Versão 2

1. `npm run dev` e abra http://localhost:3000 — você cai em **Entrar**.
2. **Criar uma conta**: percorra as 3 etapas (teste o "Gerar senha forte" e a validação).
3. Na tela "Confirme seu e-mail", clique em **Abrir caixa de saída** e depois no botão do e-mail. O link também aparece no terminal.
4. Entre. Tente uma senha errada antes para ver a mensagem e, depois, o registro em **Minha conta › Atividade**.
5. Em **Dados e backup › Carregar exemplo**, recarregue a página: os dados continuam (estão no servidor).
6. Em **Intimações › Exportar**, experimente formatos, presets, ordem das colunas e a pré-visualização; exporte em Excel e gere o PDF.
7. Em **Minha conta › Segurança**, ative a verificação em duas etapas com o celular, guarde os códigos, saia e entre de novo usando o código (ou um código de recuperação).
8. Abra uma janela anônima, crie outra conta e confirme que ela começa vazia (espaço isolado). Na primeira janela, veja as duas sessões em **Dispositivos** e encerre a outra.
9. Em **Privacidade e dados**, baixe seus dados (JSON) e, se quiser, exclua a conta.

## Integração com o Comunica PJe

O navegador chama `GET /api/comunica` (route handler do Next.js), que consulta
`https://comunicaapi.pje.jus.br/api/v1/comunicacao` no servidor. Isso evita bloqueio de
CORS e permite paginar (até 5 páginas de 100 itens por cliente). Parâmetros usados:
`nomeParte`, `nomeAdvogado`, `numeroOab` + `ufOab`, `numeroProcesso`, `siglaTribunal`,
`dataDisponibilizacaoInicio`, `dataDisponibilizacaoFim`, `pagina`, `itensPorPagina`.

A conversão da resposta fica em `lib/comunica.ts` e é tolerante a variações de nomes de
campos. A API pública tem limite de requisições; quando ela responde 429 a aplicação
avisa para aguardar. A API pode recusar acessos vindos de fora do Brasil.

## Roteiro de teste manual

1. Abra o **Painel** e clique em **Carregar dados de exemplo** (30 intimações fictícias e 4 clientes).
2. Confira os cards e gráficos; alterne entre 6 e 12 meses; clique em **Concluir** em um prazo.
3. Em **Intimações**, busque "rio claro"; abra **Filtros**, use o atalho **30 dias** e escolha uma categoria; troque para a visão em tabela.
4. Selecione algumas intimações e altere o status em lote; depois **Exportar CSV** (abre no Excel com acentos corretos).
5. Clique em **Nova intimação** e tente salvar vazio para ver a validação; preencha, escolha um prazo pelo calendário e salve.
6. No detalhe, edite observações, mude o status, clique em **Editar** e depois em **Excluir**.
7. Em **Clientes monitorados**, cadastre um cliente real (por exemplo, o nome de uma empresa ou sua OAB).
8. Em **Buscar no Comunica**, escolha o cliente, um período curto e clique em **Buscar intimações**; importe os resultados e repita a busca para ver a marcação "Já no acervo".
9. Em **Dados e backup**, exporte o JSON, apague tudo e restaure o backup.

## Testes automatizados e CI

```bash
npm test        # autenticação, 2FA, sessões, isolamento, exportação, API do Comunica, filtros
npm run typecheck
npm run lint
npm run build
```

O GitHub Actions (`.github/workflows/ci.yml`) roda esses quatro passos em todo PR e no
`main`, mais a auditoria de dependências (`npm audit`), que bloqueia o merge quando há
falha alta ou crítica: ver [`docs/decisoes/0005`](docs/decisoes/0005-next-15.md).

## Estrutura

```
app/(auth)/           telas públicas: entrar, criar conta, confirmar e-mail, recuperar senha
app/(app)/            telas internas (exigem sessão): painel, intimações, Comunica, clientes, dados, conta
app/api/              rotas: auth, conta, espaço de trabalho, Comunica e caixa de saída de dev
middleware.ts         barra o acesso sem cookie de sessão
server/               domínio e infraestrutura de autenticação (ver "Arquitetura")
components/           UI (auth, conta, exportação, cards, gráficos, modais, toasts, formulário)
lib/                  tipos, store sincronizada com o servidor, sessão no navegador, exportação, Comunica
tests/                testes com node:test
docs/                 decisões, fontes de dados e segurança
.github/workflows/    CI
```
