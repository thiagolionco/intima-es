# 0001 · O GitHub é a cópia oficial

*10/10/2026 · aceita*

## Contexto

Havia três lugares com o projeto, nenhum deles com o histórico completo:

- `C:\Users\Thiago\projetointimações`: versão 1, sem git (igual ao `main` de então).
- `C:\Users\Thiago\projetointimações-v2`: versão 2 com a tela de entrada, sem git.
  Idêntica, arquivo por arquivo, ao ramo do PR #3; só o `package-lock.json` diferia,
  regenerado por um `npm install` local.
- O repositório `thiagolionco/intima-es`, com o `main` na versão 1 e a versão 2 espalhada
  em três PRs abertos (#1 versão 2, #3 tela de entrada, #2 hospedagem no Fly.io).

## Decisão

- Os PRs #3 e #2 foram juntados ao ramo do #1, e o #1 ao `main`, com merge commits
  (histórico preservado). Antes, a combinação passou por typecheck, lint, 45 testes e build.
- O `main` do GitHub passa a ser a única fonte da verdade. A versão 4 (Sentinela) parte dele.
- As pastas locais deixam de ser editadas. A pasta `projetointimações-v2` é substituída por
  um clone do repositório, levando junto a pasta `.data/` (dados reais, fora do git).
  As pastas antigas ficam arquivadas, não apagadas.

## Consequências

- Toda mudança chega por PR, com CI.
- A pasta `.data/` nunca entra no git (`.gitignore`); backup dela é responsabilidade de quem
  roda o app até a Fase 1 levar os dados para o Postgres.
