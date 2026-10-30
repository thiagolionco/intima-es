import { metadadosDaPagina, PaginaSite } from "@/components/site/pagina-site";
import { paginaPublicaObrigatoria } from "@/lib/publico/conteudo";

const pagina = paginaPublicaObrigatoria("/privacidade");

export const metadata = metadadosDaPagina(pagina);

export default function PrivacidadePage() {
  return <PaginaSite pagina={pagina} />;
}
