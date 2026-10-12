import type { LiveServerList } from '@carmine/contracts';
import { useSyncExternalStore } from 'react';

/** Resumo dos Servidores Carmine para a casca (rodapé): servidores no ar e jogadores. */
export type ServersSummary = LiveServerList['summary'];

export const isLive = (summary: ServersSummary) => summary.online > 0;

/**
 * O último resumo que a conexão ao vivo da home recebeu. O rodapé nasce com o resumo lido no
 * servidor e, enquanto a home está aberta, acompanha o ao vivo sem abrir outra conexão.
 */
let liveSummary: ServersSummary | null = null;
const listeners = new Set<() => void>();

export function publishLiveSummary(summary: ServersSummary) {
  if (
    liveSummary &&
    liveSummary.online === summary.online &&
    liveSummary.players === summary.players
  ) {
    return;
  }
  liveSummary = summary;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** O resumo ao vivo, quando a home já recebeu um; senão, o lido no servidor. */
export function useServersSummary(fallback: ServersSummary | null): ServersSummary | null {
  const live = useSyncExternalStore(
    subscribe,
    () => liveSummary,
    () => null,
  );
  return live ?? fallback;
}
