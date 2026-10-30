"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/auth/api";
import type { Processo } from "@/lib/processos";
import { FORMATO_PERGUNTA_LABEL, type FormatoPergunta, LIMITES_REVISAO, type ModeloRevisao, MODELOS_REVISAO_PRONTOS, type RevisaoTabela } from "@/lib/revisao";
import { mensagemDe } from "@/lib/use-api";
import { Modal } from "./modal";
import { SeletorProcessos } from "./seletor-processos";
import { useToast } from "./toast";
import { Alert, Button, Field, Input, Select } from "./ui";

type PerguntaForm = { id?: string; texto: string; formato: FormatoPergunta };

/** Criar ou editar uma revisão em tabela: título, perguntas (colunas) e processos (linhas). */
export function FormRevisao({
  aberto,
  revisao,
  modelos,
  processos,
  onFechar,
  onSalva,
}: {
  aberto: boolean;
  revisao?: RevisaoTabela;
  modelos: ModeloRevisao[];
  processos: Processo[];
  onFechar: () => void;
  onSalva: (r: RevisaoTabela) => void;
}) {
  const { toast } = useToast();
  const [titulo, setTitulo] = useState("");
  const [perguntas, setPerguntas] = useState<PerguntaForm[]>([]);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [vista, setVista] = useState<unknown>();

  const chave = aberto ? (revisao ?? "nova") : undefined;
  if (chave !== vista) {
    setVista(chave);
    if (chave) {
      setTitulo(revisao?.titulo ?? "");
      setPerguntas(revisao ? revisao.perguntas.map((p) => ({ ...p })) : [{ texto: "", formato: "texto" }]);
      setMarcados(revisao ? revisao.linhas.map((l) => l.processoId) : []);
      setErro(undefined);
    }
  }

  const todosModelos = [...MODELOS_REVISAO_PRONTOS.map((m) => ({ ...m, id: `pronto:${m.titulo}` })), ...modelos];

  async function salvar() {
    setSalvando(true);
    setErro(undefined);
    try {
      const corpo = { titulo, perguntas: perguntas.filter((p) => p.texto.trim()), processos: marcados };
      const r = revisao
        ? await api<{ revisao: RevisaoTabela }>(`/api/revisoes/${revisao.id}`, { method: "PATCH", body: corpo })
        : await api<{ revisao: RevisaoTabela }>("/api/revisoes", { body: corpo });
      onSalva(r.revisao);
      onFechar();
      toast(revisao ? "Tabela atualizada" : "Tabela criada");
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={aberto}
      onClose={() => !salvando && onFechar()}
      title={revisao ? "Editar tabela" : "Nova revisão em tabela"}
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button loading={salvando} disabled={!marcados.length || !perguntas.some((p) => p.texto.trim())} onClick={() => void salvar()}>
            {revisao ? "Salvar" : "Criar tabela"}
          </Button>
        </>
      }
    >
      <div className="-mx-5 max-h-[70vh] space-y-4 overflow-y-auto px-5">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Título" htmlFor="revisao-titulo">
          <Input id="revisao-titulo" value={titulo} maxLength={LIMITES_REVISAO.titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Carteira do Banco X, outubro" />
        </Field>
        <fieldset className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-sm font-medium text-slate-700">Perguntas (viram as colunas)</legend>
            <Select
              value=""
              onChange={(e) => {
                const m = todosModelos.find((x) => x.id === e.target.value);
                if (m) {
                  setPerguntas(m.perguntas.map((p) => ({ ...p })));
                  if (!titulo.trim()) setTitulo(m.titulo);
                }
              }}
              className="h-8 w-auto py-0 text-sm"
              aria-label="Usar perguntas de um modelo"
            >
              <option value="">Usar um modelo…</option>
              {todosModelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titulo}
                </option>
              ))}
            </Select>
          </div>
          {perguntas.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={p.texto}
                maxLength={LIMITES_REVISAO.pergunta}
                onChange={(e) => setPerguntas(perguntas.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
                placeholder="Ex.: Há pedido de tutela de urgência?"
                aria-label={`Pergunta ${i + 1}`}
                className="min-w-0 flex-1"
              />
              <Select
                value={p.formato}
                onChange={(e) => setPerguntas(perguntas.map((x, j) => (j === i ? { ...x, formato: e.target.value as FormatoPergunta } : x)))}
                className="w-40"
                aria-label={`Formato da pergunta ${i + 1}`}
              >
                {Object.entries(FORMATO_PERGUNTA_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" aria-label={`Tirar a pergunta ${i + 1}`} icon={<Trash2 className="h-4 w-4" />} disabled={perguntas.length === 1} onClick={() => setPerguntas(perguntas.filter((_, j) => j !== i))} />
            </div>
          ))}
          {perguntas.length < LIMITES_REVISAO.perguntas && (
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setPerguntas([...perguntas, { texto: "", formato: "texto" }])}>
              Mais uma pergunta
            </Button>
          )}
          {revisao && <p className="text-xs text-slate-500">Perguntas mantidas guardam as respostas já feitas; as novas ficam vazias até rodar a IA.</p>}
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Processos (viram as linhas)</legend>
          <SeletorProcessos processos={processos} marcados={marcados} onMudar={setMarcados} maximo={LIMITES_REVISAO.linhas} id="revisao-processos" />
        </fieldset>
      </div>
    </Modal>
  );
}
