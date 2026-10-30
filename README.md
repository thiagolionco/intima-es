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

### Banco de dados (PostgreSQL)

Sem configuração, os dados ficam em arquivos na pasta `.data/`. Para usar o PostgreSQL
(por exemplo, o Supabase em São Paulo), defina `DATABASE_URL` em `.env.local` (em produção, também `LINKS_SECRET`) e rode:

```bash
npm run db:migrar     # cria as tabelas e o isolamento por escritório
npm run db:importar   # opcional: copia os dados de .data/ para o banco
```

Cada conta é dona do próprio escritório, e o banco (não só o código) impede que um
escritório veja os dados de outro. Detalhes em
[`docs/decisoes/0006`](docs/decisoes/0006-postgres-e-rls.md).

## Funcionalidades

| Página | O que faz |
| --- | --- |
| **Painel** (`/`) | Cards de resumo (total, novas, em análise, prazos vencidos), gráfico por mês, distribuição por status, por tipo de comunicação, por cliente e por tribunal, intimações recentes e prazos a acompanhar. |
| **Intimações** (`/intimacoes`) | Lista em cards ou tabela, busca livre (ignora acentos), filtros por intervalo de datas, tipo de comunicação (categoria), status, cliente e tribunal, ordenação, paginação, ações em lote e exportação CSV. |
| **Detalhe** (`/intimacoes/[id]`) | Órgão, data de disponibilização, tipo de comunicação, meio, tipo de documento, classe (tipo de ação), partes com polo, advogados com OAB, inteiro teor, status, prazo e observações. |
| **Nova / Editar** | Formulário validado com seletor de datas, máscara do número CNJ e listas dinâmicas de partes e advogados. |
| **Buscar no Comunica** (`/comunica`) | Pesquisa todos os clientes ativos, um cliente específico ou uma pesquisa avulsa num período; mostra o andamento por cliente, marca o que já está no acervo e importa as novas sem duplicar. |
| **Clientes monitorados** (`/clientes`) | Campo configurável com o que deve ser pesquisado: nome da parte, nome do advogado, número da OAB + UF ou número do processo, com filtro opcional por tribunal. |
| **Prazos e avisos** (`/prazos`) | Avisos de prazo por e-mail, feriados locais e suspensões de prazo do escritório (por tribunal ou para todos), calendário de dias sem contagem e cálculo em lote dos prazos que faltam. |
| **Dados e backup** (`/dados`) | Exportar CSV, backup e restauração em JSON, dados de demonstração e limpeza total. |

### Cálculo de prazos

Ao importar do Comunica, a aplicação procura no texto o número de dias ("no prazo de 15 (quinze) dias")
e calcula o vencimento sozinha; a intimação fica marcada como "lido no texto" até alguém conferir.
A regra está em `lib/prazos/`:

- publicação no primeiro dia útil após a disponibilização no DJEN (Lei 11.419/2006, art. 4º, § 3º);
- contagem a partir do primeiro dia útil seguinte (art. 4º, § 4º, e art. 224 do CPC);
- dias úteis por padrão (CPC, art. 219); dias corridos na matéria penal (CPP, art. 798), prorrogando se vencer sem expediente;
- prazo em dobro opcional (arts. 180, 183 e 186 do CPC);
- pula fins de semana, feriados nacionais, Carnaval, Sexta-feira Santa, o recesso de 20/12 a 20/01 e, na Justiça Federal e tribunais superiores, os dias da Lei 5.010/1966;
- feriados estaduais, municipais e portarias entram quando o escritório os cadastra em `/prazos`.

O calendário só inclui dias sem expediente em todo o país: um feriado a mais empurraria o vencimento para
depois do real, enquanto um a menos apenas o antecipa.

### Avisos de prazo por e-mail

Em **Prazos e avisos** cada conta liga os avisos e escolhe com quantos dias úteis de antecedência
(5, 3, 2, 1 ou no dia) e a partir de que hora. O servidor confere de hora em hora e manda **um**
e-mail por dia, só quando há prazo chegando, para o e-mail da conta. Cada prazo vem com o botão
**Já cumpri**: o link abre uma página que mostra a intimação e, com um clique, a marca como
"Respondida" (o clique é exigido para que leitores de e-mail que abrem links sozinhos não marquem
nada). O link é assinado e vale 30 dias; o segredo vem de `LINKS_SECRET` ou é gerado e guardado em
`DATA_DIR/segredo-links`. Os avisos vêm desligados até a conta ligá-los.

Os dados de cada usuário ficam no servidor, em `DATA_DIR/espacos/<id-do-usuário>.json`.
Na primeira vez que você entrar num navegador que tinha dados da Versão 1 (localStorage),
a aplicação oferece importá-los para a sua conta.

### Resumo em duas linhas

Com `ANTHROPIC_API_KEY` configurada, cada intimação ganha um resumo de duas linhas: o que o juízo decidiu e o que o advogado precisa fazer (ou "Sem providência: apenas ciência."). As que a busca automática traz já chegam resumidas; as demais têm o botão **Resumir** no detalhe e **Resumir as desta página** na lista (até 30 pedidos por hora por conta).

- Sem a chave, nada muda: os botões não aparecem e a lista mostra o começo do texto.
- Com a chave, o texto da intimação vai para a API da Anthropic. Avise os clientes do escritório se o contrato pedir.
- O modelo padrão é `claude-opus-5-5` (troque com `ANTHROPIC_MODEL`). O pedido usa o *fallback* do lado do servidor da Anthropic: se o modelo estiver sobrecarregado, outro modelo da mesma família responde, em vez de dar erro.
- Se o texto da intimação for editado, o resumo antigo é apagado.

### Prazos na Google Agenda

Em **Prazos e avisos**, o botão **Conectar** leva à tela de consentimento do Google. Depois disso, cada prazo em aberto vira um evento de dia inteiro numa agenda separada, "Prazos · Clepsa", com lembrete às 9h do dia anterior. Quando o prazo muda, o evento muda; quando a intimação é respondida, arquivada ou excluída, o evento sai. A agenda é atualizada alguns segundos depois de cada alteração na tela e, de hora em hora, para o que chegou pela busca automática ou pelo link do e-mail.

- O Clepsa pede só a permissão `calendar.app.created`: ele cria a própria agenda e não enxerga os outros compromissos do usuário.
- O evento leva processo, cliente, órgão, responsável, o resumo (se houver) e o link para o Clepsa. O inteiro teor não vai para o Google.
- O acesso fica guardado cifrado (AES-256-GCM) no servidor. **Desconectar** revoga o acesso no Google; a agenda continua lá e pode ser apagada pelo próprio usuário.
- Para ligar: crie no Google Cloud um ID do cliente OAuth do tipo "Aplicativo da Web", ative a Google Calendar API, cadastre `<APP_URL>/api/google/retorno` como URI de redirecionamento e defina `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Enquanto o app estiver em modo de teste no Google, só os e-mails cadastrados como testadores conseguem conectar.

### Equipe e responsáveis

Em **Equipe** você cadastra quem trabalha no escritório. Cada intimação pode ser entregue a uma pessoa no detalhe dela, ou várias de uma vez pela lista (selecione e use **Entregar a…**). A mesma página mostra o painel por pessoa: quantas intimações estão em aberto, vencidas, vencendo nos próximos 3 dias úteis e sem prazo, com as próximas a vencer. A lista de intimações filtra por responsável e as exportações ganharam as colunas "Responsável" e "Resumo".

Por enquanto a equipe é uma lista de nomes dentro da conta: as pessoas não entram no Clepsa com login próprio. Isso muda quando o banco por escritório (Fase 1) estiver no ar.

### Clientes e portal

Em **Clientes e portal**, aba **Relatório do período** (ou pelo atalho "Relatório" em cada cliente monitorado), escolha o cliente e o período: mês passado, este mês, últimos 30 dias ou datas livres. O relatório mostra quantas intimações saíram e em quantos processos, o que já teve providência, os prazos vencidos e os próximos, e cada intimação com o resumo (ou o começo do texto). **Gerar PDF** abre a versão para imprimir ou salvar em PDF; **Copiar para e-mail** copia um texto curto para colar na mensagem ao cliente. Observações internas, o responsável e os prazos vencidos ficam de fora do que vai ao cliente, a menos que você marque para incluir (na tela, os vencidos sempre aparecem para o escritório).

### Ferramentas de IA (inspiradas na Legora)

Todas usam a API da Anthropic (`ANTHROPIC_API_KEY`); sem a chave, as telas continuam e só os botões de IA somem. Os dados ficam numa tabela só, `escritorio_registros` (migração 0014), com RLS por escritório, por processo (particular segue o processo) e por pessoa (registros pessoais). Cada conta tem um teto diário de chamadas de IA.

| Onde | O que faz |
| --- | --- |
| **Biblioteca → Padrões da IA** | Instruções do escritório (ou só suas) que a IA segue sempre: no parecer, na análise de risco, na tabela, no assistente etc. Há modelos prontos para adotar. |
| **Biblioteca → Pesquisa com IA** | Pergunta jurídica respondida só com fontes oficiais (planalto.gov.br, STF, STJ, TST, CNJ…), cada uma com link; dá para guardar na biblioteca. |
| **Biblioteca → Monitor de precedentes** | Temas acompanhados; a ronda pesquisa novidades (súmulas, temas, leis) na frequência escolhida e mostra o impacto nos processos. |
| **Processo → Linha do tempo** | Substitui a antiga aba Andamentos: junta andamentos do DataJud, intimações, fatos com data tirados dos PDFs (com página), e-mails e anotações coladas (com resumo da IA) e marcos do escritório. Recados podem ir ao portal do cliente. |
| **Processo → Providências** | Lista do que fazer, com prazo e responsável; a IA sugere a partir dos PDFs, sempre com a página, e só vale depois de confirmada. As pendentes aparecem em **Hoje**. |
| **Processo → Assistente (IA)** | Pedido em linguagem comum vira um plano com as ferramentas do Clepsa; executa passo a passo (um pedido HTTP por passo) e no fim revisa se o pedido foi atendido. Nada sai do escritório sozinho. |
| **Processo → Parecer** | Verificador de citações (súmula, tema, precedente, artigo) contra a biblioteca e as fontes oficiais; IA no editor (revisar, melhorar, anonimizar com aceitar/recusar cada troca, traduzir); **Baixar Word**. |
| **Processos → Revisão em tabela** | Mesmas perguntas para vários processos: a IA preenche linha a linha com a página de onde tirou; células editáveis, conferidas e travadas; pergunta livre à tabela; planilha CSV. |
| **Fluxos de IA** (`/fluxos`) | Receita de passos montada uma vez (pedido à IA, revisão em tabela, pesquisa em fontes oficiais, itens da Biblioteca, verificação de citações, tradução) e rodada com um clique em um ou vários processos. Cada passo recebe o que os anteriores produziram; a tela mostra o andamento (uma chamada HTTP por passo, ou por alguns processos da tabela) e o último texto vira o relatório, que dá para copiar, baixar em Word ou salvar como parecer. Rascunho só quem criou vê; publicado vale para o escritório; execuções são pessoais. |
| **Pedidos** | Caixa de entrada do formulário público de atendimento (`/pedido/<token>`, com isca contra robôs, consentimento LGPD e limite por IP), das mensagens do portal e de contatos anotados; triagem da IA, rascunho de resposta e "Virar caso". |
| **Clientes e portal → Portal do cliente** | Link secreto com validade (`/portal/<token>`) para o cliente ver fase, andamentos, recados e os PDFs escolhidos, e mandar mensagens. Só o hash do token é guardado. |
| **/seguranca** | Página pública de segurança e LGPD. |

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

### Administração da plataforma

Contas marcadas como **administrador** veem o item **Administração** no menu (`/administracao`): a lista de todas as contas da Clepsa, de todos os escritórios, com o escritório e o papel de cada uma, a situação (ativa, desativada, e-mail não confirmado, bloqueada por senhas erradas) e se usa verificação em duas etapas. Dali o administrador:

- **desativa** uma conta: ela sai na hora de todos os dispositivos, não consegue mais entrar e as rotinas automáticas dela (busca no Comunica, avisos, Agenda, DataJud) param. Nenhum dado é apagado;
- **reativa** a conta;
- **torna administrador** outra conta, ou retira esse papel.

Ninguém altera a própria conta por ali (assim não dá para se trancar fora). Cada alteração fica no registro de atividade da conta alterada, com o nome de quem fez.

Contas comuns não têm esse acesso, e a permissão não depende de esconder o menu: a API (`/api/admin/…`) recusa quem não é administrador, o serviço relê o cadastro a cada pedido e, no Postgres, o próprio banco só libera a leitura de escritórios e membros de outros escritórios para um administrador ativo (políticas de RLS da migração 0009). Mesmo o administrador não lê as intimações nem os processos dos outros escritórios.

O primeiro administrador é criado pela linha de comando (com `DATABASE_URL` definida, ou sobre `.data/` sem ela):

```bash
npm run admin:promover -- pessoa@escritorio.com.br            # concede
npm run admin:promover -- pessoa@escritorio.com.br --retirar  # retira
```

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
As chamadas se identificam como `Clepsa/2.0` no `User-Agent`, sem imitar o site oficial.

### Busca automática por OAB e processo

Os clientes monitorados por **número de OAB** ou **número de processo** são pesquisados pelo
próprio servidor, sem ninguém abrir a tela: na primeira vez, os últimos 7 dias; depois, do último
dia já coberto até hoje. As novas entram no acervo como "Nova", sem duplicar e já com o prazo
calculado. Cada cartão em **Clientes monitorados** mostra quando a última busca rodou e se deu
erro, e o botão **Buscar OAB e processos agora** roda na hora para a sua conta.

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `RONDA_COMUNICA` | `ligada` em produção, `desligada` em dev | Liga ou desliga a busca dentro do servidor. |
| `RONDA_COMUNICA_INTERVALO_HORAS` | `6` | Intervalo entre as buscas. |
| `RONDA_TOKEN` | (vazio) | Libera `POST /api/rondas/comunica`, `/avisos`, `/datajud` e `/monitores` com `Authorization: Bearer <token>`, para um agendador externo. |

Se o servidor ficar desligado, a busca seguinte cobre os dias que faltaram
(até 30 dias para trás). Se a tela estiver aberta enquanto a busca grava, as duas versões são
mescladas: nada que você editou se perde.

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
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test   # inclui o Postgres
npm run typecheck
npm run lint
npm run build
```

Com `TEST_DATABASE_URL`, a suíte também roda contra o Postgres (cada arquivo de teste cria e
apaga o próprio banco), incluindo o teste de vazamento entre escritórios.

O GitHub Actions (`.github/workflows/ci.yml`) roda esses quatro passos em todo PR e no
`main`, com um Postgres 16 de teste, mais a auditoria de dependências (`npm audit`), que bloqueia o merge quando há
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
drizzle/              migrações do PostgreSQL (geradas a partir de server/infra/postgres/schema.ts)
scripts/              migrar o banco e importar os dados de .data/
.github/workflows/    CI
```
