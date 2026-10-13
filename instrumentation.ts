/**
 * Executado uma vez quando o servidor Next sobe. Na Vercel o servidor não fica ligado entre
 * requisições, então as rondas vêm de fora: .github/workflows/rondas.yml chama /api/rondas/*.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { iniciarAgendador } = await import("./server/rondas/agendador");
    iniciarAgendador();
  }
}
