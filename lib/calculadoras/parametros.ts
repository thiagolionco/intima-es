/**
 * Valores oficiais que mudam todo ano. A tela mostra o valor usado e deixa o advogado trocar.
 * Ao virar o ano, acrescente a linha nova (decreto do salário mínimo e portaria do RGPS).
 */

/** Salário mínimo nacional por ano (vigência a partir de 1º de janeiro). */
export const SALARIO_MINIMO: Record<number, { valor: number; norma: string }> = {
  2022: { valor: 1212, norma: "Lei 14.358/2022" },
  2023: { valor: 1320, norma: "Lei 14.663/2023 (R$ 1.302,00 até 30/04/2023)" },
  2024: { valor: 1412, norma: "Decreto 11.864/2023" },
  2025: { valor: 1518, norma: "Decreto 12.342/2024" },
  2026: { valor: 1621, norma: "decreto presidencial de dezembro de 2025" },
};

/** Teto dos benefícios do RGPS (base do limite das custas trabalhistas, CLT art. 789). */
export const TETO_RGPS: Record<number, number> = {
  2022: 7087.22,
  2023: 7507.49,
  2024: 7786.02,
  2025: 8157.41,
  2026: 8475.55,
};

function doAno<T>(tabela: Record<number, T>, ano: number): T {
  const anos = Object.keys(tabela).map(Number).sort((a, b) => a - b);
  const escolhido = anos.filter((a) => a <= ano).pop() ?? anos[0];
  return tabela[escolhido];
}

export function salarioMinimo(ano: number): number {
  return doAno(SALARIO_MINIMO, ano).valor;
}

export function tetoRgps(ano: number): number {
  return doAno(TETO_RGPS, ano);
}

/** O ano mais recente cadastrado, para avisar quando a tabela ficar velha. */
export const ULTIMO_ANO_PARAMETROS = Math.max(...Object.keys(SALARIO_MINIMO).map(Number));

/** UFIR congelada em R$ 1,0641 (extinta pela MP 1.973-67/2000), usada na Lei 9.289/1996. */
export const UFIR = 1.0641;
