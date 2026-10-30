import { CONTATO, DESCRICAO, NOME, URL_DO_SITE, urlAbsoluta } from "./site.ts";

/**
 * Dados estruturados (schema.org em JSON-LD) da página inicial. Contato e endereço só entram
 * quando estiverem definidos em CONTATO (lib/publico/site.ts).
 */
export function dadosEstruturados(): Record<string, unknown> {
  const idOrganizacao = `${URL_DO_SITE}/#organizacao`;
  const organizacao: Record<string, unknown> = {
    "@type": "Organization",
    "@id": idOrganizacao,
    name: NOME,
    url: urlAbsoluta("/"),
    logo: urlAbsoluta("/icon.svg"),
    description: DESCRICAO,
  };
  if (CONTATO.email || CONTATO.telefone) {
    organizacao.contactPoint = {
      "@type": "ContactPoint",
      contactType: "customer support",
      availableLanguage: "Portuguese",
      ...(CONTATO.email ? { email: CONTATO.email } : {}),
      ...(CONTATO.telefone ? { telephone: CONTATO.telefone } : {}),
    };
  }
  if (CONTATO.endereco) {
    organizacao.address = {
      "@type": "PostalAddress",
      streetAddress: CONTATO.endereco.rua,
      addressLocality: CONTATO.endereco.cidade,
      addressRegion: CONTATO.endereco.estado,
      postalCode: CONTATO.endereco.cep,
      addressCountry: CONTATO.endereco.pais,
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      organizacao,
      {
        "@type": "WebSite",
        "@id": `${URL_DO_SITE}/#site`,
        name: NOME,
        url: urlAbsoluta("/"),
        inLanguage: "pt-BR",
        publisher: { "@id": idOrganizacao },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${URL_DO_SITE}/#aplicativo`,
        name: NOME,
        url: urlAbsoluta("/"),
        description: DESCRICAO,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Gestão de intimações e prazos jurídicos",
        operatingSystem: "Web",
        inLanguage: "pt-BR",
        audience: { "@type": "BusinessAudience", audienceType: "Escritórios de advocacia" },
        featureList: [
          "Busca automática de intimações no Comunica PJe (DJEN)",
          "Controle de prazos com responsável e aviso por e-mail",
          "Andamentos de processos pelo DataJud (CNJ)",
          "Equipe com papéis e dados separados por escritório",
        ],
        publisher: { "@id": idOrganizacao },
      },
    ],
  };
}

/** JSON seguro para ir dentro de <script>: "<" escapado impede fechar a tag. */
export function jsonParaScript(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, "\\u003c");
}
