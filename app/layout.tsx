import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { SessaoProvider } from "@/lib/auth/sessao";
import { URL_DO_SITE } from "@/lib/publico/site";

export const metadata: Metadata = {
  title: { default: "Clepsa", template: "%s · Clepsa" },
  description: "Acompanhe as intimações do Comunica PJe da sua carteira de clientes.",
  metadataBase: new URL(URL_DO_SITE),
  openGraph: { type: "website", siteName: "Clepsa", locale: "pt_BR", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
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
