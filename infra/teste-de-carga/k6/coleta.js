// Coleta por round: N Servidores Carmine de teste mandando batimento e eventos ao mesmo tempo, no ritmo do
// Carmine.Core (batimento a cada 10 s, descarga de eventos a cada 5 s). Cada VU é um servidor, com a chave
// própria (carga-001...), então o limite do balde `server` (por servidor) não é o gargalo: o gargalo medido é
// o ingest, o Postgres e o Valkey.
//
//   k6 run -e BASE_URL=... -e PASSO=50 -e P95_MS=1000 -e KEYS_FILE=chaves.txt k6/coleta.js
//
// Modelo (declarado em docs/operacao/teste-de-carga.md): Retake, 10 jogadores humanos por servidor, rounds
// de 75 s, ~8 abates e ~28 danos por round, com o contexto de round da S17 (posição, mapPlayId, bomba).

import { sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Rate } from 'k6/metrics';
import { criaServidor, totalDeEventos } from '../lib/eventos.mjs';
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

export { sondaDaProducao } from './lib/comum.js';

const E = __ENV;
const DESCARGA_S = Number(E.DESCARGA_S || 5);
const BATIMENTO_S = Number(E.BATIMENTO_S || 10);
const JOGADORES = Number(E.JOGADORES || 10);
const ROUND_S = Number(E.ROUND_S || 75);

if (!E.KEYS_FILE)
  throw new Error('KEYS_FILE é obrigatório: as chaves dos servidores, uma por linha');
const CHAVES = open(E.KEYS_FILE)
  .split('\n')
  .map((linha) => linha.trim())
  .filter(Boolean);
// Os ids das VUs (1..PASSO+1, a sonda leva um) são o índice do servidor: precisa de PASSO + 1 chaves.
if (CHAVES.length < PASSO + 1) {
  throw new Error(
    `o passo pede ${PASSO} servidores, mas ${E.KEYS_FILE} só tem ${CHAVES.length} chaves (precisa de ${PASSO + 1})`,
  );
}

const loteValido = new Rate('lote_valido');
const eventosEnviados = new Counter('eventos_enviados');

export const options = {
  scenarios: { ...escada('servidor', PASSO), ...cenarioDaSonda() },
  thresholds: limiares(
    [
      { metrica: 'http_req_duration{scenario:carga,endpoint:eventos}', expr: `p(95)<${P95_MS}` },
      { metrica: 'http_req_duration{scenario:carga,endpoint:batimento}', expr: `p(95)<${P95_MS}` },
      { metrica: 'lote_valido', expr: 'rate>0.99' },
    ],
    [
      'http_req_duration{scenario:carga,endpoint:eventos}',
      'http_req_duration{scenario:carga,endpoint:batimento}',
    ],
  ),
  summaryTrendStats: TENDENCIAS,
};

// Um servidor por VU, criado na primeira iteração (o estado da VU persiste entre iterações).
let sim = null;
let chave = null;
let ciclo = 0;

export function servidor() {
  const inicio = Date.now();
  if (sim === null) {
    const indice = exec.vu.idInTest;
    sim = criaServidor({
      indice,
      rng: Math.random,
      jogadores: JOGADORES,
      segundosPorRound: ROUND_S,
      segundosPorDescarga: DESCARGA_S,
    });
    chave = CHAVES[indice - 1];
    // Servidores de verdade não batem juntos: espalha o início dentro de uma descarga.
    sleep(Math.random() * DESCARGA_S);
  }
  const params = (endpoint) => ({
    headers: cabecalhos({ 'content-type': 'application/json', authorization: `Bearer ${chave}` }),
    tags: { endpoint },
    timeout: '15s',
  });

  if (ciclo % Math.max(1, Math.round(BATIMENTO_S / DESCARGA_S)) === 0) {
    http.post(
      `${BASE_URL}/api/server/heartbeat`,
      JSON.stringify(sim.batimento()),
      params('batimento'),
    );
  }
  const lote = sim.descarga(Date.now());
  const total = totalDeEventos(lote);
  if (total > 0) {
    const resposta = http.post(
      `${BASE_URL}/api/server/events`,
      JSON.stringify(lote),
      params('eventos'),
    );
    let aceito = false;
    if (resposta.status === 200) {
      try {
        const corpo = resposta.json();
        // accepted + duplicates é o tamanho do lote; accepted > 0 prova que o caminho caro foi percorrido.
        aceito = corpo.accepted + corpo.duplicates === total && corpo.accepted > 0;
      } catch (_) {
        aceito = false;
      }
    }
    loteValido.add(aceito);
    eventosEnviados.add(total);
  }
  ciclo += 1;
  sleep(Math.max(0, DESCARGA_S - (Date.now() - inicio) / 1000));
}

export function handleSummary(data) {
  return resumo(data, 'coleta');
}
