import type { MetadataRoute } from "next";
import { entradasDoSitemap } from "@/lib/publico/arquivos";

export default function sitemap(): MetadataRoute.Sitemap {
  return entradasDoSitemap();
}
