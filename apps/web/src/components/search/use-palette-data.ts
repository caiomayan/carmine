'use client';

import type { LiveServer, PlayerSearchHit } from '@carmine/contracts';
import { SEARCH_MIN_LENGTH } from '@carmine/contracts/rules';
import { useCallback, useEffect, useState } from 'react';
import type { ItemSearch } from '@/lib/search/items';

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

const loadItems = async (signal: AbortSignal, query: string) =>
  (await getJson(`/busca/itens?q=${encodeURIComponent(query)}`, signal)) as ItemSearch;

async function loadPlayers(signal: AbortSignal, query: string) {
  const body = await getJson(`/api/players/search?q=${encodeURIComponent(query)}`, signal);
  const { playerSearchSchema } = await import('@carmine/contracts/player-search');
  return playerSearchSchema.parse(body).players;
}

async function loadServers(signal: AbortSignal) {
  const body = await getJson('/api/servers', signal);
  const { liveServerListSchema } = await import('@carmine/contracts/live-servers');
  return liveServerListSchema.parse(body).servers;
}

/** O que uma consulta respondeu, com a chave e a tentativa que a produziram. */
type Settled<T> = { key: string; attempt: number; failed: boolean; data: T };

/**
 * Uma fonte remota da paleta: consulta quando `key` muda (nulo: sem consulta e sem dados), cancela
 * a consulta anterior e mantém os dados antigos enquanto a nova chega, para a lista não piscar a
 * cada tecla. A resposta guarda a chave e a tentativa que a produziram: enquanto não forem as de
 * agora, a fonte conta como carregando, e nunca mostra o "pronto" (nem o erro) da busca anterior.
 * `attempt` refaz a consulta ("Tentar de novo").
 */
function useRemote<T>(
  key: string | null,
  load: (signal: AbortSignal, key: string) => Promise<T>,
  empty: T,
  attempt: number,
): Remote<T> {
  const [last, setLast] = useState<Settled<T> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` e `empty` são constantes do módulo
  useEffect(() => {
    if (key === null) {
      setLast(null);
      return;
    }
    const controller = new AbortController();
    load(controller.signal, key).then(
      (data) => {
        if (!controller.signal.aborted) setLast({ key, attempt, failed: false, data });
      },
      () => {
        if (controller.signal.aborted) return;
        setLast((current) => ({ key, attempt, failed: true, data: current?.data ?? empty }));
      },
    );
    return () => controller.abort();
  }, [key, attempt]);

  if (key === null) return { status: 'idle', data: empty };
  const data = last?.data ?? empty;
  if (last?.key !== key || last.attempt !== attempt) return { status: 'loading', data };
  return { status: last.failed ? 'error' : 'ready', data };
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
  const searching = query.length >= SEARCH_MIN_LENGTH;
  const debounced = useDebounced(query);
  const [attempt, setAttempt] = useState(0);
  const key = searching && debounced.length >= SEARCH_MIN_LENGTH ? debounced : null;
  // Entre a tecla e o fim da espera, a lista ainda é a da busca anterior: conta como carregando.
  const waiting = searching && debounced !== query;

  const items = useRemote(key, loadItems, NO_ITEMS, attempt);
  const players = useRemote(key, loadPlayers, NO_PLAYERS, attempt);
  // Os servidores vêm uma vez e servem a todas as buscas.
  const servers = useRemote('servers', loadServers, NO_SERVERS, attempt);

  const whileTyping = <T>(remote: Remote<T>): Remote<T> =>
    waiting ? { ...remote, status: 'loading' } : remote;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    searching,
    items: whileTyping(items),
    players: whileTyping(players),
    servers,
    retry,
  };
}
