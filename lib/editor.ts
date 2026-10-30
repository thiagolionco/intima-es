/** Ações da IA no editor do parecer (a parte "Word" do Legora, dentro do Clepsa). */
export type AcaoEditor = "revisar" | "melhorar" | "anonimizar" | "traduzir";

export const ACAO_EDITOR_LABEL: Record<AcaoEditor, string> = {
  revisar: "Revisar o parecer",
  melhorar: "Melhorar a redação",
  anonimizar: "Anonimizar",
  traduzir: "Traduzir",
};

export interface SugestaoEditor {
  id: string;
  /** Trecho exato do texto que sai. */
  original: string;
  novo: string;
  motivo: string;
}

/** Idiomas da tradução. */
export const IDIOMA_LABEL: Record<string, string> = { en: "inglês", es: "espanhol", fr: "francês", it: "italiano", de: "alemão" };

export const LIMITES_EDITOR = { texto: 50_000, sugestoes: 40 } as const;

/** Aplica uma troca; devolve null se o trecho original não estiver mais no texto. */
export function aplicarSugestao(texto: string, s: Pick<SugestaoEditor, "original" | "novo">): string | null {
  const i = texto.indexOf(s.original);
  if (i < 0) return null;
  return texto.slice(0, i) + s.novo + texto.slice(i + s.original.length);
}
