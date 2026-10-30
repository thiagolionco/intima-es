import { metadadosDaPagina, PaginaSite } from "@/components/site/pagina-site";
import { paginaPublicaObrigatoria } from "@/lib/publico/conteudo";

const pagina = paginaPublicaObrigatoria("/sobre");

export const metadata = metadadosDaPagina(pagina);

export default function SobrePage() {
  return <PaginaSite pagina={pagina} />;
}
