"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/auth/api";
import type { ItemBiblioteca } from "@/lib/biblioteca";
import { IDIOMA_LABEL } from "@/lib/editor";
import {
  type DadosFluxo,
  FERRAMENTA_COM_INSTRUCAO,
  FERRAMENTA_FLUXO_AJUDA,
  FERRAMENTA_FLUXO_LABEL,
  type FerramentaFluxo,
  FERRAMENTAS_FLUXO,
  type FluxoIa,
  LIMITES_FLUXO_IA,
  MODELOS_FLUXO,
  type PassoFluxo,
  validarFluxo,
} from "@/lib/fluxos-ia";
import { FORMATO_PERGUNTA_LABEL, type FormatoPergunta, LIMITES_REVISAO, type ModeloRevisao, MODELOS_REVISAO_PRONTOS } from "@/lib/revisao";
import { mensagemDe, useApi } from "@/lib/use-api";
import { normalizar } from "@/lib/utils";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "./ui";

type PassoForm = Omit<PassoFluxo, "id"> & { id?: string; chave: string };

const chaveNova = () => globalThis.crypto.randomUUID();

function passoVazio(ferramenta: FerramentaFluxo): PassoForm {
  return {
    chave: chaveNova(),
    ferramenta,
    ...(FERRAMENTA_COM_INSTRUCAO[ferramenta] ? { instrucao: "" } : {}),
    ...(ferramenta === "revisao_tabela" ? { perguntas: [{ texto: "", formato: "texto" as FormatoPergunta }] } : {}),
    ...(ferramenta === "biblioteca" ? { bibliotecaIds: [] } : {}),
    ...(ferramenta === "traduzir" ? { idioma: "en" } : {}),
  };
}

const paraForm = (passos: Omit<PassoFluxo, "id">[] | PassoFluxo[]): PassoForm[] => passos.map((p) => ({ ...p, chave: chaveNova(), ...(p.perguntas ? { perguntas: p.perguntas.map((q) => ({ ...q })) } : {}) }));

/** Itens da Biblioteca com busca e caixas de marcar. */
function SeletorBiblioteca({ itens, marcados, onMudar, id }: { itens: ItemBiblioteca[]; marcados: string[]; onMudar: (ids: string[]) => void; id: string }) {
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const t = normalizar(busca.trim());
    return itens.filter((i) => !t || normalizar(`${i.titulo} ${i.referencia ?? ""} ${i.etiquetas.join(" ")}`).includes(t));
  }, [itens, busca]);
  if (!itens.length) return <p className="text-sm text-slate-500">A Biblioteca do escritório está vazia. Cadastre modelos ou jurisprudência em Biblioteca para usar aqui.</p>;
  const cheio = marcados.length >= LIMITES_FLUXO_IA.biblioteca;
  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input id={id} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar a Biblioteca" className="pl-9" aria-label="Filtrar a Biblioteca" />
      </div>
      <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {lista.map((i) => {
          const marcado = marcados.includes(i.id);
          return (
            <li key={i.id}>
              <label className={clsx("flex cursor-pointer items-start gap-3 px-3 py-2 text-sm", !marcado && cheio && "cursor-not-allowed opacity-50")}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={marcado}
                  disabled={!marcado && cheio}
                  onChange={() => onMudar(marcado ? marcados.filter((x) => x !== i.id) : [...marcados, i.id])}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800">{i.titulo}</span>
                  {i.referencia && <span className="block text-xs text-slate-500">{i.referencia}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-slate-500">
        {marcados.length} de até {LIMITES_FLUXO_IA.biblioteca} itens escolhidos.
      </p>
    </div>
  );
}

function EditorPasso({
  passo,
  indice,
  total,
  biblioteca,
  modelos,
  onMudar,
  onMover,
  onTirar,
}: {
  passo: PassoForm;
  indice: number;
  total: number;
  biblioteca: ItemBiblioteca[];
  modelos: Pick<ModeloRevisao, "titulo" | "perguntas">[];
  onMudar: (p: PassoForm) => void;
  onMover: (delta: number) => void;
  onTirar: () => void;
}) {
  const n = indice + 1;
  const perguntas = passo.perguntas ?? [];
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Passo {n}</span>
          <Badge>{FERRAMENTA_FLUXO_LABEL[passo.ferramenta]}</Badge>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" aria-label={`Subir o passo ${n}`} icon={<ArrowUp className="h-4 w-4" />} disabled={indice === 0} onClick={() => onMover(-1)} />
          <Button size="sm" variant="ghost" aria-label={`Descer o passo ${n}`} icon={<ArrowDown className="h-4 w-4" />} disabled={indice === total - 1} onClick={() => onMover(1)} />
          <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Tirar o passo ${n}`} icon={<Trash2 className="h-4 w-4" />} onClick={onTirar} />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs text-slate-500">{FERRAMENTA_FLUXO_AJUDA[passo.ferramenta]}</p>
        {FERRAMENTA_COM_INSTRUCAO[passo.ferramenta] && (
          <Field label={passo.ferramenta === "pesquisar" ? "O que pesquisar" : "O que este passo deve fazer"} htmlFor={`passo-${passo.chave}`} required>
            <Textarea
              id={`passo-${passo.chave}`}
              rows={3}
              value={passo.instrucao ?? ""}
              maxLength={LIMITES_FLUXO_IA.instrucaoPasso}
              onChange={(e) => onMudar({ ...passo, instrucao: e.target.value })}
              placeholder={
                passo.ferramenta === "pesquisar"
                  ? "Ex.: Qual o entendimento do STJ sobre dano moral por negativação indevida?"
                  : passo.ferramenta === "biblioteca"
                    ? "Ex.: Adapte o modelo de contestação aos fatos do processo."
                    : "Ex.: Redija um resumo dos pontos de alerta, com recomendações."
              }
            />
          </Field>
        )}
        {passo.ferramenta === "revisao_tabela" && (
          <fieldset className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="text-sm font-medium text-slate-700">Perguntas (viram as colunas da tabela)</legend>
              <Select
                value=""
                onChange={(e) => {
                  const m = modelos.find((x) => x.titulo === e.target.value);
                  if (m) onMudar({ ...passo, perguntas: m.perguntas.map((p) => ({ texto: p.texto, formato: p.formato })) });
                }}
                className="h-8 w-auto py-0 text-sm"
                aria-label={`Usar perguntas de um modelo no passo ${n}`}
              >
                <option value="">Usar um modelo…</option>
                {modelos.map((m) => (
                  <option key={m.titulo} value={m.titulo}>
                    {m.titulo}
                  </option>
                ))}
              </Select>
            </div>
            {perguntas.map((q, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={q.texto}
                  maxLength={LIMITES_REVISAO.pergunta}
                  onChange={(e) => onMudar({ ...passo, perguntas: perguntas.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })}
                  placeholder="Ex.: Há pedido de tutela de urgência?"
                  aria-label={`Pergunta ${i + 1} do passo ${n}`}
                  className="min-w-0 flex-1"
                />
                <Select
                  value={q.formato}
                  onChange={(e) => onMudar({ ...passo, perguntas: perguntas.map((x, j) => (j === i ? { ...x, formato: e.target.value as FormatoPergunta } : x)) })}
                  className="w-40"
                  aria-label={`Formato da pergunta ${i + 1} do passo ${n}`}
                >
                  {Object.entries(FORMATO_PERGUNTA_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  aria-label={`Tirar a pergunta ${i + 1} do passo ${n}`}
                  icon={<X className="h-4 w-4" />}
                  disabled={perguntas.length === 1}
                  onClick={() => onMudar({ ...passo, perguntas: perguntas.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
            {perguntas.length < LIMITES_REVISAO.perguntas && (
              <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => onMudar({ ...passo, perguntas: [...perguntas, { texto: "", formato: "texto" }] })}>
                Mais uma pergunta
              </Button>
            )}
          </fieldset>
        )}
        {passo.ferramenta === "biblioteca" && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Itens da Biblioteca que a IA lê</legend>
            <SeletorBiblioteca itens={biblioteca} marcados={passo.bibliotecaIds ?? []} onMudar={(ids) => onMudar({ ...passo, bibliotecaIds: ids })} id={`biblioteca-${passo.chave}`} />
          </fieldset>
        )}
        {passo.ferramenta === "traduzir" && (
          <Field label="Idioma" htmlFor={`idioma-${passo.chave}`}>
            <Select id={`idioma-${passo.chave}`} value={passo.idioma ?? "en"} onChange={(e) => onMudar({ ...passo, idioma: e.target.value })} className="w-48">
              {Object.entries(IDIOMA_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l[0].toUpperCase() + l.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Card>
  );
}

/** Montar ou editar um fluxo: nome, instruções gerais, etiquetas e os passos em ordem. */
export function ConstrutorFluxo({ fluxo }: { fluxo?: FluxoIa }) {
  const router = useRouter();
  const { toast } = useToast();
  const { dados: bib } = useApi<{ itens: ItemBiblioteca[] }>("/api/biblioteca");
  const { dados: rev } = useApi<{ modelos: ModeloRevisao[] }>("/api/revisoes");
  const [titulo, setTitulo] = useState(fluxo?.titulo ?? "");
  const [instrucoes, setInstrucoes] = useState(fluxo?.instrucoes ?? "");
  const [etiquetas, setEtiquetas] = useState<string[]>(fluxo?.etiquetas ?? []);
  const [etiqueta, setEtiqueta] = useState("");
  const [passos, setPassos] = useState<PassoForm[]>(fluxo ? paraForm(fluxo.passos) : []);
  const [escolhendo, setEscolhendo] = useState(!fluxo);
  const [salvando, setSalvando] = useState<"rascunho" | "publicar">();
  const [erro, setErro] = useState<string>();

  const modelos = [...MODELOS_REVISAO_PRONTOS, ...(rev?.modelos ?? [])];
  const vazio = !titulo.trim() && !passos.length;

  function adicionarEtiqueta() {
    const t = etiqueta.trim().slice(0, LIMITES_FLUXO_IA.etiqueta);
    if (t && !etiquetas.includes(t) && etiquetas.length < LIMITES_FLUXO_IA.etiquetas) setEtiquetas([...etiquetas, t]);
    setEtiqueta("");
  }

  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= passos.length) return;
    const nova = [...passos];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setPassos(nova);
  }

  async function salvar(publicado: boolean) {
    const corpo: DadosFluxo = { titulo, instrucoes, etiquetas, publicado, passos: passos.map(({ chave: _c, ...p }) => p as PassoFluxo) };
    const v = validarFluxo(corpo);
    if ("erro" in v) {
      setErro(v.erro);
      return;
    }
    setSalvando(publicado ? "publicar" : "rascunho");
    setErro(undefined);
    try {
      await (fluxo
        ? api<{ fluxo: FluxoIa }>(`/api/fluxos-ia/${fluxo.id}`, { method: "PUT", body: corpo })
        : api<{ fluxo: FluxoIa }>("/api/fluxos-ia", { body: corpo }));
      toast(publicado ? "Fluxo publicado para o escritório" : "Rascunho salvo");
      router.push("/fluxos");
    } catch (e) {
      setErro(mensagemDe(e));
      setSalvando(undefined);
    }
  }

  return (
    <div className="space-y-5">
      {!fluxo && vazio && (
        <Card>
          <CardHeader title="Começar de um modelo" subtitle="Escolha um modelo pronto e ajuste, ou comece em branco." />
          <ul className="grid gap-3 p-4 sm:grid-cols-3">
            {MODELOS_FLUXO.map((m) => (
              <li key={m.titulo}>
                <button
                  type="button"
                  className="h-full w-full rounded-lg border border-slate-200 p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
                  onClick={() => {
                    setTitulo(m.titulo);
                    setInstrucoes(m.instrucoes ?? "");
                    setEtiquetas(m.etiquetas);
                    setPassos(paraForm(m.passos));
                    setEscolhendo(false);
                  }}
                >
                  <span className="block text-sm font-medium text-slate-900">{m.titulo}</span>
                  <span className="mt-1 block text-xs text-slate-500">{m.descricao}</span>
                  <span className="mt-2 block text-xs text-slate-400">{m.passos.map((p) => FERRAMENTA_FLUXO_LABEL[p.ferramenta]).join(" → ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="space-y-4 p-5">
          <Field label="Nome do fluxo" htmlFor="fluxo-titulo" required>
            <Input id="fluxo-titulo" value={titulo} maxLength={LIMITES_FLUXO_IA.titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Revisão de contratos de clientes" />
          </Field>
          <Field label="Instruções gerais" htmlFor="fluxo-instrucoes" hint="Valem para todos os passos: o papel da IA, o objetivo, o tom.">
            <Textarea
              id="fluxo-instrucoes"
              rows={3}
              value={instrucoes}
              maxLength={LIMITES_FLUXO_IA.instrucoes}
              onChange={(e) => setInstrucoes(e.target.value)}
              placeholder="Ex.: Você representa o réu. Escreva em português formal e direto."
            />
          </Field>
          <div>
            <label htmlFor="fluxo-etiqueta" className="mb-1.5 block text-sm font-medium text-slate-700">
              Etiquetas
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {etiquetas.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                  {t}
                  <button type="button" aria-label={`Tirar a etiqueta ${t}`} onClick={() => setEtiquetas(etiquetas.filter((x) => x !== t))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {etiquetas.length < LIMITES_FLUXO_IA.etiquetas && (
                <Input
                  id="fluxo-etiqueta"
                  value={etiqueta}
                  onChange={(e) => setEtiqueta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      adicionarEtiqueta();
                    }
                  }}
                  onBlur={adicionarEtiqueta}
                  placeholder="Ex.: Contencioso (Enter para pôr)"
                  className="h-8 w-60 text-sm"
                />
              )}
            </div>
          </div>
        </div>
      </Card>

      <section aria-label="Passos" className="space-y-3">
        {passos.map((p, i) => (
          <EditorPasso
            key={p.chave}
            passo={p}
            indice={i}
            total={passos.length}
            biblioteca={bib?.itens ?? []}
            modelos={modelos}
            onMudar={(novo) => setPassos(passos.map((x) => (x.chave === p.chave ? novo : x)))}
            onMover={(d) => mover(i, d)}
            onTirar={() => setPassos(passos.filter((x) => x.chave !== p.chave))}
          />
        ))}

        {passos.length < LIMITES_FLUXO_IA.passos &&
          (escolhendo || !passos.length ? (
            <Card>
              <CardHeader
                title="Adicionar passo"
                subtitle="Cada passo usa uma ferramenta e recebe o que os anteriores produziram."
                action={passos.length ? <Button size="sm" variant="ghost" aria-label="Fechar a lista de ferramentas" icon={<X className="h-4 w-4" />} onClick={() => setEscolhendo(false)} /> : undefined}
              />
              <ul className="grid gap-2 p-4 sm:grid-cols-2">
                {FERRAMENTAS_FLUXO.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      className="h-full w-full rounded-lg border border-slate-200 p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
                      onClick={() => {
                        setPassos([...passos, passoVazio(f)]);
                        setEscolhendo(false);
                      }}
                    >
                      <span className="block text-sm font-medium text-slate-900">{FERRAMENTA_FLUXO_LABEL[f]}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{FERRAMENTA_FLUXO_AJUDA[f]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <div className="flex justify-center">
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEscolhendo(true)}>
                Adicionar passo
              </Button>
            </div>
          ))}
      </section>

      {erro && <Alert>{erro}</Alert>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
        <Button variant="ghost" onClick={() => router.push("/fluxos")} disabled={!!salvando}>
          Cancelar
        </Button>
        <Button variant="secondary" loading={salvando === "rascunho"} disabled={!!salvando} onClick={() => void salvar(false)}>
          {fluxo?.publicado ? "Voltar a rascunho" : "Salvar rascunho"}
        </Button>
        <Button loading={salvando === "publicar"} disabled={!!salvando} onClick={() => void salvar(true)}>
          {fluxo?.publicado ? "Salvar" : "Publicar"}
        </Button>
      </div>
    </div>
  );
}
