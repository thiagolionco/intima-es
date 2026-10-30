import type { Metadata } from "next";
import { FormularioPedidoPublico } from "@/components/publico/formulario-pedido";

export const metadata: Metadata = { title: "Fale com o escritório", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <FormularioPedidoPublico token={(await params).token} />;
}
