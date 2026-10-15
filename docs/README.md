# Documentação

Este diretório guarda o que não cabe no código: decisões, conhecimento sobre as fontes de
dados e procedimentos de segurança. O roteiro da versão 4 (Sentinela) é feito em fases, com
aprovação entre elas; cada decisão relevante vira um registro curto em `decisoes/`.

| Pasta | Conteúdo |
| --- | --- |
| [`decisoes/`](decisoes/) | Registros de decisão (o que foi decidido, por quê e o que fica em aberto). |
| [`fontes/`](fontes/) | O que se sabe sobre cada fonte de comunicações (hoje, só o DJEN). |
| [`seguranca/`](seguranca/) | Runbook de incidente, [mudanças seguras](seguranca/mudancas-seguras.md) e [backup e restauração](seguranca/backup-e-restauracao.md). |

## Fases da versão 4

| Fase | Tema | Estado |
| --- | --- | --- |
| 0 | Fundação: repositório único, CI, documentação | concluída |
| 1 | Postgres com isolamento por escritório (RLS) | concluída (migrações 0000 a 0007 no Supabase) |
| 2 | Adaptador de fonte e livro de cobertura | em andamento |
| 3 | Rondas, alertas e monitoramentos combináveis | parcial: ronda automática e avisos por e-mail prontos; monitoramento combinado e alerta de ronda parada faltam |
| 4 | Motor de prazos e processos sigilosos | parcial: cálculo de prazos com calendário forense pronto; processos sigilosos faltam |
| 5 | Caixa de entrada e Mesa de Prazo | não iniciada |
| 6 | Sugestão de prazo assistida por IA | não iniciada (o prazo é sugerido por regras; a IA hoje só resume e analisa risco) |

Fora do roteiro original, já no `main`: processos com PDFs, pareceres com versões, análise de
risco por IA (ver [decisão 0007](decisoes/0007-analise-de-risco-por-ia.md)) e andamentos pelo
DataJud.

## Perguntas em aberto

| Pergunta | Necessária antes da |
| --- | --- |
| Hospedagem do app e do worker (o banco já está decidido: Supabase em São Paulo) | Fase 3 |
| Quais tribunais priorizar no calendário forense do piloto | Fase 4 |
| Quem valida o conjunto dourado de prazos (advogado ou advogada) | Fase 4 |
| O escritório-piloto autoriza IA sobre os textos? Em quais condições? | Fase 6 |
| Limiar mínimo de acerto da IA para exibir sugestões | Fase 6 |
