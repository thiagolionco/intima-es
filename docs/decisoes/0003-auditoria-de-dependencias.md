# 0003 · Auditoria de dependências como aviso até a troca para o Next 15

*10/10/2026 · aceita, temporária*

## Contexto

Em 10/10/2026, `npm audit --omit=dev` acusou 1 falha crítica e 2 altas, todas no Next
14.2.33 (negação de serviço em Server Components, envenenamento de cache, SSRF em Server
Actions, entre outras). Não há correção na linha 14; a correção exige Next 15 ou superior,
o que muda APIs usadas pelo app inteiro.

## Decisão

- Na Fase 0, o CI roda a auditoria num job separado que **não bloqueia** o merge
  (o passo do `npm audit` usa `continue-on-error` e, se falhar, o job emite um aviso no
  resumo do CI), para o resultado ficar visível em todo PR sem deixar o PR vermelho.
- A troca para o Next 15 é um passo próprio, depois da Fase 0 e antes da Fase 1.
- Depois da troca, o job passa a bloquear (`--audit-level=high`) e este registro é substituído.

## Consequências

Até a troca, o app não deve ser exposto na internet com dados reais sem considerar esses
riscos. Uso local continua aceitável.
