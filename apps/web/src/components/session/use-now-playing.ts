'use client';

import type { NowPlaying } from '@carmine/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadContracts } from '@/lib/contracts-schemas';
import { useSession } from './session-provider';

export const NOW_PLAYING_URL = '/api/me/playing';

/** A presença muda a cada batimento (10 s); reler antes disso só repete a resposta. */
const FRESH_MS = 15_000;

/**
 * Onde a própria Conta está jogando, para o "Jogando agora" do menu. Não busca sozinho: o menu
 * chama `load` ao passar o ponteiro ou o foco no botão e ao abrir, então a linha costuma estar
 * pronta quando o painel aparece (sem pedir à API em toda página). `null` até saber, e se a
 * resposta falhar: o menu só omite a linha.
 */
export function useNowPlaying(): { server: NowPlaying['server']; load: () => void } {
  const { status } = useSession();
  const [server, setServer] = useState<NowPlaying['server']>(null);
  const controller = useRef<AbortController | null>(null);
  const loadedAt = useRef(0);

  const load = useCallback(() => {
    if (status !== 'authenticated' || Date.now() - loadedAt.current < FRESH_MS) return;
    loadedAt.current = Date.now();
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    fetch(NOW_PLAYING_URL, { cache: 'no-store', signal: current.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const { nowPlayingSchema } = await loadContracts();
        const parsed = nowPlayingSchema.safeParse(await response.json());
        if (parsed.success) setServer(parsed.data.server);
      })
      .catch(() => {
        // Sem a linha: o menu funciona igual. Tenta de novo na próxima vez que abrir.
        loadedAt.current = 0;
      });
  }, [status]);

  useEffect(() => () => controller.current?.abort(), []);
  // Sair da Conta zera o que sabíamos dela.
  useEffect(() => {
    if (status !== 'authenticated') {
      setServer(null);
      loadedAt.current = 0;
    }
  }, [status]);

  return { server, load };
}
