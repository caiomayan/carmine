// Páginas do site (renderização no servidor): Home, Ranking e Perfil, por N visitantes simultâneos. Mede o HTML
// renderizado, que passa pelo web, pela API e pelo banco; os arquivos estáticos (JS, CSS, imagens) não entram,
// porque a Cloudflare os serve e a VM nunca os vê em quantidade.
//
//   k6 run -e BASE_URL=... -e PASSO=50 -e P95_MS=1500 k6/paginas.js

import { check } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';
import {
  BASE_URL,
  cabecalhos,
  cenarioDaSonda,
  escada,
  limiares,
  P95_MS,
  PASSO,
  resumo,
  TENDENCIAS,
} from './lib/comum.js';
import { pensa, perfisParaVisitar, sorteia } from './lib/visitante.js';

export { sondaDaProducao } from './lib/comum.js';

const PAGINAS = ['home', 'ranking', 'perfil'];
const paginaValida = new Rate('pagina_valida');

export const options = {
  scenarios: { ...escada('visitante', PASSO), ...cenarioDaSonda() },
  thresholds: limiares(
    [
      ...PAGINAS.map((endpoint) => ({
        metrica: `http_req_duration{scenario:carga,endpoint:${endpoint}}`,
        expr: `p(95)<${P95_MS}`,
      })),
      { metrica: 'pagina_valida', expr: 'rate>0.99' },
    ],
    PAGINAS.map((endpoint) => `http_req_duration{scenario:carga,endpoint:${endpoint}}`),
  ),
  summaryTrendStats: TENDENCIAS,
};

export function setup() {
  return { perfis: perfisParaVisitar() };
}

function abre(caminho, endpoint) {
  const resposta = http.get(`${BASE_URL}${caminho}`, {
    headers: cabecalhos({ accept: 'text/html' }),
    tags: { endpoint },
    timeout: '30s',
  });
  // 200 e HTML de verdade (o Access devolve uma página de login com 200 se o token estiver errado).
  const ok = check(resposta, {
    'status 200': (r) => r.status === 200,
    'é a página do Carmine': (r) =>
      (r.body || '').includes('<html') && !(r.body || '').includes('cloudflareaccess'),
  });
  paginaValida.add(ok);
}

export function visitante(dados) {
  abre('/', 'home');
  pensa(2, 5);
  abre('/ranking', 'ranking');
  if (dados.perfis.length > 0) {
    pensa(2, 5);
    abre(`/${sorteia(dados.perfis)}`, 'perfil');
  }
  pensa(3, 8);
}

export function handleSummary(data) {
  return resumo(data, 'paginas');
}
