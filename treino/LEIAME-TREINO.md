# Treinar na RTX 2060 (Windows + WSL2)

Tudo roda no seu PC. Nada é enviado para a internet, exceto a baixada do modelo-base e das bibliotecas.

1. **Confira a placa no WSL** (Ubuntu): `nvidia-smi` precisa mostrar a RTX 2060. Se não mostrar, atualize o driver NVIDIA no Windows.
2. **Ambiente** (uma vez):
   ```bash
   sudo apt update && sudo apt install -y python3-venv git build-essential
   python3 -m venv ~/treino-env && source ~/treino-env/bin/activate
   pip install torch --index-url https://download.pytorch.org/whl/cu121
   pip install "transformers>=4.46" "trl>=0.12" peft bitsandbytes datasets accelerate
   ```
3. **Repositório e Node** no WSL: `git clone https://github.com/thiagolionco/intima-es && cd intima-es && git checkout claude/project-thread-aipge3`, Node 22.6+ e `npm install`.
4. **Dados do CPJ** (o arquivo fica só no seu PC):
   ```bash
   node --experimental-strip-types scripts/treino/dados-cpj.mts validar --entrada /mnt/c/caminho/amostra_500.json
   # leia treino/cpj/relatorio.txt (20 textos): procure nomes que sobraram
   node --experimental-strip-types scripts/treino/dados-cpj.mts montar
   ```
5. **Treinar eventos** (leva de 30 min a poucas horas; se faltar memória, use `--max-tokens 1024`):
   ```bash
   python treino/treinar_qlora.py --pasta treino/cpj --tarefa eventos
   ```
6. **Converter para o Ollama**: use o llama.cpp (`convert_hf_to_gguf.py treino/saida/eventos-fundido --outtype q8_0`), depois um `Modelfile` com `FROM ./modelo.gguf` e `ollama create clepsa-eventos -f Modelfile`.
7. **Medir**: `python treino/avaliar_eventos.py --modelo clepsa-eventos --arquivo treino/cpj/eventos-teste.jsonl`. O modelo só vale se ganhar bem da linha de base e dos 20% do CPJ.

Este roteiro não foi testado na sua máquina: se um passo falhar, cole o erro aqui.
