# 0004 · Hospedagem: banco no Supabase em São Paulo; app ainda em aberto

*10/10/2026 · banco decidido · hospedagem do app em aberto*

## Contexto

- O Comunica PJe recusa acessos de fora do Brasil: o servidor do app precisa estar no Brasil.
- A Fase 1 traz PostgreSQL com Row-Level Security; a Fase 3 traz um worker separado
  (pg-boss) que precisa ficar ligado o tempo todo para as rondas agendadas.
- Os dados incluem dados pessoais (LGPD): manter tudo em região brasileira simplifica.

## Decisão

- **Banco:** Supabase (PostgreSQL gerenciado), projeto na região **São Paulo (sa-east-1)**.
  Escolhido pelo dono do projeto em 10/10/2026.
- **App e worker:** ainda em aberto. O dono pediu para deixar o Fly.io de lado por enquanto.
  O `Dockerfile` e o `fly.toml` continuam no repositório, sem uso.

## Pontos de atenção para quando o app for hospedado

- O app precisa rodar no Brasil (por causa do Comunica PJe) e perto do banco.
- O worker da Fase 3 não pode desligar quando ninguém usa o app.
- Conexão com o Supabase: ver [0006](0006-postgres-e-rls.md).
