# Fonte: DJEN (Comunica PJe)

API pública do Diário de Justiça Eletrônico Nacional:
`https://comunicaapi.pje.jus.br/api/v1/comunicacao` (configurável em `COMUNICA_API_URL`).

> **Estado deste documento:** os fatos abaixo vêm de um ensaio feito em 10/2026, fora deste
> repositório. **Nenhum foi reconfirmado ainda.** A reconfirmação, com teste de contrato
> chamando a API real, faz parte da Fase 2. O ambiente de nuvem usado no desenvolvimento
> não alcança a API (bloqueio de rede), então o teste precisa rodar a partir do Brasil.

## Fatos relatados (a reconfirmar)

1. **Filtros combinam como E.** OAB + nome do advogado correto devolve o mesmo conjunto da
   OAB; OAB + nome errado devolve zero; OAB + tribunal errado devolve zero.
2. **Parâmetro desconhecido é ignorado em silêncio**: resposta 200 com tudo, até o teto de
   10.000 itens. Por isso, `count` perto de 10.000 significa "consulta ampla demais".
3. **Parâmetros que filtram:** `numeroProcesso`, `numeroOab` + `ufOab`, `nomeAdvogado`,
   `nomeParte`, `siglaTribunal`, `dataDisponibilizacaoInicio`/`Fim`, `meio` e `texto`
   (busca por conteúdo).
4. **Não há filtro por CPF/CNPJ nem por assunto** (`cpf`, `cnpj`, `documento`, `assunto` e
   variações foram ignorados). Só `texto` aproxima, e o documento raramente aparece no corpo.
5. **Processos sigilosos:** sem campo de sigilo e sem conteúdo. O item chega com texto-padrão
   ("Processo sigiloso. Para visualização do documento, consulte os autos digitais"), mas com
   processo, órgão, classe, destinatário e advogados. Amostra: 7 em 100 itens do TJSP.
6. Cada item traz `status`, `ativo` e `motivo_cancelamento`: comunicações podem ser canceladas.

## Fatos observados no uso do app (versão 2)

- Acessos de fora do Brasil são recusados.
- Consultas pesadas (ex.: nome de grande litigante num período longo) dão timeout ou
  `500 {"message":"O sistema está muito ocupado..."}`. O app divide o período em janelas
  (7 dias, depois dia a dia) e repete após 3 s e 8 s (`server/comunica/busca.ts`).
- A API responde `429` quando há consultas demais; o app pede para aguardar.
- Paginação com `pagina` e `itensPorPagina` (100 por página).

## Como o app consulta hoje

A busca da tela (`app/api/comunica/route.ts`) e a ronda automática (`server/rondas/ronda-comunica.ts`)
usam o mesmo cliente, `server/comunica/cliente.ts`, que envia **um** critério por consulta
(`montarParametros` em `lib/comunica.ts`), mais tribunal e período opcionais.

Cabeçalhos enviados: `Accept: application/json` e `User-Agent: Clepsa/2.0 (+APP_URL)`.
Os cabeçalhos `Origin` e `Referer` que imitavam o site oficial foram removidos. Se o acesso
quebrar sem eles, o trabalho para e o problema é reportado; não se contorna.

**Verificação de eco** (`conferirEco` em `lib/comunica.ts`, aplicada em `server/comunica/cliente.ts`):
cada resposta é conferida contra o que foi pedido. Se um item vier de outro processo, de outro
tribunal ou de fora do período, ou se o `count` estiver perto do teto de 10.000 (sinal de filtro
ignorado), a resposta inteira é recusada como erro. Nada é descartado em silêncio. A conferência
por OAB e por nome ainda não é feita: depende do teste de contrato confirmar como esses campos voltam.

## Ronda automática

O servidor procura sozinho as comunicações dos clientes monitorados por **número de OAB** e
**número de processo** que estiverem ativos. Buscas por nome de parte ou de advogado continuam
manuais, porque são lentas no Comunica. Cada termo guarda até que dia já foi consultado
(`ultimaRonda.ate`); a ronda seguinte repete o último dia e vai até hoje (no máximo 30 dias para
trás). Detalhes de agendamento no README.

### Livro de cobertura

Cada ronda grava, por termo e por dia de disponibilização, se o dia foi verificado
(tabela `registro_cobertura`, migração 0008; sem banco, em `DATA_DIR`). Estados:
`VERIFICADO_COM_RESULTADOS`, `VERIFICADO_SEM_RESULTADOS`, `PARCIAL`, `FALHOU` e
`NAO_VERIFICADO`. Um dia já verificado não volta a ser lacuna se uma repetição falhar.
Enquanto houver lacuna, a data do termo não avança e a ronda seguinte repete o período.

O **Selo de Vigília** (barra lateral) e a faixa de aviso no Painel, em Intimações e em Clientes
monitorados mostram a última ronda e os dias sem verificação dos últimos 30 dias. "Nenhum prazo
pendente" só aparece sem ressalva quando todos os dias foram verificados.

Pendente: teste de contrato contra a API real, rodando de uma máquina no Brasil.

## Termos de uso e limites

Ainda não levantados. Pendências para a Fase 2:

- Localizar termos de uso ou política de acesso publicados pelo CNJ para a API.
- Descobrir limite de taxa documentado, se houver (hoje só se sabe que existe o `429`).
- Registrar aqui um contato para o `User-Agent`.
