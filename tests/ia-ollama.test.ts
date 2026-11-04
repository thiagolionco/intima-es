import { strict as assert } from "node:assert";
import { test } from "node:test";
import { IaOllama, montarTexto } from "../server/ia/ia-ollama.ts";

test("IaOllama manda o esquema, temperatura 0 e o modelo certo para leitura e releitura", async () => {
  const pedidos: { url: string; corpo: Record<string, unknown> }[] = [];
  const fetchFalso = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url, corpo: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ message: { content: '{"ok":true}' } }));
  }) as typeof fetch;
  const ia = new IaOllama({ modelo: "qwen2.5:7b", modeloSimples: "qwen2.5:3b", url: "http://localhost:11434/", fetch: fetchFalso });
  const esquema = { type: "object" };
  const r1 = await ia.perguntar({ sistema: "S", simples: true, esquema, blocos: [{ tipo: "texto", texto: "pergunta" }, { tipo: "documento", titulo: "Publicação", texto: "Intime-se." }] });
  const r2 = await ia.perguntar({ sistema: "S", blocos: [{ tipo: "texto", texto: "x" }] });
  assert.equal(r1.texto, '{"ok":true}');
  assert.equal(r1.modelo, "qwen2.5:3b");
  assert.equal(r2.modelo, "qwen2.5:7b");
  assert.equal(pedidos[0].url, "http://localhost:11434/api/chat");
  assert.deepEqual(pedidos[0].corpo.format, esquema);
  assert.equal((pedidos[0].corpo.options as { temperature: number }).temperature, 0);
  assert.equal(pedidos[1].corpo.format, undefined);
});

test("montarTexto põe o documento antes da pergunta", () => {
  const t = montarTexto([{ tipo: "texto", texto: "Leia." }, { tipo: "documento", titulo: "Publicação", texto: "Cite-se." }]);
  assert.ok(t.indexOf("Cite-se.") < t.indexOf("Leia."));
});

test("verificar avisa quando o modelo não foi baixado ou o Ollama está fechado", async () => {
  const comModelos = (async () => new Response(JSON.stringify({ models: [{ name: "qwen2.5:3b" }] }))) as unknown as typeof fetch;
  assert.equal(await new IaOllama({ modelo: "qwen2.5:3b", fetch: comModelos }).verificar(), null);
  assert.match((await new IaOllama({ modelo: "qwen2.5:7b", fetch: comModelos }).verificar()) ?? "", /ollama pull qwen2.5:7b/);
  const fechado = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  assert.match((await new IaOllama({ modelo: "x", fetch: fechado }).verificar()) ?? "", /Não consegui falar/);
});
