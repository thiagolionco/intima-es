import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { SessaoProvider } from "@/lib/auth/sessao";

export const metadata: Metadata = {
  title: { default: "Clepsa", template: "%s · Clepsa" },
  description: "Acompanhe as intimações do Comunica PJe da sua carteira de clientes.",
};

export const viewport: Viewport = {
  themeColor: "#050a18",
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
