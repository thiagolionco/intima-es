import { HORA, MINUTO } from "../core/clock.ts";
import { container } from "../container.ts";

const g = globalThis as typeof globalThis & { __agendadorClepsa?: boolean };

/**
 * Roda a busca automática no próprio processo do servidor: alguns minutos depois de subir e
 * depois a cada RONDA_COMUNICA_INTERVALO_HORAS. Para um agendador externo, use POST /api/rondas/comunica.
 */
export function iniciarAgendador() {
  if (g.__agendadorClepsa) return;
  g.__agendadorClepsa = true;
  const { config } = container();
  if (!config.comunica.rondaLigada) {
    console.info("[ronda] busca automática desligada (RONDA_COMUNICA).");
    return;
  }
  const rodar = async () => {
    const inicio = Date.now();
    try {
      const r = await container().rondaComunica.todos();
      console.info(`[ronda] ${r.contas} conta(s), ${r.novas} intimação(ões) nova(s), ${r.erros} erro(s) em ${Math.round((Date.now() - inicio) / 1000)}s.`);
    } catch (e) {
      console.error("[ronda] falhou:", e);
    }
  };
  setTimeout(rodar, 2 * MINUTO).unref?.();
  setInterval(rodar, config.comunica.rondaIntervaloHoras * HORA).unref?.();
  console.info(`[ronda] busca automática a cada ${config.comunica.rondaIntervaloHoras}h.`);
}
