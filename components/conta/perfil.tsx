"use client";

import { BadgeCheck, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/auth/menu-usuario";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { api, ErroApi } from "@/lib/auth/api";
import { useSessao, useUsuario } from "@/lib/auth/sessao";
import type { UsuarioPublico } from "@/lib/auth/tipos";
import { formatDate } from "@/lib/utils";

export function AbaPerfil() {
  const usuario = useUsuario();
  const { atualizarUsuario } = useSessao();
  const { toast } = useToast();
  const [dados, setDados] = useState({ nome: usuario.nome, escritorio: usuario.escritorio ?? "", oab: usuario.oab ?? "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const alterado = dados.nome !== usuario.nome || dados.escritorio !== (usuario.escritorio ?? "") || dados.oab !== (usuario.oab ?? "");

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    try {
      const r = await api<{ usuario: UsuarioPublico }>("/api/conta", { method: "PATCH", body: dados });
      atualizarUsuario(r.usuario);
      toast("Perfil atualizado");
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center">
        <Avatar nome={dados.nome || usuario.nome} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-slate-900">{usuario.nome}</p>
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            {usuario.email}
            {usuario.emailConfirmado && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <BadgeCheck className="h-3 w-3" /> confirmado
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-400">Conta criada em {formatDate(usuario.criadoEm.slice(0, 10))}</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Informações profissionais" subtitle="Aparecem no menu e nos relatórios que você exporta." />
        <form onSubmit={salvar} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nome completo" htmlFor="p-nome" required error={erro} className="sm:col-span-2">
            <Input id="p-nome" value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} autoComplete="name" />
          </Field>
          <Field label="Escritório" htmlFor="p-escritorio">
            <Input id="p-escritorio" value={dados.escritorio} onChange={(e) => setDados({ ...dados, escritorio: e.target.value })} autoComplete="organization" />
          </Field>
          <Field label="OAB" htmlFor="p-oab" hint="Ex.: 123456/SP">
            <Input id="p-oab" value={dados.oab} onChange={(e) => setDados({ ...dados, oab: e.target.value })} />
          </Field>
          <Field label="E-mail de acesso" htmlFor="p-email" hint="Para trocar o e-mail, crie uma nova conta e exporte seus dados." className="sm:col-span-2">
            <Input id="p-email" value={usuario.email} disabled />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" disabled={!alterado} onClick={() => setDados({ nome: usuario.nome, escritorio: usuario.escritorio ?? "", oab: usuario.oab ?? "" })}>
              Descartar
            </Button>
            <Button type="submit" loading={salvando} disabled={!alterado} icon={<Save className="h-4 w-4" />}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
