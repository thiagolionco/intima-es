import type { Metadata } from "next";
import { PortalDoCliente } from "@/components/publico/portal-cliente";

export const metadata: Metadata = { title: "Seus processos", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <PortalDoCliente token={(await params).token} />;
}
