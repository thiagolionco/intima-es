# 0004 · Hospedagem (pendente)

*10/10/2026 · em aberto; precisa estar decidida antes da Fase 1*

## Contexto

- O Comunica PJe recusa acessos de fora do Brasil: o servidor precisa estar no Brasil.
- A Fase 1 traz PostgreSQL 16 com Row-Level Security; a Fase 3 traz um worker separado
  (pg-boss) que precisa ficar ligado o tempo todo para as rondas agendadas.
- Os dados incluem dados pessoais (LGPD): manter tudo em região brasileira simplifica.
- O repositório já tem `Dockerfile` e `fly.toml` para Fly.io na região `gru` (São Paulo).

## Recomendação atual

Fly.io em São Paulo para o app e o worker, com o Postgres também em São Paulo (no próprio
Fly.io ou num serviço gerenciado com região `sa-east-1`). A decisão final cabe ao dono
do projeto.

## Atenção

O `fly.toml` atual desliga a máquina quando ninguém usa (`min_machines_running = 0`).
Isso é incompatível com as rondas agendadas da Fase 3 e terá de mudar.
