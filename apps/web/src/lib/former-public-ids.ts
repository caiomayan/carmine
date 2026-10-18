import { formerPublicIdsSchema } from '@carmine/contracts';
import { apiGet } from './api-base';

type Redirect = { from: number; to: number };

export interface FormerIdsOptions {
  fetchRedirects: () => Promise<Redirect[]>;
  /** Quanto a lista vale depois de lida. */
  ttlMs: number;
  /** Quando a leitura falha: quanto esperar para tentar de novo. */
  retryMs: number;
  now: () => number;
}

/**
 * Procura o ID atual de um ID público que a Staff trocou por um ID reservado (S10, ADR 0013).
 * A lista inteira vem da API (são poucas linhas, só cresce por ação manual) e fica guardada por
 * `ttlMs`, então uma visita a um Perfil não custa uma chamada a mais. Com a API fora, vale a
 * última lista conhecida (ou nenhuma) e a próxima tentativa vem em `retryMs`: o link antigo só
 * deixa de redirecionar enquanto a própria página também estiver sem a API.
 */
export function createFormerIdsLookup(options: FormerIdsOptions) {
  let known = new Map<number, number>();
  let validUntil = Number.NEGATIVE_INFINITY;
  let loading: Promise<void> | null = null;

  const refresh = async () => {
    try {
      known = new Map((await options.fetchRedirects()).map((r) => [r.from, r.to]));
      validUntil = options.now() + options.ttlMs;
    } catch {
      validUntil = options.now() + options.retryMs;
    }
  };

  return async (publicId: number): Promise<number | null> => {
    if (options.now() >= validUntil) {
      loading ??= refresh().finally(() => {
        loading = null;
      });
      await loading;
    }
    return known.get(publicId) ?? null;
  };
}

async function fetchRedirects(): Promise<Redirect[]> {
  const response = await apiGet('/profiles/former-ids');
  if (!response.ok) throw new Error(`former-ids: ${response.status}`);
  return formerPublicIdsSchema.parse(await response.json()).redirects;
}

/** O ID atual de um ID público antigo; `null` se ele nunca foi trocado. */
export const formerPublicId = createFormerIdsLookup({
  fetchRedirects,
  ttlMs: 10_000,
  retryMs: 5_000,
  now: Date.now,
});
