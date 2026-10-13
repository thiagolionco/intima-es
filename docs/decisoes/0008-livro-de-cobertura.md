# 0008 · Livro de cobertura e Selo de Vigília

*13/10/2026 · aceita · Fase 2*

## Contexto

A ronda guardava só até que dia a busca tinha ido (`ultimaRonda.ate`). Se o Comunica falhasse,
as telas mostravam "nenhuma intimação" sem dizer que o dia não tinha sido verificado. Para um
escritório, um falso "nada novo" é o pior erro possível: é assim que se perde prazo.

## Decisão

- **Unidade: termo × dia de disponibilização.** A ronda consulta por termo (OAB ou processo),
  não por tribunal; o tribunal só existe como filtro opcional do termo.
- **Tabela `registro_cobertura`** (migração 0008), chave (escritório, termo, dia), RLS forçado
  no mesmo molde das tabelas do escritório. `termo_id` é texto porque os termos vivem no JSON de
  `espacos_trabalho`. Dias com mais de 90 dias são podados pelo próprio app.
- **A busca informa como terminou cada janela** (completa, parcial, falhou); dias que ela não
  alcançou ficam `NAO_VERIFICADO`. Um dia verificado não é rebaixado por uma repetição que falhe.
- **Lacuna** é qualquer dia, entre o primeiro registrado e o da última ronda (até 30 dias), sem
  estado verificado. A ronda seguinte repete o período porque a data do termo não avança.
- **Selo de Vigília** na barra lateral e faixa de aviso nas listas. Ícone, texto e cor juntos.
  "Vigília parada" quando passam duas vezes o intervalo sem ronda.
- **Verificação de eco** no cliente do Comunica: resposta que não bate com o pedido, ou com
  `count` perto de 10.000, vira erro.

## Consequências

- A migração 0008 precisa ser aplicada no Supabase (e registrada em `drizzle.__drizzle_migrations`).
- O alerta de "vigília parada" só aparece para quem abre o app. Avisar fora do app é o Passo 3.
- O teste de contrato com a API real continua pendente (precisa rodar do Brasil).
