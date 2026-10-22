import { readLastSide } from '../loadout/last-side';
import type { HeaderView } from './view';

/**
 * A leitura das prévias no navegador, compartilhada entre o primeiro hover (que só aquece) e os
 * painéis. Uma resposta vale por poucos segundos: abrir o mesmo painel de novo não pede de novo,
 * e o servidor também guarda a parte pública por 15 s. Falha vira `null` (o painel diz que não
 * carregou); uma falha nunca fica em cache.
 */
const FRESH_MS = 10_000;

let cached: { side: string; at: number; promise: Promise<HeaderView | null> } | null = null;

async function request(side: string): Promise<HeaderView | null> {
  try {
    const response = await fetch(`/header/previews?side=${side}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    return (await response.json()) as HeaderView;
  } catch {
    return null;
  }
}

/** O último lado do Loadout, como o navegador o guarda. */
const currentSide = () => {
  try {
    return readLastSide(localStorage);
  } catch {
    return readLastSide(null);
  }
};

export function loadHeaderView({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<HeaderView | null> {
  const side = currentSide();
  const now = Date.now();
  if (!force && cached && cached.side === side && now - cached.at < FRESH_MS) return cached.promise;
  const promise = request(side);
  cached = { side, at: now, promise };
  promise.then((view) => {
    if (view === null && cached?.promise === promise) cached = null;
  });
  return promise;
}
