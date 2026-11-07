"""Mede o acerto do modelo treinado (rodando no Ollama) no conjunto de teste de eventos.
  python treino/avaliar_eventos.py --modelo clepsa-eventos --arquivo treino/cpj/eventos-teste.jsonl
Compara com a resposta mais comum do treino (linha de base) para saber se o modelo aprendeu algo."""
import argparse, json, collections, urllib.request
ap = argparse.ArgumentParser()
ap.add_argument("--modelo", required=True)
ap.add_argument("--arquivo", required=True)
ap.add_argument("--treino", default="treino/cpj/eventos-treino.jsonl")
a = ap.parse_args()
linhas = lambda p: [json.loads(l)["messages"] for l in open(p, encoding="utf8") if l.strip()]
teste, treino = linhas(a.arquivo), linhas(a.treino)
comum = collections.Counter(json.loads(m[2]["content"])["evento"] for m in treino).most_common(1)[0][0]
ok = base = 0
for m in teste:
    certo = json.loads(m[2]["content"])["evento"]
    req = urllib.request.Request("http://localhost:11434/api/chat", json.dumps({"model": a.modelo, "messages": m[:2], "stream": False, "format": "json", "options": {"temperature": 0}}).encode(), {"Content-Type": "application/json"})
    try:
        r = json.loads(json.loads(urllib.request.urlopen(req, timeout=300).read())["message"]["content"]).get("evento")
    except Exception:
        r = None
    ok += r == certo; base += comum == certo
n = max(1, len(teste))
print(f"Acertos: {ok}/{len(teste)} ({100*ok/n:.0f}%) · sempre '{comum}': {base}/{len(teste)} ({100*base/n:.0f}%)")
