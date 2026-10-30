import { metadadosDaPagina, PaginaSite } from "@/components/site/pagina-site";
import { paginaPublicaObrigatoria } from "@/lib/publico/conteudo";

const pagina = paginaPublicaObrigatoria("/contato");

export const metadata = metadadosDaPagina(pagina);

export default function ContatoPage() {
  return <PaginaSite pagina={pagina} />;
}
