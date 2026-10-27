'use client';

import type { LiveServer, ServerPlayers, ServerToday } from '@carmine/contracts';
import { useEffect, useRef, useState } from 'react';
import { matchOf, rosterOf, todayOf } from './adapt';
import type { Collectable, Roster, ServerExtras, Today } from './types';

/** Os jogadores acompanham o batimento (10 s); o histórico do dia tem cache de 15 s na API, 1 min basta. */
const PLAYERS_REFRESH_MS = 10_000;
const TODAY_REFRESH_MS = 60_000;

/**
 * Enquanto um bloco está "coletando" (a rota ainda responde 501, a API estava fora ou ainda não há dado), a espera
 * entre tentativas começa em 1 min e dobra até 5 min: cada tentativa que falha vira uma linha de erro no console do
 * navegador, e não adianta insistir numa rota que ainda não existe.
 */
const COLLECTING_FIRST_WAIT_MS = 60_000;
const COLLECTING_MAX_WAIT_MS = 5 * 60_000;

const COLLECTING = { status: 'collecting', since: null } as const;

/** O que o servidor do site já leu (nulo: a API não respondeu ou a rota ainda não existe, 501). */
export type InitialExtras = { players: ServerPlayers | null; today: ServerToday | null };

/**
 * Lê um endpoint da S12b no navegador e mantém o bloco em dia. Resposta que não é 200 (501 enquanto a API não
 * entrou, 404, 5xx) ou que não passa no schema não muda nada: o bloco fica como estava ("coletando" no começo; o
 * último dado bom, depois). Com o bloco pronto, relê a cada `intervalMs` (com a aba à vista) e na hora em que
 * `refreshKey` muda; coletando, só tenta de novo com a espera crescente.
 */
function useEndpoint<Raw, View>(
  url: string,
  initial: Collectable<View>,
  parse: (raw: unknown) => Promise<Raw | null>,
  adapt: (raw: Raw) => Collectable<View>,
  intervalMs: number,
  refreshKey: string,
): Collectable<View> {
  const [state, setState] = useState<Collectable<View>>(initial);
  // As funções mudam a cada render; o efeito lê as mais novas sem se refazer por causa delas.
  const latest = useRef({ parse, adapt, ready: state.status === 'ready' });
  latest.current = { parse, adapt, ready: state.status === 'ready' };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `refreshKey` só serve para reler na hora
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;

    /** Uma leitura; devolve se trouxe dado pronto. */
    const load = async (): Promise<boolean> => {
      try {
        const response = await fetch(url, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        if (!response.ok) return false;
        const raw = await latest.current.parse(await response.json());
        if (raw === null || cancelled) return false;
        const next = latest.current.adapt(raw);
        setState(next);
        return next.status === 'ready';
      } catch {
        // Sem rede: fica o que já está na tela.
        return false;
      }
    };

    const schedule = () => {
      const delay = latest.current.ready
        ? intervalMs
        : Math.min(COLLECTING_MAX_WAIT_MS, COLLECTING_FIRST_WAIT_MS * 2 ** misses);
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          misses = (await load()) ? 0 : misses + 1;
        }
        if (!cancelled) schedule();
      }, delay);
    };

    // Com o bloco pronto, uma mudança (jogador, mapa, placar) relê na hora; coletando, só a espera crescente.
    if (latest.current.ready) void load();
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, intervalMs, refreshKey]);

  return state;
}

/**
 * Os blocos da S12b da página do servidor: o placar de times vem da lista ao vivo (`LiveServer.match`), os jogadores
 * de `GET /api/servers/{id}/players` e o histórico de `GET /api/servers/{id}/today`. Cada bloco chega "coletando"
 * ou pronto (ver `ServerExtras`); a página nunca mostra número que a API não deu.
 */
export function useServerExtras(server: LiveServer, initial: InitialExtras): ServerExtras {
  const liveMap = server.state === 'offline' ? null : server.map;

  const roster = useEndpoint<ServerPlayers, Roster>(
    `/api/servers/${server.id}/players`,
    initial.players ? rosterOf(initial.players) : COLLECTING,
    async (raw) => {
      const { serverPlayersSchema } = await import('@carmine/contracts/server-detail');
      const parsed = serverPlayersSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    rosterOf,
    PLAYERS_REFRESH_MS,
    // Quem entra ou sai, a troca de mapa e a mudança do placar relêem a lista na hora.
    `${server.players}|${server.map}|${server.state}|${JSON.stringify(server.match ?? null)}`,
  );

  const today = useEndpoint<ServerToday, Today>(
    `/api/servers/${server.id}/today`,
    initial.today ? todayOf(initial.today, liveMap) : COLLECTING,
    async (raw) => {
      const { serverTodaySchema } = await import('@carmine/contracts/server-detail');
      const parsed = serverTodaySchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    (raw) => todayOf(raw, liveMap),
    TODAY_REFRESH_MS,
    `${server.map}|${server.state}`,
  );

  return { match: matchOf(server), roster, today };
}
