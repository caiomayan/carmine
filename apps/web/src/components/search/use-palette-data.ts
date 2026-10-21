'use client';

import type { LiveServer, PlayerSearchHit } from '@carmine/contracts';
import { useCallback, useEffect, useState } from 'react';
import { loadContracts } from '@/lib/contracts-schemas';
import type { ItemSearch } from '@/lib/search/items';

/** Menos que isto não é busca: nenhuma fonte remota é consultada. */
export const MIN_QUERY_LENGTH = 2;
/** Espera depois da última tecla antes de consultar (a paleta pesquisa enquanto se digita). */
const DEBOUNCE_MS = 180;

export type Remote<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data: T };

const NO_ITEMS: ItemSearch = { inventory: [], catalog: [] };
const NO_PLAYERS: PlayerSearchHit[] = [];
const NO_SERVERS: LiveServer[] = [];

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

const loadItems = async (query: string, signal: AbortSignal) =>
  (await getJson(`/busca/itens?q=${encodeURIComponent(query)}`, signal)) as ItemSearch;

async function loadPlayers(query: string, signal: AbortSignal) {
  const body = await getJson(`/api/players/search?q=${encodeURIComponent(query)}`, signal);
  const { playerSearchSchema } = await loadContracts();
  return playerSearchSchema.parse(body).players;
}

async function loadServers(_key: string, signal: AbortSignal) {
  const body = await getJson('/api/servers', signal);
  const { liveServerListSchema } = await loadContracts();
  return liveServerListSchema.parse(body).servers;
}

/**
 * Uma fonte remota da paleta: consulta quando `key` muda (nulo: sem consulta e sem dados), cancela
 * a consulta anterior e mantém os dados antigos enquanto a nova chega, para a lista não piscar a
 * cada tecla. `attempt` refaz a consulta ("Tentar de novo").
 */
function useRemote<T>(
  key: string | null,
  load: (key: string, signal: AbortSignal) => Promise<T>,
  empty: T,
  attempt: number,
): Remote<T> {
  const [state, setState] = useState<Remote<T>>({ status: 'idle', data: empty });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` e `empty` são constantes do módulo
  useEffect(() => {
    if (key === null) {
      setState({ status: 'idle', data: empty });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ status: 'loading', data: current.data }));
    load(key, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      },
      () => {
        if (!controller.signal.aborted)
          setState((current) => ({ status: 'error', data: current.data }));
      },
    );
    return () => controller.abort();
  }, [key, attempt]);

  return state;
}

/** O texto digitado, só depois de a pessoa parar de digitar um instante. */
function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

/**
 * Os dados remotos da paleta para a busca digitada: Itens do catálogo e do Inventário (rota do
 * web), jogadores pelo nome (API) e os servidores ao vivo (API, uma vez ao abrir; o filtro é no
 * navegador). Só existe com a paleta aberta: nada disto roda na primeira carga do site.
 */
export function usePaletteData(rawQuery: string) {
  const query = rawQuery.trim();
  const searching = query.length >= MIN_QUERY_LENGTH;
  const debounced = useDebounced(query);
  const [attempt, setAttempt] = useState(0);
  const key = searching && debounced.length >= MIN_QUERY_LENGTH ? debounced : null;
  // Entre a tecla e o fim da espera, a lista ainda é a da busca anterior: conta como carregando.
  const waiting = searching && debounced !== query;

  const items = useRemote(key, loadItems, NO_ITEMS, attempt);
  const players = useRemote(key, loadPlayers, NO_PLAYERS, attempt);
  // Os servidores vêm uma vez e servem a todas as buscas.
  const servers = useRemote('servers', loadServers, NO_SERVERS, attempt);

  const settle = <T>(remote: Remote<T>): Remote<T> =>
    waiting && remote.status !== 'error' ? { ...remote, status: 'loading' } : remote;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    searching,
    items: settle(items),
    players: settle(players),
    servers,
    retry,
  };
}
