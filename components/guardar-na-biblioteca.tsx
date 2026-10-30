"use client";

import { BookmarkPlus, Check } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/auth/api";
import type { TipoItemBiblioteca } from "@/lib/biblioteca";
import type { AreaAtuacao } from "@/lib/processos";
import { mensagemDe } from "@/lib/use-api";
import { useToast } from "./toast";
import { Button } from "./ui";

/** Guarda uma fonte achada pela IA (pesquisa ou monitor) como item da biblioteca, com o link oficial. */
export function GuardarNaBiblioteca({ item }: { item: { tipo: TipoItemBiblioteca; titulo: string; referencia?: string; tribunal?: string; texto?: string; link: string; area?: AreaAtuacao } }) {
  const { toast } = useToast();
  const [estado, setEstado] = useState<"livre" | "salvando" | "salvo">("livre");
  async function guardar() {
    setEstado("salvando");
    try {
      const form = new FormData();
      form.set("dados", JSON.stringify({ ...item, titulo: item.titulo.slice(0, 200), etiquetas: ["pesquisa IA"] }));
      await api("/api/biblioteca", { body: form });
      setEstado("salvo");
      toast("Guardado na biblioteca");
    } catch (e) {
      setEstado("livre");
      toast(mensagemDe(e), { tom: "error" });
    }
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={estado === "salvo" ? <Check className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
      loading={estado === "salvando"}
      disabled={estado === "salvo"}
      onClick={() => void guardar()}
    >
      {estado === "salvo" ? "Guardado" : "Guardar na biblioteca"}
    </Button>
  );
}
