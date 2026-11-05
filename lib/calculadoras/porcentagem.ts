import { centavos, numeroBR, pct, type Linha } from "./base.ts";

export type ModoPorcentagem = "parte" | "quantos" | "variacao" | "acrescimo" | "desconto" | "original";

export const MODOS_PORCENTAGEM: { id: ModoPorcentagem; rotulo: string; a: string; b: string }[] = [
  { id: "parte", rotulo: "Quanto é X% de um valor", a: "Percentual (%)", b: "Valor" },
  { id: "quantos", rotulo: "Um valor é quantos % de outro", a: "Parte", b: "Total" },
  { id: "variacao", rotulo: "Variação de um valor para outro", a: "Valor inicial", b: "Valor final" },
  { id: "acrescimo", rotulo: "Valor com acréscimo de X%", a: "Valor", b: "Acréscimo (%)" },
  { id: "desconto", rotulo: "Valor com desconto de X%", a: "Valor", b: "Desconto (%)" },
  { id: "original", rotulo: "Valor antes de um acréscimo de X%", a: "Valor com acréscimo", b: "Acréscimo (%)" },
];

export interface ResultadoPorcentagem {
  valor: number;
  texto: string;
  linhas: Linha[];
}

/** Contas de porcentagem. Devolve null quando a conta não existe (divisão por zero). */
export function calcularPorcentagem(modo: ModoPorcentagem, a: number, b: number): ResultadoPorcentagem | null {
  switch (modo) {
    case "parte": {
      const v = (a / 100) * b;
      return { valor: v, texto: numeroBR(v, 2), linhas: [{ rotulo: `${pct(a)} de ${numeroBR(b, 2)}`, valor: numeroBR(v, 2), conta: `${numeroBR(b, 2)} × ${numeroBR(a)} ÷ 100`, destaque: true }] };
    }
    case "quantos": {
      if (b === 0) return null;
      const v = (a / b) * 100;
      return { valor: v, texto: pct(v), linhas: [{ rotulo: `${numeroBR(a, 2)} em relação a ${numeroBR(b, 2)}`, valor: pct(v), conta: `${numeroBR(a, 2)} ÷ ${numeroBR(b, 2)} × 100`, destaque: true }] };
    }
    case "variacao": {
      if (a === 0) return null;
      const v = ((b - a) / Math.abs(a)) * 100;
      return {
        valor: v,
        texto: pct(v),
        linhas: [
          { rotulo: v >= 0 ? "Aumento" : "Redução", valor: pct(Math.abs(v)), conta: `(${numeroBR(b, 2)} − ${numeroBR(a, 2)}) ÷ ${numeroBR(Math.abs(a), 2)} × 100`, destaque: true },
          { rotulo: "Diferença", valor: numeroBR(b - a, 2) },
        ],
      };
    }
    case "acrescimo": {
      const v = a * (1 + b / 100);
      return { valor: v, texto: numeroBR(v, 2), linhas: [{ rotulo: "Acréscimo", valor: numeroBR(v - a, 2), conta: `${numeroBR(a, 2)} × ${numeroBR(b)}%` }, { rotulo: "Total", valor: numeroBR(v, 2), conta: `${numeroBR(a, 2)} × ${numeroBR(1 + b / 100, 6)}`, destaque: true }] };
    }
    case "desconto": {
      const v = a * (1 - b / 100);
      return { valor: v, texto: numeroBR(v, 2), linhas: [{ rotulo: "Desconto", valor: numeroBR(a - v, 2), conta: `${numeroBR(a, 2)} × ${numeroBR(b)}%` }, { rotulo: "Valor final", valor: numeroBR(v, 2), conta: `${numeroBR(a, 2)} × ${numeroBR(1 - b / 100, 6)}`, destaque: true }] };
    }
    case "original": {
      if (b === -100) return null;
      const v = a / (1 + b / 100);
      return {
        valor: v,
        texto: numeroBR(v, 2),
        linhas: [
          { rotulo: "Valor original", valor: numeroBR(v, 2), conta: `${numeroBR(a, 2)} ÷ ${numeroBR(1 + b / 100, 6)}`, destaque: true },
          { rotulo: "Parcela do acréscimo", valor: numeroBR(a - v, 2) },
        ],
      };
    }
  }
}

export { centavos };
