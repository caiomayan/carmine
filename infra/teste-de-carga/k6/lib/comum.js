// O que os três roteiros k6 (coleta, api, paginas) dividem: variáveis de ambiente, cabeçalhos do Cloudflare
// Access, a escada de um passo (ramp-up e patamar) e o resumo em JSON que o orquestrador lê.
//
// Um processo do k6 roda UM passo (N servidores ou N visitantes simultâneos). Quem sobe a escada
// (10, 25, 50...) é bin/escada.mjs, que roda um passo por vez e para no primeiro que estoura o limite. Assim
// os limiares do k6 valem só para o passo corrente, sem diluir nas amostras dos passos anteriores.
import { rotasSemRequisicao } from '../../lib/escada.mjs';
import { sonda } from './sonda.js';

const E = __ENV;

function numero(nome, padrao) {
  const valor = E[nome] === undefined || E[nome] === '' ? padrao : Number(E[nome]);
  if (!Number.isFinite(valor)) throw new Error(`${nome} precisa ser um número`);
  return valor;
}

export const BASE_URL = (E.BASE_URL || '').replace(/\/+$/, '');
export const PASSO = numero('PASSO', 1);
/** Subida até o patamar e tempo no patamar, em segundos. */
export const RAMPA_S = numero('RAMPA_S', 20);
export const SEGURA_S = numero('SEGURA_S', 120);
/** O limite combinado: p95 (ms) das rotas medidas e fração de erros que param o passo. */
export const P95_MS = numero('P95_MS', Number.NaN);
export const MAX_ERROS = numero('MAX_ERROS', 0.01);
export const PROD_URL = (E.PROD_URL || '').replace(/\/+$/, '');
export const BASELINE_S = PROD_URL ? numero('SONDA_BASELINE_S', 20) : 0;
export const SAIDA = E.SAIDA || '.';

if (!BASE_URL) throw new Error('BASE_URL é obrigatória (ex.: https://dev.stcarmine.com)');
if (!Number.isFinite(P95_MS)) throw new Error('P95_MS é obrigatória: o limite de p95 em ms');

/** Cabeçalhos de toda requisição: o service token do Access (se houver) e um User-Agent reconhecível. */
export function cabecalhos(extra = {}) {
  const base = { 'user-agent': 'carmine-teste-de-carga/1', ...extra };
  if (E.CF_ACCESS_CLIENT_ID && E.CF_ACCESS_CLIENT_SECRET) {
    base['CF-Access-Client-Id'] = E.CF_ACCESS_CLIENT_ID;
    base['CF-Access-Client-Secret'] = E.CF_ACCESS_CLIENT_SECRET;
  }
  return base;
}

/** O cenário de carga do passo: sobe até `vus` e segura. Começa depois do baseline da sonda. */
export function escada(funcao, vus, nome = 'carga') {
  return {
    [nome]: {
      executor: 'ramping-vus',
      exec: funcao,
      startVUs: 0,
      stages: [
        { duration: `${RAMPA_S}s`, target: vus },
        { duration: `${SEGURA_S}s`, target: vus },
      ],
      gracefulRampDown: '5s',
      gracefulStop: '15s',
      startTime: `${BASELINE_S}s`,
    },
  };
}

/** Do início do processo ao fim do patamar, com uma folga. */
export function duracaoTotalS() {
  return BASELINE_S + RAMPA_S + SEGURA_S + 5;
}

/** A sonda da produção, na mesma execução: dura o baseline mais a rampa e o patamar. */
export function cenarioDaSonda() {
  if (!PROD_URL) return {};
  return {
    sonda: {
      executor: 'constant-vus',
      exec: 'sondaDaProducao',
      vus: 1,
      duration: `${duracaoTotalS()}s`,
      gracefulStop: '10s',
    },
  };
}

export { sonda as sondaDaProducao };

/**
 * Os limiares do passo. Cada `limites[i]` é `{ metrica, expr }` (ex.: `http_req_duration{endpoint:eventos}`,
 * `p(95)<1000`). Todos abortam o passo (o k6 sai com 99) depois de RAMPA_S + 20 s, quando já há amostra
 * suficiente. Os `ver` só materializam submétricas no resumo.
 */
export function limiares(limites, ver = []) {
  const atraso = `${RAMPA_S + 20}s`;
  const saida = {};
  const poe = (metrica, entrada) => {
    saida[metrica] = [...(saida[metrica] || []), entrada];
  };
  for (const { metrica, expr } of limites) {
    poe(metrica, { threshold: expr, abortOnFail: true, delayAbortEval: atraso });
  }
  poe('http_req_failed{scenario:carga}', {
    threshold: `rate<${MAX_ERROS}`,
    abortOnFail: true,
    delayAbortEval: atraso,
  });
  poe('http_reqs{scenario:carga}', 'count>=0');
  for (const metrica of ver) {
    poe(metrica, 'max>=0');
    // Também o contador de requisições da rota, para o resumo provar que ela foi pedida.
    const rota = /^http_req_duration\{scenario:carga,endpoint:([^}]+)\}$/.exec(metrica);
    if (rota) poe(`http_reqs{scenario:carga,endpoint:${rota[1]}}`, 'count>=0');
  }
  return saida;
}

export const TENDENCIAS = ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];

function recorte(metrica) {
  const v = metrica.values;
  return {
    contagem: v.count,
    taxa: v.rate,
    media: v.avg,
    mediana: v.med,
    p90: v['p(90)'],
    p95: v['p(95)'],
    p99: v['p(99)'],
    max: v.max,
  };
}

/** `handleSummary`: grava `resultado-<grupo>-<passo>.json` e imprime uma linha por métrica de interesse. */
export function resumo(data, grupo) {
  const metricas = {};
  const violados = [];
  for (const [nome, metrica] of Object.entries(data.metrics)) {
    if (
      nome.startsWith('http_req_duration') ||
      nome.startsWith('http_req_failed') ||
      nome.startsWith('http_reqs') ||
      nome.startsWith('sonda_') ||
      nome.startsWith('lote_') ||
      nome.startsWith('pagina_') ||
      nome.startsWith('stream_') ||
      nome.startsWith('eventos_')
    ) {
      metricas[nome] = recorte(metrica);
    }
    for (const [expr, resultado] of Object.entries(metrica.thresholds || {})) {
      if (resultado.ok === false) violados.push(`${nome}: ${expr}`);
    }
  }
  const abortouPelaSonda = Boolean(metricas.sonda_abortos && metricas.sonda_abortos.contagem > 0);
  const semRequisicao = rotasSemRequisicao(metricas, grupo);
  for (const rota of semRequisicao) violados.push(`rota "${rota}" sem nenhuma requisição`);
  const resultado = {
    grupo,
    passo: PASSO,
    ok: violados.length === 0 && !abortouPelaSonda,
    semRequisicao,
    violados,
    abortouPelaSonda,
    limites: { p95Ms: P95_MS, maxErros: MAX_ERROS },
    duracaoMs: data.state?.testRunDurationMs,
    metricas,
  };
  const linhas = [
    `[${grupo} passo ${PASSO}] ${abortouPelaSonda ? 'ABORTADO PELA SONDA DA PRODUÇÃO' : resultado.ok ? 'dentro do limite' : 'ESTOUROU'}`,
  ];
  for (const [nome, m] of Object.entries(metricas)) {
    if (nome.startsWith('http_req_duration{endpoint:') && m.p95 !== undefined) {
      linhas.push(`  ${nome}: p95 ${m.p95.toFixed(0)} ms, p99 ${m.p99.toFixed(0)} ms`);
    }
  }
  for (const v of violados) linhas.push(`  violou ${v}`);
  return {
    [`${SAIDA}/resultado-${grupo}-${PASSO}.json`]: JSON.stringify(resultado, null, 2),
    stdout: `${linhas.join('\n')}\n`,
  };
}
