/** Executado uma vez quando o servidor Next sobe. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarAgendador } = await import("./server/rondas/agendador");
    iniciarAgendador();
  }
}
