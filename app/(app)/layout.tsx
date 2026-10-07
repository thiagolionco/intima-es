import { AreaAutenticada } from "@/components/auth/area-autenticada";

export default function LayoutAplicacao({ children }: { children: React.ReactNode }) {
  return <AreaAutenticada>{children}</AreaAutenticada>;
}
