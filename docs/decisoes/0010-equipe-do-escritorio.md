# 0010 · Equipe do escritório: convites, papéis e processos particulares

*15/10/2026 · proposta · migração 0011 (ainda não aplicada no Supabase)*

## Contexto

Os dados já eram do escritório (decisão 0006), mas todo cadastro criava um escritório novo, com
uma pessoa só. Não havia como vários advogados trabalharem no mesmo acervo, cada um com o seu
login. A "Equipe" era só uma lista de nomes para o campo Responsável, sem acesso ao Clepsa.
Também foi pedido que um advogado possa guardar processos particulares, que o escritório não vê.

## Decisão

- **Convite por e-mail.** O dono convida (e-mail e papel). O link (`/convite#token=…`, válido
  por 7 dias, uso único, só o hash fica no banco, tabela `convites`) leva a:
  - quem não tem conta: cria a conta já dentro do escritório; o link confirma o e-mail;
  - quem tem conta: entra nela e aceita. Se ela estava sozinha num escritório próprio **vazio**,
    esse escritório some; se ele tem dados, o aceite é recusado (nada se mistura nem se perde).
- **Papéis** (`membros.papel`): `dono` (tudo, inclusive a equipe), `advogado` (tudo menos a
  equipe), `estagiario` (trabalha, mas não exclui intimações, processos nem PDFs). Conferido no
  servidor a cada gravação (`lib/escritorio.ts`, `EscritorioService.exigir`). O escritório nunca
  fica sem dono: não dá para rebaixar, tirar ou excluir a conta do último dono enquanto houver
  outras pessoas.
- **Pessoa da equipe ligada à conta.** `PessoaEquipe.usuarioId` liga o nome da lista à conta
  (no aceite, pela pessoa indicada no convite, pelo e-mail ou criando uma). Os avisos de prazo
  passam a ir para o responsável com conta; o que não tem responsável, ou é de alguém sem
  acesso, vai para os donos (num escritório de uma pessoa, isso é tudo, como antes).
- **Saída.** Quem sai (ou é tirado) recomeça num escritório próprio e vazio, e fica inativo na
  lista da equipe, para o histórico das intimações.
- **Processo particular** (`processos.particular_de`): política RLS *restritiva* nova, que soma
  às que existem: só a conta dona do processo o vê. PDFs, pareceres, análises e andamentos
  seguem o processo (políticas restritivas com `EXISTS` em `processos`). Qualquer um cria um
  processo particular; tornar particular um processo que já é do escritório é só para o dono.
  Se a conta for excluída, os particulares dela vão junto.
- **Rotinas automáticas:** a ronda do Comunica passa uma vez por escritório, não por conta.

## Consequências

- A migração 0011 só acrescenta (tabela, coluna e políticas novas); não altera nem apaga nada.
  Vale a regra de mudanças seguras: aplicar só pela porta segura, com backup conferido.
- As intimações continuam num espaço único por escritório: ligadas a um processo particular,
  elas seguem visíveis para o escritório (só o processo e o que pende dele ficam reservados).
- Sem banco (arquivos JSON), cada conta segue sendo um escritório de uma pessoa só, e convites
  ficam indisponíveis.
- A Central de casos (PR #30) cria tabelas que pendem de `processos`: elas precisam de uma
  política restritiva igual às desta migração para respeitar os particulares.
