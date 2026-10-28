/**
 * A contagem de páginas no navegador (A1d, ADR 0021), lida do ambiente em tempo de execução (a imagem é
 * construída uma vez, a mesma na produção e na homologação: a chave não é `NEXT_PUBLIC_*`). Sem
 * `POSTHOG_API_KEY` nada roda no navegador e a CSP não muda; com `ANALYTICS_DRIVER=log` (a homologação) a API só
 * registra os eventos dela no log e o navegador também não envia nada a ninguém.
 */
export interface AnalyticsWebConfig {
  key: string;
  /** Origem de ingestão do PostHog (UE), sem a barra final. */
  host: string;
  environment: 'producao' | 'staging';
}

const DEFAULT_HOST = 'https://eu.i.posthog.com';

export function analyticsWebConfig(
  env: Record<string, string | undefined>,
): AnalyticsWebConfig | null {
  const key = env.POSTHOG_API_KEY?.trim();
  if (!key || env.ANALYTICS_DRIVER?.trim() === 'log') return null;
  let host: string;
  try {
    const url = new URL(env.POSTHOG_HOST?.trim() || DEFAULT_HOST);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    host = url.origin;
  } catch {
    return null;
  }
  return {
    key,
    host,
    environment: env.ANALYTICS_ENVIRONMENT?.trim() === 'staging' ? 'staging' : 'producao',
  };
}

/** A origem para onde o navegador manda a contagem de páginas (entra no `connect-src` da CSP). */
export function analyticsIngestOrigin(config: AnalyticsWebConfig | null): string | null {
  return config ? config.host : null;
}
