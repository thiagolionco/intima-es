import { chaveDeduplicacao } from "./comunica.ts";
import type { Intimacao } from "./types.ts";

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Mescla três versões de uma lista de registros com `id`: a que o navegador tinha da última vez que
 * falou com o servidor (`base`), a que está na tela agora (`local`) e a que está no servidor.
 *
 * Usada quando outra aba, outro dispositivo ou a ronda automática gravou antes: o que foi mexido
 * aqui vence, o que só mudou lá é mantido, e nada que alguém acrescentou se perde.
 */
export function mesclarListas<T extends { id: string }>(base: T[], local: T[], servidor: T[]): T[] {
  const mapaBase = new Map(base.map((x) => [x.id, x]));
  const mapaLocal = new Map(local.map((x) => [x.id, x]));
  const idsServidor = new Set(servidor.map((x) => x.id));

  // Acrescentados aqui desde a última sincronização, na ordem em que estão na tela.
  const novosAqui = local.filter((x) => !mapaBase.has(x.id) && !idsServidor.has(x.id));
  const resultado: T[] = [...novosAqui];
  for (const s of servidor) {
    const l = mapaLocal.get(s.id);
    const b = mapaBase.get(s.id);
    if (!l) {
      // Sumiu daqui: se existia na base, foi excluído aqui; se não, é novo do servidor.
      if (!b) resultado.push(s);
      continue;
    }
    resultado.push(b && !igual(l, b) ? l : s);
  }
  return resultado;
}

/** Remove comunicações repetidas (a mesma importada aqui e pela ronda), mantendo a primeira. */
export function semDuplicadas(lista: Intimacao[]): Intimacao[] {
  const vistas = new Set<string>();
  return lista.filter((i) => {
    if (i.origem !== "comunica") return true;
    const k = chaveDeduplicacao(i);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}
