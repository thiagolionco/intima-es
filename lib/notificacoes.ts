/**
 * Sino de notificações: o que pede atenção agora, calculado do que a tela já tem
 * (intimações e Selo de Vigília). Nada é guardado: some quando o problema some.
 */
import { type ResumoCobertura, seloDeVigilia } from "./cobertura.ts";
import { aberta, urgencia } from "./hoje.ts";
import type { Intimacao } from "./types.ts";

export interface Notificacao {
  id: string;
  tom: "alerta" | "atencao" | "info";
  titulo: string;
  detalhe: string;
  href: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function notificacoes(intimacoes: Intimacao[], cobertura: ResumoCobertura | undefined, hoje: string, agora: Date): Notificacao[] {
  const lista: Notificacao[] = [];

  if (cobertura) {
    const selo = seloDeVigilia(cobertura, agora);
    if (selo.tom === "alerta" || selo.tom === "atencao") lista.push({ id: "vigilia", tom: selo.tom, titulo: selo.texto, detalhe: selo.detalhe, href: "/clientes" });
  }

  const abertas = intimacoes.filter((i) => i.prazo && aberta(i));
  const vencidos = abertas.filter((i) => urgencia(i.prazo!, hoje).nivel === "vencido").length;
  const hojeN = abertas.filter((i) => urgencia(i.prazo!, hoje).nivel === "hoje").length;
  const amanha = abertas.filter((i) => urgencia(i.prazo!, hoje).nivel === "amanha").length;
  if (vencidos) lista.push({ id: "vencidos", tom: "alerta", titulo: `${plural(vencidos, "prazo vencido", "prazos vencidos")}`, detalhe: "Intimações abertas com o prazo já passado.", href: "/hoje" });
  if (hojeN) lista.push({ id: "hoje", tom: "alerta", titulo: `${plural(hojeN, "prazo vence", "prazos vencem")} hoje`, detalhe: "Intimações abertas com prazo final hoje.", href: "/hoje" });
  if (amanha) lista.push({ id: "amanha", tom: "atencao", titulo: `${plural(amanha, "prazo vence", "prazos vencem")} amanhã`, detalhe: "Intimações abertas com prazo final amanhã.", href: "/hoje" });

  const novas = intimacoes.filter((i) => i.status === "nova").length;
  if (novas) lista.push({ id: "novas", tom: "info", titulo: `${plural(novas, "intimação nova", "intimações novas")}`, detalhe: "Ainda sem análise.", href: "/intimacoes" });

  return lista;
}
