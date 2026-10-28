'use client';

import type { LiveServerList } from '@carmine/contracts';
import { LIVE_SERVERS_EVENT, LIVE_SERVERS_RETRY_MS } from '@carmine/contracts/rules';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { parseLiveServerList } from '@/lib/api-guards';
import { initialLive, type LiveState, liveReducer } from '@/lib/live-servers';
import { publishLiveSummary } from '@/lib/servers';

export const LIVE_SERVERS_URL = '/api/servers/live';

/**
 * A lista de um evento SSE conferida contra o formato do contrato; `null` se o texto não é uma lista válida. A
 * conferência é leve (`api-guards`), sem o Zod: ele pesa ~41 kB e entrava na primeira carga da Home só por isto.
 */
function parseLiveList(data: string): LiveServerList | null {
  try {
    return parseLiveServerList(JSON.parse(data));
  } catch {
    return null;
  }
}

/** Teto da espera entre tentativas quando o EventSource desiste (API fora, 5xx do proxy). */
const MAX_RETRY_MS = 30_000;

/**
 * Quanto tempo a aba pode ficar escondida antes de a conexão ao vivo ser encerrada. Trocar de aba por um instante não
 * derruba nada; uma aba esquecida em segundo plano deixa de receber (e renderizar) cada mudança que ninguém vê, e de
 * ocupar uma conexão no servidor. Ao voltar, o stream reabre e a primeira mensagem já traz a lista inteira.
 */
export const HIDDEN_CLOSE_MS = 30_000;

/**
 * A lista ao vivo (S06): começa com a leitura do servidor do site e assina o SSE da API. Cada
 * evento traz a lista inteira. Se a conexão cai, fica o último estado conhecido; o próprio
 * EventSource reconecta (o `retry` da API), e quando ele desiste de vez (uma resposta de erro)
 * a reconexão é nossa, com espera crescente, e volta na hora quando a rede volta.
 */
export function useLiveServers(initial: LiveServerList | null): {
  state: LiveState;
  /** Reconecta agora ("Tentar de novo"), sem esperar a próxima tentativa. */
  retry: () => void;
} {
  const [state, dispatch] = useReducer(liveReducer, initial, initialLive);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let sleeping = false;
    let attempt = 0;

    const connect = () => {
      clearTimeout(timer);
      source?.close();
      const current = new EventSource(LIVE_SERVERS_URL);
      source = current;
      current.addEventListener(LIVE_SERVERS_EVENT, async (event) => {
        const list = parseLiveList((event as MessageEvent).data);
        // Uma conexão já fechada (reconexão, desmontagem) não publica mais nada.
        if (list === null || source !== current) return;
        attempt = 0;
        dispatch({ type: 'snapshot', list, at: Date.now() });
      });
      current.onerror = () => {
        // Fechada de propósito (aba escondida): não é queda.
        if (sleeping) return;
        dispatch({ type: 'lost', at: Date.now() });
        if (current.readyState !== EventSource.CLOSED) return;
        const wait = Math.min(MAX_RETRY_MS, LIVE_SERVERS_RETRY_MS * 2 ** attempt);
        attempt += 1;
        timer = setTimeout(connect, wait);
      };
    };

    const reconnectNow = () => {
      if (source?.readyState === EventSource.CLOSED) connect();
    };

    // Aba escondida por mais de HIDDEN_CLOSE_MS: fecha o stream (sem marcar queda: é de propósito). Ao voltar, reabre.
    const onVisibility = () => {
      clearTimeout(hiddenTimer);
      if (document.hidden) {
        hiddenTimer = setTimeout(() => {
          sleeping = true;
          clearTimeout(timer);
          source?.close();
        }, HIDDEN_CLOSE_MS);
        return;
      }
      if (sleeping) {
        sleeping = false;
        attempt = 0;
        connect();
      }
    };

    connectRef.current = () => {
      attempt = 0;
      connect();
    };
    connect();
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      clearTimeout(hiddenTimer);
      source?.close();
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (state.list) publishLiveSummary(state.list.summary);
  }, [state.list]);

  const retry = useCallback(() => connectRef.current(), []);
  return { state, retry };
}
