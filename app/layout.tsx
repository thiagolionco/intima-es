import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { SessaoProvider } from "@/lib/auth/sessao";

export const metadata: Metadata = {
  title: { default: "Controle de Intimações", template: "%s · Controle de Intimações" },
  description: "Acompanhe as intimações do Comunica PJe da sua carteira de clientes.",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ToastProvider>
          <SessaoProvider>{children}</SessaoProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
