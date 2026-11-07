# Treinar um modelo pequeno para o Agente de Prazos (na sua máquina)

Projeto de estudo, fora do ar. Nada aqui muda o Clepsa que os clientes usam.

## O plano, em etapas

| Etapa | O que é | Quem faz | Situação |
|---|---|---|---|
| 1 | Gerar exemplos inventados | script deste PR | pronto |
| 2 | Preparar o ambiente (WSL e placa de vídeo) | você, com conferência minha | a fazer |
| 3 | Treinar (QLoRA em cima do qwen2.5:3b) | script que escrevo depois da etapa 2 | a fazer |
| 4 | Levar o modelo treinado para o Ollama | idem | a fazer |
| 5 | Medir nas 28 avaliações e comparar com o Haiku | `npm run avaliar:prazos -- --ollama clepsa-prazos` | pronto (precisa só do modelo) |

## Etapa 1: gerar os exemplos

No PowerShell, na pasta do projeto (um comando por vez):

```
cd C:\Users\Thiago\intima-es
git fetch origin
git checkout claude/project-thread-aipge3
git pull
node --experimental-strip-types scripts/treino/gerar-exemplos-prazos.mts
```

Isso cria a pasta `treino\dados` com:
- `treino.jsonl` (80%), `validacao.jsonl` (10%) e `teste.jsonl` (10%), uma conversa por linha;
- `resumo.json`, com quantos exemplos de cada tipo.

Dá para pedir outra quantidade ou outra "semente" (muda o sorteio): `--quantidade 1500 --semente 8`.
Roda em segundos, não gasta nada e não usa internet.

## Como os exemplos nascem

A resposta certa nasce junto com o texto: o script escolhe a providência (ex.: réplica, 15 dias úteis),
escreve a publicação com palavras variadas (juízo, cidade, preâmbulo, prazo por extenso) e já guarda o
gabarito. Depois cada exemplo passa pelo conferente do Clepsa; se ele achar qualquer alerta grave, o
exemplo é jogado fora. Nenhum exemplo é igual a uma das 28 avaliações.

Cobre: réplica, contestação, pagamento, emenda, custas, perícia, provas, juntada, alegações finais,
manifestação (com e sem prazo escrito), contrarrazões, embargos, sentenças e decisões (cível, trabalho,
penal e juizado), acórdão, audiência, só ciência e prazo em dobro (Fazenda, Defensoria, Ministério Público).


## Usando as intimações reais do Clepsa (recomendado)

Os exemplos inventados são limpos demais. Com as suas intimações reais o modelo aprende o texto de verdade.
**Os dados não saem do seu PC**: a pasta `treino\reais` é ignorada pelo git e nunca vai para o GitHub.

1. **Exportar:** no Clepsa, Dados e backup > Exportar backup. Guarde o arquivo `.json` (por exemplo em Downloads).
2. **Preparar** (um comando por vez no PowerShell, na pasta do projeto):
   ```
   node --experimental-strip-types scripts/treino/dados-reais-prazos.mts preparar --backup "C:\Users\Thiago\Downloads\backup-intimacoes-AAAA-MM-DD.json"
   ```
   - Tira nomes, CPF, CNPJ, número do processo, OAB, e-mail e telefone (troca por `[AUTOR]`, `[RÉU]`, `[ADVOGADO]`, `[PROCESSO]` etc.).
   - Deixa de fora segredo de justiça, textos repetidos e textos curtos demais.
   - Sem `--ia`, a proposta de resposta vem das regras do Clepsa (grátis, mas erra mais).
   - Com `--ia`, vem do Claude Haiku (uns 20 centavos de dólar para 500), e só o texto **já sem nomes** é enviado:
     ```
     node --env-file=.env --experimental-strip-types scripts/treino/dados-reais-prazos.mts preparar --backup "..." --ia
     ```
3. **Conferir:** abra `treino\reais\revisao.csv` no Excel e siga `treino\reais\legenda.txt`.
   - Se a proposta está certa, escreva `S`. Se errada, preencha só o que está errado.
   - Se sobrou algum nome na coluna do texto, apague ou troque ali mesmo. A coluna "Nomes que sobraram?" ajuda.
   - Pode fazer em partes: linhas que você não mexer ficam de fora. Salve como CSV, não como `.xlsx`.
4. **Montar:**
   ```
   node --experimental-strip-types scripts/treino/dados-reais-prazos.mts montar
   ```
   Cria `reais-treino.jsonl`, `reais-validacao.jsonl` e `reais-teste.jsonl`. Cada exemplo passa pelo conferente do Clepsa;
   o que contradiz o texto (por exemplo, dias diferentes dos escritos) fica de fora e aparece na lista.

O `reais-teste.jsonl` é o melhor teste que teremos: publicações de verdade, com a resposta que **você** conferiu, que o modelo nunca viu.

**Limites:** a anonimização acha o que é conhecido (partes, advogados, cliente, números). Nome de testemunha ou perito
digitado no meio do texto pode escapar; por isso a conferência no Excel. Quem confere é você, e a responsabilidade
pelo sigilo dos seus clientes continua sendo sua.

## Limites dos exemplos inventados

1. **Os exemplos são mais "limpos" que as publicações reais.** São cerca de 25 moldes com variações.
   Um modelo treinado só neles tende a ir bem nos moldes e mal em textos bagunçados.
2. **Por isso o teste que vale é o das 28 avaliações** (escritas à mão, fora do treino).
   O `teste.jsonl` gerado vem dos mesmos moldes e dá uma nota inflada. Não use como prova.
3. **O que não está nos moldes, o modelo não aprende.** Se uma situação real faltar, o caminho é
   acrescentar um molde novo em `scripts/treino/gerar-exemplos-prazos.mts` (ou, no futuro, publicações
   reais anonimizadas confirmadas pelo advogado).
4. **O conferente do Clepsa continua obrigatório.** Mesmo treinado, o modelo pequeno pode errar em silêncio.
5. Se mudarmos as instruções do Agente de Prazos, é preciso gerar os exemplos de novo e retreinar.

## Etapa 2: o que preciso saber do seu PC

Sem pressa, rode e me mande o resultado:

```
nvidia-smi
wsl --status
wsl -l -v
```

Eu digo se o seu Windows está pronto para treinar, ou o que instalar primeiro.
