'use client';

import {
  LIVE_SERVERS_EVENT,
  LIVE_SERVERS_RETRY_MS,
  type LiveServerList,
  liveServerListSchema,
} from '@carmine/contracts';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { initialLive, type LiveState, liveReducer } from '@/lib/live-servers';
import { publishLiveSummary } from '@/lib/servers';

export const LIVE_SERVERS_URL = '/api/servers/live';

/** Teto da espera entre tentativas quando o EventSource desiste (API fora, 5xx do proxy). */
const MAX_RETRY_MS = 30_000;

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
    let attempt = 0;

    const connect = () => {
      clearTimeout(timer);
      source?.close();
      const current = new EventSource(LIVE_SERVERS_URL);
      source = current;
      current.addEventListener(LIVE_SERVERS_EVENT, (event) => {
        let parsed: ReturnType<typeof liveServerListSchema.safeParse>;
        try {
          parsed = liveServerListSchema.safeParse(JSON.parse((event as MessageEvent).data));
        } catch {
          return;
        }
        if (!parsed.success) return;
        attempt = 0;
        dispatch({ type: 'snapshot', list: parsed.data, at: Date.now() });
      });
      current.onerror = () => {
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

    connectRef.current = () => {
      attempt = 0;
      connect();
    };
    connect();
    window.addEventListener('online', reconnectNow);
    return () => {
      clearTimeout(timer);
      source?.close();
      window.removeEventListener('online', reconnectNow);
    };
  }, []);

  useEffect(() => {
    if (state.list) publishLiveSummary(state.list.summary);
  }, [state.list]);

  const retry = useCallback(() => connectRef.current(), []);
  return { state, retry };
}
