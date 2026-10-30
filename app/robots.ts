import type { MetadataRoute } from "next";
import { urlAbsoluta } from "@/lib/publico/site";

/** O site público é indexável; a API e as ferramentas de desenvolvimento ficam de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dev/"] },
    sitemap: urlAbsoluta("/sitemap.xml"),
  };
}
