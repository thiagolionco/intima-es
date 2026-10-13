# 0004 · Hospedagem: banco no Supabase em São Paulo; app na Vercel para testes

*10/10/2026 · banco decidido · 13/10/2026: app na Vercel (São Paulo) para a fase de testes*

## Contexto

- O Comunica PJe recusa acessos de fora do Brasil: o servidor do app precisa estar no Brasil.
- A Fase 1 traz PostgreSQL com Row-Level Security; a Fase 3 traz um worker separado
  (pg-boss) que precisa ficar ligado o tempo todo para as rondas agendadas.
- Os dados incluem dados pessoais (LGPD): manter tudo em região brasileira simplifica.

## Decisão

- **Banco:** Supabase (PostgreSQL gerenciado), projeto na região **São Paulo (sa-east-1)**.
  Escolhido pelo dono do projeto em 10/10/2026.
- **App, para testes (13/10/2026):** Vercel, com as funções na região **gru1 (São Paulo)**
  (`vercel.json`), ao lado do banco e dentro do Brasil, como o Comunica exige.
  - Na Vercel o servidor não fica ligado, então o agendador interno (`instrumentation.ts`) não
    roda ali. As rondas vêm do GitHub Actions (`.github/workflows/rondas.yml`), que chama
    `/api/rondas/*` com `RONDA_TOKEN`: avisos de hora em hora, Comunica e DataJud a cada 6 horas.
  - Plano grátis: uso não comercial e no máximo 300 s por execução (por isso nenhuma rota pede
    mais que isso). Para o uso real do escritório: plano Pro ou o Fly.io (`Dockerfile` e
    `fly.toml` continuam no repositório).
  - O limitador de tentativas de login é em memória e não é compartilhado entre instâncias.

## Pontos de atenção para quando o app for hospedado

- O app precisa rodar no Brasil (por causa do Comunica PJe) e perto do banco.
- O worker da Fase 3 não pode desligar quando ninguém usa o app.
- Conexão com o Supabase: ver [0006](0006-postgres-e-rls.md).
