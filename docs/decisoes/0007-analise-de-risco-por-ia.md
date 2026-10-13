# 0007 · Análise de risco do processo pela IA

*13/10/2026 · aceita · fora das fases (registrada depois de entrar no `main`, PR #19)*

## Contexto

O escritório quer uma leitura prévia do risco de cada processo a partir dos PDFs anexados,
sem substituir o parecer do advogado. É a primeira vez que o Clepsa manda documentos do
processo para um modelo de IA.

## Decisão

- **Modelo:** Claude, pela API da Anthropic (`server/processos/analisador-claude.ts`), com a
  mesma `ANTHROPIC_API_KEY` dos resumos. `ANTHROPIC_MODEL` troca o modelo. Sem a chave, a aba
  de risco fica desligada.
- **O modelo lê os PDFs direto** (inclusive digitalizados) e responde num esquema fixo: nível
  (`baixo`, `medio`, `alto` ou `indeterminado`), justificativa curta e até 6 pontos fortes e 6
  fracos.
- **Todo ponto cita documento e página.** Ponto sem apoio numa página não entra. Quando os
  documentos não bastam, o nível é `indeterminado`, nunca um palpite.
- **Histórico imutável:** tabela `processo_analises` (migração 0006), RLS forçado por
  escritório; o app só pode `SELECT` e `INSERT`. Cada análise guarda o modelo usado e quem pediu.
  As análises somem só junto com o processo.

## Consequências

- O texto dos PDFs sai do servidor para a Anthropic a cada análise. O escritório precisa estar
  de acordo (é a mesma pergunta em aberto da Fase 6).
- Ainda não foi testada contra a API real; o primeiro teste será no servidor, com a chave.
- Não é a "sugestão de prazo por IA" da Fase 6, que continua não iniciada.
