import { test } from "node:test";
import assert from "node:assert/strict";
import { IaClaude } from "../server/ia/ia.ts";

/** Responde como a API em streaming, com um texto só. */
function respostaSse(texto: string, modelo: string): Response {
  const eventos = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: modelo, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: texto } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  const corpo = eventos.map(([nome, dados]) => `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`).join("");
  return new Response(corpo, { headers: { "content-type": "text/event-stream" } });
}

function iaComFetchFalso() {
  const pedidos: { corpo: Record<string, unknown>; cabecalhos: Headers }[] = [];
  const fetchFalso = (async (_url: string, init: RequestInit) => {
    const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
    pedidos.push({ corpo, cabecalhos: new Headers(init.headers) });
    return respostaSse("ok", String(corpo.model));
  }) as typeof fetch;
  const ia = new IaClaude({ chave: "teste", modelo: "claude-sonnet-5-5", modeloSimples: "claude-haiku-5-5", fetch: fetchFalso });
  return { ia, pedidos };
}

const blocos = [
  { tipo: "documento" as const, titulo: "Pedido", texto: "Cliente pergunta sobre o prazo." },
  { tipo: "texto" as const, texto: "Faça a triagem." },
];

test("IA: tarefa simples vai para o Haiku, sem o fallback do servidor", async () => {
  const { ia, pedidos } = iaComFetchFalso();
  const r = await ia.perguntar({ sistema: "s", blocos, esforco: "low", simples: true });
  assert.equal(r.modelo, "claude-haiku-5-5");
  assert.equal(pedidos[0].corpo.model, "claude-haiku-5-5");
  assert.equal(pedidos[0].corpo.fallbacks, undefined);
  assert.doesNotMatch(pedidos[0].cabecalhos.get("anthropic-beta") ?? "", /server-side-fallback/);
});

test("IA: o resto vai para o modelo principal, com fallback e cache no último documento", async () => {
  const { ia, pedidos } = iaComFetchFalso();
  const r = await ia.perguntar({ sistema: "s", blocos, esforco: "medium" });
  assert.equal(r.modelo, "claude-sonnet-5-5");
  assert.equal(pedidos[0].corpo.fallbacks, "default");
  assert.match(pedidos[0].cabecalhos.get("anthropic-beta") ?? "", /server-side-fallback/);
  const [msg] = pedidos[0].corpo.messages as { content: { type: string; cache_control?: unknown }[] }[];
  assert.deepEqual(msg.content[0].cache_control, { type: "ephemeral" });
  assert.equal(msg.content[1].cache_control, undefined);
});

test("IA: simples com pesquisa na web continua no modelo principal", async () => {
  const { ia, pedidos } = iaComFetchFalso();
  await ia.perguntar({ sistema: "s", blocos, simples: true, pesquisaWeb: { maxUsos: 1 } });
  assert.equal(pedidos[0].corpo.model, "claude-sonnet-5-5");
});
