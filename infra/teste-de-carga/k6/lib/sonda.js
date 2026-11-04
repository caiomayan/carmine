// A sonda da produção: roda junto com o teste (homologação e produção dividem a mesma VM) e ABORTA o teste
// se a produção piorar. Pede a Home (SSR, que passa por web, API e banco) e /api/health a cada 5 s, no máximo
// 24 pedidos por minuto ao todo, do mesmo IP do teste.
//
// Regra: nos primeiros SONDA_BASELINE_S segundos (antes da carga) mede a Home sem carga; o limite é a maior
// entre SONDA_FATOR vezes a mediana do baseline e SONDA_PISO_MS. Depois, aborta se:
//   - a mediana das últimas SONDA_JANELA Homes passar do limite; ou
//   - SONDA_FALHAS pedidos seguidos falharem (status fora de 2xx, timeout).
// Não usa limiar do k6 de propósito: ele agrega o teste todo e diluiria uma degradação recente.

import { sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

const E = __ENV;
const PROD_URL = (E.PROD_URL || '').replace(/\/+$/, '');
const BASELINE_S = Number(E.SONDA_BASELINE_S || 20);
const FATOR = Number(E.SONDA_FATOR || 3);
const PISO_MS = Number(E.SONDA_PISO_MS || 1000);
const JANELA = Number(E.SONDA_JANELA || 6);
const FALHAS = Number(E.SONDA_FALHAS || 3);
const HOME = E.SONDA_HOME || '/';
const INTERVALO_S = 5;

const homeMs = new Trend('sonda_home_ms', true);
const abortos = new Counter('sonda_abortos');

const baseline = [];
const janela = [];
let inicio = 0;
let limite = null;
let falhasSeguidas = 0;

function mediana(lista) {
  const ordem = [...lista].sort((a, b) => a - b);
  return ordem[Math.floor(ordem.length / 2)];
}

function pede(caminho, etiqueta) {
  return http.get(`${PROD_URL}${caminho}`, {
    timeout: '8s',
    tags: { endpoint: etiqueta },
    headers: { 'user-agent': 'carmine-teste-de-carga-sonda/1', 'cache-control': 'no-cache' },
  });
}

function aborta(motivo) {
  abortos.add(1);
  console.error(`SONDA: ${motivo}. Abortando o teste para proteger a produção.`);
  exec.test.abort(`sonda da produção: ${motivo}`);
}

export function sonda() {
  if (inicio === 0) inicio = Date.now();
  const decorrido = (Date.now() - inicio) / 1000;
  const home = pede(`${HOME}?sonda=${Math.floor(decorrido)}`, 'sonda_home');
  const saude = pede('/api/health', 'sonda_saude');
  const bem = (r) => r.status >= 200 && r.status < 300;

  if (bem(home) && bem(saude)) {
    falhasSeguidas = 0;
    const ms = home.timings.duration;
    homeMs.add(ms);
    if (decorrido < BASELINE_S) {
      baseline.push(ms);
    } else {
      if (limite === null) {
        if (baseline.length === 0)
          return aborta('sem baseline da produção (nenhum pedido deu certo)');
        limite = Math.max(mediana(baseline) * FATOR, PISO_MS);
        console.log(
          `sonda: baseline da Home ${mediana(baseline).toFixed(0)} ms; limite ${limite.toFixed(0)} ms`,
        );
      }
      janela.push(ms);
      if (janela.length > JANELA) janela.shift();
      if (janela.length === JANELA && mediana(janela) > limite) {
        return aborta(
          `a Home da produção passou de ${limite.toFixed(0)} ms (mediana ${mediana(janela).toFixed(0)} ms)`,
        );
      }
    }
  } else {
    falhasSeguidas += 1;
    if (falhasSeguidas >= FALHAS) {
      return aborta(
        `${falhasSeguidas} pedidos seguidos à produção falharam (Home ${home.status}, saúde ${saude.status})`,
      );
    }
  }
  sleep(INTERVALO_S);
  return undefined;
}
