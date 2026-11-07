"""
Treino QLoRA do qwen2.5:3b na RTX 2060 (6 GB). Tudo local, nenhum dado sai do computador.

Uso (dentro do WSL/Ubuntu, com o ambiente de treino/LEIAME-TREINO.md):
  python treino/treinar_qlora.py --pasta treino/cpj --tarefa eventos
  python treino/treinar_qlora.py --pasta treino/dados --tarefa prazos      # sintéticos

Lê <pasta>/<tarefa>-treino.jsonl e <tarefa>-validacao.jsonl (ou treino.jsonl / validacao.jsonl).
Grava o adaptador em treino/saida/<tarefa>/ e o modelo já fundido em treino/saida/<tarefa>-fundido/.
"""
import argparse, json, os, sys
import torch
from datasets import Dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

ap = argparse.ArgumentParser()
ap.add_argument("--pasta", required=True)
ap.add_argument("--tarefa", required=True)
ap.add_argument("--base", default="Qwen/Qwen2.5-3B-Instruct")
ap.add_argument("--epocas", type=float, default=3)
ap.add_argument("--max-tokens", type=int, default=1536)
a = ap.parse_args()

def ler(*nomes):
    for n in nomes:
        p = os.path.join(a.pasta, n)
        if os.path.exists(p):
            return Dataset.from_list([json.loads(l) for l in open(p, encoding="utf8") if l.strip()])
    sys.exit(f"Não achei {nomes} em {a.pasta}")

treino = ler(f"{a.tarefa}-treino.jsonl", "treino.jsonl")
valid = ler(f"{a.tarefa}-validacao.jsonl", "validacao.jsonl")
print(f"{len(treino)} exemplos de treino, {len(valid)} de validação")

tok = AutoTokenizer.from_pretrained(a.base)
modelo = AutoModelForCausalLM.from_pretrained(
    a.base,
    quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True),
    device_map={"": 0},
    torch_dtype=torch.float16,
)
saida = f"treino/saida/{a.tarefa}"
cfg = SFTConfig(
    output_dir=saida,
    num_train_epochs=a.epocas,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=16,
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    warmup_ratio=0.05,
    fp16=True,  # a RTX 2060 não tem bf16
    gradient_checkpointing=True,
    max_length=a.max_tokens,
    assistant_only_loss=False,
    logging_steps=10,
    eval_strategy="epoch",
    save_strategy="epoch",
    save_total_limit=2,
    report_to="none",
    optim="paged_adamw_8bit",
)
lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM",
                  target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
t = SFTTrainer(model=modelo, args=cfg, train_dataset=treino, eval_dataset=valid, processing_class=tok, peft_config=lora)
t.train()
t.save_model(saida)

# Funde o adaptador no modelo (em CPU, para caber na memória) para virar GGUF/Ollama depois.
from peft import AutoPeftModelForCausalLM
fundido = AutoPeftModelForCausalLM.from_pretrained(saida, torch_dtype=torch.float16, device_map={"": "cpu"}).merge_and_unload()
fundido.save_pretrained(f"{saida}-fundido")
tok.save_pretrained(f"{saida}-fundido")
print("Pronto:", f"{saida}-fundido")
