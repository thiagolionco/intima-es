# Formato do arquivo do robô do CPJ

O robô lê o banco do CPJ (somente leitura) e grava **um arquivo JSON** (uma lista) ou **JSONL** (um registro por linha)
com este formato. O arquivo fica no seu computador. Quem anonimiza de verdade é o script `validar`; o robô pode
mandar os nomes em `nomes` só para ele saber o que esconder (esse campo **não** vai para o arquivo limpo).

## Um registro

```json
{
  "id": "a1b2c3",
  "processo": "hash-do-numero-do-processo",
  "publicacao": {
    "texto": "Vistos. Manifeste-se a parte autora sobre a contestação, no prazo de 15 dias.",
    "tribunal": "TJPR",
    "classe": "Procedimento Comum Cível",
    "orgao": "3ª Vara Cível de Curitiba",
    "tipoDocumento": "Despacho",
    "tipoComunicacao": "Intimação",
    "dataDisponibilizacao": "2026-11-03"
  },
  "cliente": { "lado": "reu", "tipo": "seguradora" },
  "nomes": ["MARIA APARECIDA SOUZA", "Seguradora Exemplo S.A.", "João Pereira Lima"],
  "decisao": {
    "evento": "Intimação para manifestar sobre contestação",
    "tarefa": "replica",
    "dias": 15,
    "contagem": "uteis",
    "dobro": false
  },
  "situacao": "validada"
}
```

## Campos

| Campo | Obrigatório | O que é |
|---|---|---|
| `id` | sim | Um código qualquer, sem significado (não use o número do processo). |
| `processo` | recomendado | O número do processo **embaralhado** (hash com um sal que só você conhece). Serve para o mesmo processo não cair no treino e no teste. |
| `publicacao.texto` | sim | O inteiro teor da publicação. |
| `publicacao.*` | sim, exceto `orgao`/`classe` | Tribunal, tipo de documento, tipo de comunicação, data (AAAA-MM-DD). |
| `cliente.lado` | sim | `autor`, `reu`, `terceiro` ou `desconhecido`. É o dado novo que o Clepsa não tem hoje. |
| `cliente.tipo` | não | Por exemplo `banco`, `seguradora`, `segurado`. |
| `nomes` | recomendado | Partes, advogados, segurado: tudo que deve ser escondido no texto. |
| `decisao.evento` | para o treino de eventos | O evento que o advogado lançou no CPJ, com o nome que o escritório usa. |
| `decisao.tarefa` | para o treino de prazos | Uma destas: `audiencia`, `contrarrazoar`, `replica`, `contestar`, `emendar`, `pagar`, `pericia`, `alegacoes_finais`, `especificar_provas`, `custas`, `avaliar_recurso`, `juntar_documentos`, `manifestar`, `ciencia`, `analisar`. |
| `decisao.dias` | para prazos | Dias do prazo **simples** (sem dobrar). 0 quando não há prazo. |
| `decisao.contagem` | para prazos | `uteis` ou `corridos`. |
| `decisao.dobro` | não | `true` se o prazo foi em dobro. |
| `decisao.audiencia` | só audiência | `{ "data": "AAAA-MM-DD", "hora": "HH:MM" }`. |
| `situacao` | sim | Só `validada` entra. `descartada`, `pendente` etc. ficam de fora. |

Se o CPJ só tem o evento e o prazo, e não a "tarefa" do Clepsa, mande só `evento` (e `dias`, `contagem`).
O treino de eventos funciona assim. O de prazos precisa de `tarefa`: o robô pode converter o evento em tarefa com uma tabela
simples de correspondência que você mesmo monta (uma vez só).

## O que o script faz

1. **validar:** confere o formato, deixa só as `validada`, tira duplicadas (mesmo texto, ignorando números), esconde
   nomes, CPF, CNPJ, processo, OAB, e-mail, telefone, **apólice, sinistro, proposta, endosso, placa e chassi**, e escreve
   `treino/cpj/relatorio.txt` com 20 textos para você olhar.
2. **montar:** cria os exemplos de treino de **prazos** e de **eventos**. O processo é dividido por inteiro entre treino (80%),
   validação (10%) e teste (10%). Cada exemplo de prazo ainda passa pelo conferente do Clepsa; o que contradiz o texto
   (por exemplo, dias diferentes dos escritos) fica de fora e aparece na lista.

## Duas observações

- O treino de prazos traz a linha **"Lado do nosso cliente"** no pedido. O Agente de Prazos em produção ainda não manda essa linha.
  Antes de usar um modelo treinado assim, o Clepsa precisa descobrir o lado do cliente (autor/réu) e informá-lo.
- Na dúvida, o robô deve preferir **deixar de fora** (`situacao` diferente de `validada`) a mandar um dado incerto.

## Extrato real do CPJ3 (07/11/2026)

O importador também lê direto o extrato do robô, sem converter:

- `situacao`: `Concluído` vale como validada; `Pendente` e `Cancelado` ficam de fora.
- `decisao.eventos_lancados[]`: se o evento escolhido só aparece como `Cancelado`, o registro sai (lançamento desfeito).
- Eventos de rotina (`CI`, `CIEN`, `CNP`, `ATC`, `PMG`, `PMGC`, `CAJU`) saem.
- `cliente.lado`: `passivo` vira réu; `Terceiro Interessado` e `Terceiro Garantidor` viram terceiro.
- `tribunal`: o sufixo `DJN` é cortado (`TJSCDJN` = `TJSC`).
- Neste extrato `tarefa` é a própria sigla do evento e `contagem`/`dobro` vêm vazios, então ele serve ao treino de **eventos**; o de prazos fica sem exemplos até existir uma tabela evento → tarefa do Clepsa.
