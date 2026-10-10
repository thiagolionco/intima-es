/** Abstração do relógio: permite testar expirações sem esperar o tempo passar. */
export interface Clock {
  agora(): Date;
}

export const relogioDoSistema: Clock = { agora: () => new Date() };

export const MINUTO = 60_000;
export const HORA = 60 * MINUTO;
export const DIA = 24 * HORA;
