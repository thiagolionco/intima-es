/**
 * Política de senha compartilhada entre o navegador (medidor em tempo real) e o servidor
 * (validação definitiva). Função pura, sem dependências.
 */

export interface RequisitoSenha {
  id: string;
  rotulo: string;
  ok: boolean;
}

export interface AvaliacaoSenha {
  /** 0 (muito fraca) a 4 (excelente). */
  pontuacao: 0 | 1 | 2 | 3 | 4;
  rotulo: string;
  requisitos: RequisitoSenha[];
  valida: boolean;
}

export const SENHA_MINIMO = 10;
export const SENHA_MAXIMO = 128;

const COMUNS = [
  "123456",
  "senha",
  "password",
  "qwerty",
  "abc123",
  "111111",
  "admin",
  "brasil",
  "iloveyou",
  "intimac",
  "advogad",
  "juridic",
];

const ROTULOS = ["Muito fraca", "Fraca", "Razoável", "Forte", "Excelente"] as const;

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function avaliarSenha(senha: string, contexto: { email?: string; nome?: string } = {}): AvaliacaoSenha {
  const n = normalizar(senha);
  const pedacosPessoais = [contexto.email?.split("@")[0], ...(contexto.nome?.split(/\s+/) ?? [])]
    .map((p) => normalizar(p ?? ""))
    .filter((p) => p.length >= 4);

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(senha)).length;

  const requisitos: RequisitoSenha[] = [
    { id: "tamanho", rotulo: `Pelo menos ${SENHA_MINIMO} caracteres`, ok: senha.length >= SENHA_MINIMO && senha.length <= SENHA_MAXIMO },
    { id: "letras", rotulo: "Letras maiúsculas e minúsculas", ok: /[a-z]/.test(senha) && /[A-Z]/.test(senha) },
    { id: "numero", rotulo: "Ao menos um número", ok: /\d/.test(senha) },
    { id: "simbolo", rotulo: "Ao menos um símbolo (!@#…)", ok: /[^A-Za-z0-9]/.test(senha) },
    {
      id: "pessoal",
      rotulo: "Não contém seu nome, e-mail ou senhas comuns",
      ok: senha.length > 0 && !pedacosPessoais.some((p) => n.includes(p)) && !COMUNS.some((c) => n.includes(c)),
    },
  ];

  const obrigatorios = requisitos.filter((r) => r.id !== "simbolo");
  const valida = obrigatorios.every((r) => r.ok) && classes >= 3;

  let pontos = 0;
  if (senha.length >= 8) pontos++;
  if (senha.length >= SENHA_MINIMO) pontos++;
  if (senha.length >= 14) pontos++;
  pontos += Math.max(0, classes - 2);
  if (/(.)\1{2,}/.test(senha)) pontos--;
  if (!requisitos[4].ok) pontos = Math.min(pontos, 1);
  if (!valida) pontos = Math.min(pontos, 2);
  const pontuacao = Math.max(0, Math.min(4, pontos)) as AvaliacaoSenha["pontuacao"];

  return { pontuacao, rotulo: senha ? ROTULOS[pontuacao] : "", requisitos, valida };
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && email.length <= 254;
}
