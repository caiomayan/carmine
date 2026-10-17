import type { NodeOptions } from '@sentry/node';
import type { AppConfig } from '../config/config.js';

/**
 * Opções do Sentry da API, ou `null` com o DSN vazio (desligado). Só erros: sem tracing nem
 * profiling. Nada de dados pessoais (LGPD): sem IP/usuário, cookies, cabeçalhos, corpos nem query
 * string (o retorno do login Steam leva parâmetros `openid.*`).
 */
export function sentryOptions(sentry: AppConfig['sentry']): NodeOptions | null {
  if (sentry.dsn === null) return null;
  return {
    dsn: sentry.dsn,
    environment: sentry.environment,
    ...(sentry.release === null ? {} : { release: sentry.release }),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
    },
  };
}
