import { HORA, MINUTO } from "../core/clock.ts";
import { container } from "../container.ts";

const g = globalThis as typeof globalThis & { __agendadorClepsa?: boolean };

/** Os avisos de prazo são conferidos de hora em hora; cada conta escolhe a hora do envio. */
function agendarAvisos() {
  const rodar = async () => {
    try {
      const r = await container().avisos.rodar();
      if (r.emails) console.info(`[avisos] ${r.emails} e-mail(s) de prazo enviado(s).`);
    } catch (e) {
      console.error("[avisos] falhou:", e);
    }
    // Na mesma hora, acerta a Google Agenda (prazos que mudaram pela busca automática ou pelo link do e-mail).
    await container()
      .agenda.rodar()
      .catch((e) => console.error("[agenda] falhou:", e));
  };
  setTimeout(rodar, 3 * MINUTO).unref?.();
  setInterval(rodar, HORA).unref?.();
}

/** Andamentos no DataJud: uma passada a cada 6 horas, mas cada processo só é consultado uma vez por dia. */
function agendarDataJud() {
  const rodar = async () => {
    try {
      const r = await container().movimentacoes.rodarTodos();
      if (r.consultados) console.info(`[datajud] ${r.consultados} processo(s) consultado(s), ${r.novos} andamento(s) novo(s), ${r.erros} erro(s).`);
    } catch (e) {
      console.error("[datajud] falhou:", e);
    }
  };
  setTimeout(rodar, 5 * MINUTO).unref?.();
  setInterval(rodar, 6 * HORA).unref?.();
}

/**
 * Roda a busca automática no próprio processo do servidor: alguns minutos depois de subir e
 * depois a cada RONDA_COMUNICA_INTERVALO_HORAS. Para um agendador externo, use POST /api/rondas/comunica.
 */
export function iniciarAgendador() {
  if (g.__agendadorClepsa) return;
  g.__agendadorClepsa = true;
  const { config } = container();
  agendarAvisos();
  if (config.datajud.rondaLigada) agendarDataJud();
  else console.info("[datajud] consulta automática desligada (RONDA_DATAJUD).");
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
