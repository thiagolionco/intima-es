import { NextResponse } from "next/server";
import { container } from "@/server/container";
import { AppError } from "@/server/core/errors";
import { rotaAdministrador } from "@/server/http/rota";

/** Desativa ou reativa a conta (`ativa`) e concede ou retira a administração (`administrador`). */
export const PATCH = rotaAdministrador<{ id: string }>(async ({ usuario, ctx, corpo }, { id }) => {
  const { ativa, administrador } = await corpo<{ ativa?: unknown; administrador?: unknown }>();
  if (ativa === undefined && administrador === undefined) throw new AppError("dados_invalidos", "Nada para alterar.");
  if (ativa !== undefined && typeof ativa !== "boolean") throw new AppError("dados_invalidos", "Informe se a conta fica ativa.");
  const { administracao } = container();
  if (ativa === true) await administracao.reativar(usuario.id, id, ctx);
  if (ativa === false) await administracao.desativar(usuario.id, id, ctx);
  if (administrador !== undefined) await administracao.definirAdministrador(usuario.id, id, administrador, ctx);
  return NextResponse.json({ ok: true });
});
