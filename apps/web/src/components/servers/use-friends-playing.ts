'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/components/session/session-provider';
import { type FriendsView, nextFriends } from '@/lib/live-servers';

export const FRIENDS_PLAYING_URL = '/api/me/friends-playing';

/** A API guarda a lista de amigos por 60 s; ler mais vezes que isso só repete a resposta. */
const REFRESH_MS = 30_000;

export type FriendsPlayingState = {
  view: FriendsView | { status: 'anonymous' };
  refresh: () => void;
};

/**
 * "Seus amigos jogando agora" (S06), só com sessão. Relê a cada {@link REFRESH_MS} com a aba
 * visível e na volta para a aba. `anonymous` quando não há sessão (ou ela expirou). A home lê
 * uma vez e reparte: o bloco de amigos e os avatares dos cartões usam o mesmo estado.
 */
export function useFriendsPlaying(): FriendsPlayingState {
  const { status: session } = useSession();
  const [view, setView] = useState<FriendsView>({ status: 'loading' });
  const [expired, setExpired] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const response = await fetch(FRIENDS_PLAYING_URL, {
        cache: 'no-store',
        signal: current.signal,
      });
      if (response.status === 401) {
        setExpired(true);
        return;
      }
      const parsed = response.ok
        ? (await import('@carmine/contracts/live-servers')).friendsPlayingSchema.safeParse(
            await response.json(),
          )
        : ({ success: false } as const);
      setView((previous) => nextFriends(previous, parsed.success ? parsed.data : 'failed'));
    } catch {
      if (current.signal.aborted) return;
      setView((previous) => nextFriends(previous, 'failed'));
    }
  }, []);

  useEffect(() => {
    if (session !== 'authenticated') return;
    setExpired(false);
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      controller.current?.abort();
    };
  }, [session, load]);

  const refresh = useCallback(() => {
    setView((previous) => (previous.status === 'ok' ? previous : { status: 'loading' }));
    load();
  }, [load]);

  // Sessão desconhecida (a API não respondeu ao /api/me): o bloco espera, sem afirmar nada.
  if (session === 'anonymous' || expired) return { view: { status: 'anonymous' }, refresh };
  return { view: session === 'unknown' ? { status: 'loading' } : view, refresh };
}
