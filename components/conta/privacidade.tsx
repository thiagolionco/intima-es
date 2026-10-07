"use client";

import { Download, FileJson, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CampoSenha } from "@/components/auth/campos";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { api, ErroApi } from "@/lib/auth/api";
import { useUsuario } from "@/lib/auth/sessao";

export function AbaPrivacidade() {
  const usuario = useUsuario();
  const router = useRouter();
  const { toast } = useToast();
  const [modal, setModal] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<{ campo?: string; texto: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    setExcluindo(true);
    setErro(null);
    try {
      await api("/api/conta", { method: "DELETE", body: { senha, confirmacao } });
      window.location.assign("/entrar?excluida=1");
    } catch (e) {
      setErro({ campo: e instanceof ErroApi ? e.campo : undefined, texto: e instanceof Error ? e.message : "Erro." });
      setExcluindo(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Portabilidade dos seus dados" subtitle="Direito garantido pelo art. 18 da LGPD." />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <FileJson className="hidden h-10 w-10 shrink-0 rounded-xl bg-brand-50 p-2 text-brand-600 sm:block" />
          <p className="flex-1 text-sm text-slate-600">Baixe um arquivo JSON com tudo o que guardamos sobre você: perfil, sessões ativas, registro de atividade, intimações e clientes monitorados. Senhas e segredos nunca são incluídos.</p>
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={() => {
              window.location.assign("/api/conta/exportar");
              toast("Exportação iniciada", { descricao: "O download começará em instantes." });
              setTimeout(() => router.refresh(), 1500);
            }}
          >
            Baixar meus dados
          </Button>
        </div>
      </Card>

      <Card className="border-red-200">
        <CardHeader title={<span className="text-red-700">Zona de perigo</span>} subtitle="Ações permanentes, sem possibilidade de desfazer." />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Excluir conta</p>
            <p className="text-sm text-slate-500">Apaga a conta, todas as intimações, clientes, sessões e o histórico de atividade. Recomendamos baixar seus dados antes.</p>
          </div>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setModal(true)}>
            Excluir conta
          </Button>
        </div>
      </Card>

      <Modal
        open={modal}
        onClose={() => {
          setModal(false);
          setSenha("");
          setConfirmacao("");
          setErro(null);
        }}
        title="Excluir conta definitivamente"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={excluindo} disabled={!senha || confirmacao.trim().toLowerCase() !== usuario.email} onClick={excluir}>
              Excluir para sempre
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Esta ação não pode ser desfeita. Para confirmar, digite sua senha e o e-mail da conta.</p>
          <Field label="Senha" htmlFor="ex-senha" error={erro?.campo === "senha" ? erro.texto : undefined}>
            <CampoSenha id="ex-senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label={`Digite ${usuario.email}`} htmlFor="ex-email" error={erro && erro.campo !== "senha" ? erro.texto : undefined}>
            <Input id="ex-email" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="off" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
