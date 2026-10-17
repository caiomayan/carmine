/**
 * Configuração do Sentry do web, lida do ambiente em tempo de execução (a imagem é construída
 * uma vez; o DSN não é `NEXT_PUBLIC_*`). DSN vazio desliga o servidor e o navegador.
 */
export interface SentryWebConfig {
  dsn: string;
  environment: string;
  release: string | undefined;
}

export function sentryWebConfig(env: Record<string, string | undefined>): SentryWebConfig | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  try {
    new URL(dsn);
  } catch {
    return null;
  }
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || 'production',
    release: env.SENTRY_RELEASE?.trim() || undefined,
  };
}

/** Sem dados pessoais (LGPD): sem IP/usuário, cookies, cabeçalhos, corpos nem query string. */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
};

/** A origem para onde o navegador manda os eventos (entra no `connect-src` da CSP). */
export function sentryIngestOrigin(config: SentryWebConfig | null): string | null {
  return config ? new URL(config.dsn).origin : null;
}
