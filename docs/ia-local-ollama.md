# IA local (Ollama) contra o Agente de Prazos

Um experimento, fora do ar: comparar um modelo pequeno rodando no seu computador (Ollama) com o
Agente de Prazos, nas mesmas 28 publicações de avaliação (`tests/evals/agente-prazos.casos.ts`).
Nada disso muda o Clepsa no ar: o servidor continua usando o Claude.

## O plano

| Etapa | O que roda | Para responder |
|---|---|---|
| 1 | `qwen2.5:3b` (cerca de 2 GB) | Um modelo bem pequeno já lê melhor que as regras (23/28)? |
| 2 | `qwen2.5:7b` (cerca de 4,7 GB, já quantizado) | Vale o modelo maior, mais lento? |
| 3 | 3b lê, 7b relê só quando o conferente reprova | Repete o desenho Haiku → Sonnet sem custo |
| 4 | Claude (Haiku lê, Sonnet relê), com a sua chave | A referência, com o custo em dólares |

**Como decidir.** O número que manda é o de **erros silenciosos** (vencimento depois do certo, sem
aviso), que precisa ser **zero**. Depois vêm os acertos (as regras fazem 23/28) e o tempo por
publicação. Um modelo local só vale a pena se tiver zero erro silencioso e acertar mais que as
regras. O conferente do Clepsa (código, sem IA) continua calculando o vencimento e conferindo a
leitura em qualquer caso, inclusive com o modelo local.

**Dados de clientes.** As 28 publicações são fictícias e não têm nome de cliente. Se um dia
quisermos testar com publicações reais, elas entram nos casos só depois de trocar nomes, CPF,
número do processo e endereços por dados inventados (o número de dias e o tipo de ato ficam).

## Passo a passo no PowerShell

1. **Abra o PowerShell**: tecla Windows, digite `PowerShell` e aperte Enter.

2. **Entre na pasta do Clepsa**:
   ```powershell
   cd $HOME\intima-es
   ```

3. **Pegue a versão nova** (enquanto o PR não foi juntado, use o ramo dele):
   ```powershell
   git fetch origin
   git checkout claude/project-thread-aipge3
   ```
   Depois que o PR for juntado, troque por `git checkout main` e `git pull`.

4. **Confira o Node** (precisa ser 22.6 ou mais novo):
   ```powershell
   node -v
   ```
   Se der erro ou mostrar versão menor, instale a versão LTS em https://nodejs.org, feche e abra o
   PowerShell de novo.

5. **Instale as dependências** (só na primeira vez, ou quando o Clepsa mudar):
   ```powershell
   npm install
   ```

6. **Confira se o Ollama está aberto**: o ícone da lhama aparece perto do relógio. Se não aparecer,
   abra o Ollama pelo menu Iniciar.

7. **Baixe o modelo pequeno** (uns 2 GB, só uma vez):
   ```powershell
   ollama pull qwen2.5:3b
   ```

8. **Rode a comparação**:
   ```powershell
   npm run avaliar:prazos -- --ollama qwen2.5:3b --salvar resultado-3b.json
   ```
   Leva alguns minutos. No fim aparece uma tabela **Comparação** com as regras e o modelo lado a
   lado. Se houver erro silencioso, o npm termina com uma mensagem vermelha de "falhou": isso é de
   propósito (é a trava), não é defeito.

9. **Modelo maior** (uns 4,7 GB; com 6 GB de vídeo ele cabe, mas fica mais lento):
   ```powershell
   ollama pull qwen2.5:7b
   npm run avaliar:prazos -- --ollama qwen2.5:7b --salvar resultado-7b.json
   ```

10. **O pequeno lê e o grande relê** (como Haiku → Sonnet):
    ```powershell
    npm run avaliar:prazos -- --ollama qwen2.5:3b --releitura qwen2.5:7b --salvar resultado-3b-7b.json
    ```

11. **Comparar com o Claude** (opcional; gasta alguns centavos de dólar da sua chave):
    ```powershell
    $env:ANTHROPIC_API_KEY = "cole-aqui-a-sua-chave"
    npm run avaliar:prazos -- --ollama qwen2.5:3b --ia --salvar resultado-com-claude.json
    ```
    Para o Sonnet ler tudo (sem o Haiku), antes rode `$env:ANTHROPIC_MODEL_SIMPLES = "claude-sonnet-5-5"`.
    A chave fica só nessa janela do PowerShell; ao fechar, ela some.

12. **Mande o resultado**: copie a tabela **Comparação** (ou anexe o arquivo `resultado-*.json`
    que ficou na pasta `intima-es`) na conversa com o Claude.

Para rodar um caso só: acrescente `--caso 19`. Para voltar ao normal: `git checkout main`.

## Como funciona por dentro

- `server/ia/ia-ollama.ts`: liga o Agente de Prazos à API local do Ollama
  (`http://localhost:11434/api/chat`), com as mesmas instruções e o mesmo esquema JSON do Claude,
  temperatura 0 e janela de 8 mil tokens. Lê só texto (sem PDF, sem pesquisa na web).
- `scripts/avaliar-agente-prazos.mts`: com `--ollama` e/ou `--ia`, roda as regras junto e imprime a
  tabela de comparação. Sem nenhuma opção, faz o mesmo de antes (só as regras).
