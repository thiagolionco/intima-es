# Controle de Intimações (Comunica PJe)

Aplicação web em Next.js 14 para acompanhar as intimações publicadas no
[Comunica PJe](https://comunica.pje.jus.br/) (Diário de Justiça Eletrônico Nacional)
para uma carteira de clientes.

## Requisitos

- Node.js 18.18 ou superior (para rodar os testes automatizados: Node 22.6+)
- npm

## Como executar

```bash
npm install
npm run dev          # http://localhost:3000
```

Para produção:

```bash
npm run build
npm start
```

Não é preciso nenhuma variável de ambiente. Opcionalmente, copie `.env.example`
para `.env.local` para trocar a URL da API do Comunica.

## Funcionalidades

| Página | O que faz |
| --- | --- |
| **Painel** (`/`) | Cards de resumo (total, novas, em análise, prazos vencidos), gráfico por mês, distribuição por status, por tipo de comunicação, por cliente e por tribunal, intimações recentes e prazos a acompanhar. |
| **Intimações** (`/intimacoes`) | Lista em cards ou tabela, busca livre (ignora acentos), filtros por intervalo de datas, tipo de comunicação (categoria), status, cliente e tribunal, ordenação, paginação, ações em lote e exportação CSV. |
| **Detalhe** (`/intimacoes/[id]`) | Órgão, data de disponibilização, tipo de comunicação, meio, tipo de documento, classe (tipo de ação), partes com polo, advogados com OAB, inteiro teor, status, prazo e observações. |
| **Nova / Editar** | Formulário validado com seletor de datas, máscara do número CNJ e listas dinâmicas de partes e advogados. |
| **Buscar no Comunica** (`/comunica`) | Pesquisa todos os clientes ativos, um cliente específico ou uma pesquisa avulsa num período; mostra o andamento por cliente, marca o que já está no acervo e importa as novas sem duplicar. |
| **Clientes monitorados** (`/clientes`) | Campo configurável com o que deve ser pesquisado: nome da parte, nome do advogado, número da OAB + UF ou número do processo, com filtro opcional por tribunal. |
| **Dados e backup** (`/dados`) | Exportar CSV, backup e restauração em JSON, dados de demonstração e limpeza total. |

Os dados ficam no `localStorage` do navegador (chaves `controle-intimacoes:*`).

## Integração com o Comunica PJe

O navegador chama `GET /api/comunica` (route handler do Next.js), que consulta
`https://comunicaapi.pje.jus.br/api/v1/comunicacao` no servidor. Isso evita bloqueio de
CORS e permite paginar (até 5 páginas de 100 itens por cliente). Parâmetros usados:
`nomeParte`, `nomeAdvogado`, `numeroOab` + `ufOab`, `numeroProcesso`, `siglaTribunal`,
`dataDisponibilizacaoInicio`, `dataDisponibilizacaoFim`, `pagina`, `itensPorPagina`.

A conversão da resposta fica em `lib/comunica.ts` e é tolerante a variações de nomes de
campos. A API pública tem limite de requisições; quando ela responde 429 a aplicação
avisa para aguardar. A API pode recusar acessos vindos de fora do Brasil.

## Roteiro de teste manual

1. Abra o **Painel** e clique em **Carregar dados de exemplo** (30 intimações fictícias e 4 clientes).
2. Confira os cards e gráficos; alterne entre 6 e 12 meses; clique em **Concluir** em um prazo.
3. Em **Intimações**, busque "rio claro"; abra **Filtros**, use o atalho **30 dias** e escolha uma categoria; troque para a visão em tabela.
4. Selecione algumas intimações e altere o status em lote; depois **Exportar CSV** (abre no Excel com acentos corretos).
5. Clique em **Nova intimação** e tente salvar vazio para ver a validação; preencha, escolha um prazo pelo calendário e salve.
6. No detalhe, edite observações, mude o status, clique em **Editar** e depois em **Excluir**.
7. Em **Clientes monitorados**, cadastre um cliente real (por exemplo, o nome de uma empresa ou sua OAB).
8. Em **Buscar no Comunica**, escolha o cliente, um período curto e clique em **Buscar intimações**; importe os resultados e repita a busca para ver a marcação "Já no acervo".
9. Em **Dados e backup**, exporte o JSON, apague tudo e restaure o backup.

## Testes automatizados

```bash
npm test        # normalização da API, filtros, CSV e validação (Node 22.6+)
npm run typecheck
npm run lint
```

## Estrutura

```
app/                  páginas (App Router) e app/api/comunica/route.ts
components/           UI (cards, gráficos SVG, seletor de datas, modais, toasts, formulário)
lib/                  tipos, store com localStorage, integração Comunica, filtros, CSV, validação
tests/                testes com node:test
```
