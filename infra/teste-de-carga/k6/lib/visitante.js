// O que a leitura da API e as páginas dividem: a lista de Perfis para visitar e a pausa entre cliques.

import { sleep } from 'k6';
import http from 'k6/http';
import { idsDoRanking } from '../../lib/perfis.mjs';
import { BASE_URL, cabecalhos } from './comum.js';

/**
 * Os IDs públicos dos Perfis com Estatísticas, tirados do Ranking dos dois Modos (roda uma vez, no `setup`).
 * `PERFIS=1,2,3` fixa a lista à mão. Sem nenhum Perfil o roteiro para: é defeito do ambiente (rode a coleta
 * ou o seed antes), não resultado. Pular o Perfil em silêncio foi o que deixou a rodada 1 sem medi-lo.
 */
export function perfisParaVisitar() {
  const fixos = (__ENV.PERFIS || '')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (fixos.length > 0) return fixos;
  const ids = new Set();
  for (const modo of ['retake', 'deathmatch']) {
    const resposta = http.get(`${BASE_URL}/api/ranking/${modo}`, { headers: cabecalhos() });
    if (resposta.status !== 200) continue;
    for (const id of idsDoRanking(resposta.json())) ids.add(id);
  }
  if (ids.size === 0)
    throw new Error(
      'Ranking sem Perfis para visitar: rode a coleta antes (ou o seed da homologação), ou passe PERFIS=1,2,3',
    );
  return [...ids];
}

export function sorteia(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

/** Pausa de uma pessoa entre dois cliques: de `min` a `max` segundos. */
export function pensa(min = 2, max = 5) {
  sleep(min + Math.random() * (max - min));
}
