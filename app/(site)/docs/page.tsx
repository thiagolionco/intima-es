import { metadadosDaPagina, PaginaSite } from "@/components/site/pagina-site";
import { paginaPublicaObrigatoria } from "@/lib/publico/conteudo";

const pagina = paginaPublicaObrigatoria("/docs");

export const metadata = metadadosDaPagina(pagina);

export default function DocsPage() {
  return <PaginaSite pagina={pagina} />;
}
