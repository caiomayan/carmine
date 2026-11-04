// O que a leitura da API e as páginas dividem: a lista de Perfis para visitar e a pausa entre cliques.

import { sleep } from 'k6';
import http from 'k6/http';
import { BASE_URL, cabecalhos } from './comum.js';

/**
 * Os IDs públicos dos Perfis com Estatísticas, tirados do Ranking dos dois Modos (roda uma vez, no `setup`).
 * Sem Ranking, não há o que visitar: o roteiro avisa e segue só com as outras rotas.
 */
export function perfisParaVisitar() {
  const ids = new Set();
  for (const modo of ['retake', 'deathmatch']) {
    const resposta = http.get(`${BASE_URL}/api/ranking/${modo}`, { headers: cabecalhos() });
    if (resposta.status !== 200) continue;
    for (const entrada of resposta.json('entries') || []) {
      if (entrada.publicId) ids.add(entrada.publicId);
    }
  }
  if (ids.size === 0)
    console.warn('Ranking vazio: sem Perfis para visitar, só as outras rotas serão medidas');
  return [...ids];
}

export function sorteia(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

/** Pausa de uma pessoa entre dois cliques: de `min` a `max` segundos. */
export function pensa(min = 2, max = 5) {
  sleep(min + Math.random() * (max - min));
}
