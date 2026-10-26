import { randomUUID } from 'node:crypto';
import { HEARTBEAT_INTERVAL_SECONDS } from '@carmine/contracts';
import { DEMO_SERVERS, demoServerKey } from './demo-cast.js';
import { createSimServer, tick } from './demo-match.js';

export interface SimulatorDeps {
  /** Onde fica a API pela rede interna (`http://api:3333`). */
  apiUrl: string;
  secret: string;
  log: (line: string) => void;
  /** Troca nos testes. */
  fetchFn?: typeof fetch;
  now?: () => Date;
  random?: () => number;
}

/**
 * Faz o papel dos Servidores Carmine da demonstração: a cada batimento (10 s) manda o estado e, quando
 * há partida, os eventos, pela API de verdade (`/api/server/heartbeat` e `/api/server/events`, com a
 * chave de cada servidor). Assim presença, atividade, Estatísticas e Ranking passam pelos mesmos
 * caminhos que na produção. Um processo leve: sem banco, sem Valkey, sem Nest.
 */
export async function simulate(deps: SimulatorDeps, signal: AbortSignal): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;
  const servers = DEMO_SERVERS.map((def) => ({
    state: createSimServer(def, now(), random),
    key: demoServerKey(deps.secret, def.name),
  }));
  const lastWarning = new Map<string, number>();

  const send = async (path: string, key: string, body: unknown, label: string) => {
    try {
      const response = await (deps.fetchFn ?? fetch)(`${deps.apiUrl}/api/server/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) return;
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      // Um aviso por minuto e por servidor: a API reinicia a cada deploy e o seed pode ainda não ter rodado.
      const at = now().getTime();
      if (at - (lastWarning.get(label) ?? 0) > 60_000) {
        lastWarning.set(label, at);
        deps.log(`${label}: ${(error as Error).message}`);
      }
    }
  };

  deps.log(`simulador no ar: ${DEMO_SERVERS.map((server) => server.name).join(', ')}`);
  while (!signal.aborted) {
    await Promise.all(
      servers.map(async ({ state, key }) => {
        const step = tick(state, now(), random, randomUUID);
        await send('heartbeat', key, step.heartbeat, `${state.def.name} batimento`);
        if (step.batch) await send('events', key, step.batch, `${state.def.name} eventos`);
      }),
    );
    await sleep(HEARTBEAT_INTERVAL_SECONDS * 1000, signal);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
