// Leitura da API por N visitantes simultâneos: `/api/me`, lista de Servidores, Ranking e Perfil, mais o stream
// de Servidores ao vivo aberto por cada visitante (toda página aberta mantém um) e uma frota de servidores de
// fundo batendo o coração, para a lista ter o tamanho e o movimento de um dia cheio.
//
//   k6 run -e BASE_URL=... -e PASSO=100 -e P95_MS=800 -e KEYS_FILE=chaves.txt k6/api.js
//
// Limites do modelo (docs/operacao/teste-de-carga.md): sem sessão, `/api/me` responde 401 pelo caminho barato;
// o k6 não consome SSE, então o stream é medido pela conexão aberta e segura (tempo até o primeiro byte e
// quantas ficam de pé), não pelos eventos recebidos.

import { sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';
import { criaServidor } from '../lib/eventos.mjs';
import {
  BASE_URL,
  cabecalhos,
  cenarioDaSonda,
  duracaoTotalS,
  escada,
  limiares,
  P95_MS,
  PASSO,
  resumo,
  TENDENCIAS,
} from './lib/comum.js';
import { pensa, perfisParaVisitar, sorteia } from './lib/visitante.js';

export { sondaDaProducao } from './lib/comum.js';

const E = __ENV;
/** Servidores de fundo (batimento a cada 10 s); 0 desliga. */
const FUNDO = Number(E.FUNDO || 40);
/** Quanto cada conexão do stream fica aberta antes de reconectar. */
const STREAM_S = Number(E.STREAM_S || 60);
const CHAVES = E.KEYS_FILE
  ? open(E.KEYS_FILE)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  : [];
if (FUNDO > 0 && CHAVES.length < FUNDO) {
  throw new Error(
    `FUNDO=${FUNDO}, mas KEYS_FILE tem ${CHAVES.length} chaves (use -e FUNDO=0 para desligar)`,
  );
}

const streamAberto = new Rate('stream_aberto');
const ENDPOINTS = ['me', 'servidores', 'ranking', 'perfil'];

export const options = {
  scenarios: {
    ...escada('visitante', PASSO),
    ...escada('conexao', PASSO, 'stream'),
    ...(FUNDO > 0
      ? {
          fundo: {
            executor: 'constant-vus',
            exec: 'frotaDeFundo',
            vus: 1,
            duration: `${duracaoTotalS()}s`,
            gracefulStop: '10s',
          },
        }
      : {}),
    ...cenarioDaSonda(),
  },
  thresholds: limiares(
    [
      ...ENDPOINTS.map((endpoint) => ({
        metrica: `http_req_duration{scenario:carga,endpoint:${endpoint}}`,
        expr: `p(95)<${P95_MS}`,
      })),
      { metrica: 'stream_aberto', expr: 'rate>0.99' },
    ],
    ENDPOINTS.map((endpoint) => `http_req_duration{scenario:carga,endpoint:${endpoint}}`),
  ),
  summaryTrendStats: TENDENCIAS,
  batchPerHost: 20,
};

export function setup() {
  return { perfis: perfisParaVisitar() };
}

export function visitante(dados) {
  const params = (endpoint, extra = {}) => ({
    headers: cabecalhos(),
    tags: { endpoint },
    ...extra,
  });
  // Sem sessão o /api/me responde 401: é o esperado, não erro.
  http.get(`${BASE_URL}/api/me`, params('me', { responseCallback: http.expectedStatuses(401) }));
  pensa(1, 3);
  http.get(`${BASE_URL}/api/servers`, params('servidores'));
  pensa(1, 3);
  http.get(
    `${BASE_URL}/api/ranking/${Math.random() < 0.7 ? 'retake' : 'deathmatch'}`,
    params('ranking'),
  );
  pensa(2, 5);
  http.get(`${BASE_URL}/api/profiles/${sorteia(dados.perfis)}`, params('perfil'));
  pensa(2, 5);
}

/** Cada VU mantém uma conexão do stream aberta e reconecta quando o tempo acaba. */
export function conexao() {
  const resposta = http.get(`${BASE_URL}/api/servers/live`, {
    headers: cabecalhos({ accept: 'text/event-stream' }),
    tags: { endpoint: 'stream' },
    // O stream não termina sozinho: o fim por tempo é o esperado, e o que conta é ter conectado.
    timeout: `${STREAM_S}s`,
    responseCallback: http.expectedStatuses(200, { min: 0, max: 0 }),
  });
  // Conectou = chegou o cabeçalho (200) antes do fim por tempo; 429/5xx/recusa são falha de verdade.
  const conectou =
    resposta.status === 200 ||
    (resposta.status === 0 && resposta.error_code === 1050 && resposta.timings.waiting > 0);
  streamAberto.add(conectou);
  if (!conectou) sleep(2);
}

/**
 * A frota de fundo: uma VU manda o batimento de FUNDO servidores a cada 10 s (em paralelo), o que mantém a
 * lista de Servidores ao vivo grande e em movimento, como num dia cheio. Os SteamID64 dos jogadores
 * são os dos servidores `carga-001...`, que o roteiro da coleta usa em outra execução.
 */
let frota = null;
export function frotaDeFundo() {
  const inicio = Date.now();
  if (frota === null) {
    frota = Array.from({ length: FUNDO }, (_, i) => ({
      sim: criaServidor({ indice: i + 1, rng: Math.random }),
      chave: CHAVES[i],
    }));
  }
  http.batch(
    frota.map(({ sim, chave }) => [
      'POST',
      `${BASE_URL}/api/server/heartbeat`,
      JSON.stringify(sim.batimento()),
      {
        headers: cabecalhos({
          'content-type': 'application/json',
          authorization: `Bearer ${chave}`,
        }),
        tags: { endpoint: 'fundo' },
      },
    ]),
  );
  sleep(Math.max(0, 10 - (Date.now() - inicio) / 1000));
}

export function handleSummary(data) {
  return resumo(data, 'api');
}
