import { SENTRY_DATA_COLLECTION, sentryWebConfig } from '@/lib/sentry-config';

/**
 * Sentry do servidor do web (Server Components, route handlers, proxy). Só erros; sem
 * `SENTRY_DSN` não carrega nada. O navegador tem o seu em `components/error-reporting.tsx`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const config = sentryWebConfig(process.env);
  if (!config) return;
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    dataCollection: SENTRY_DATA_COLLECTION,
  });
}

/** Erros de renderização e de proxy chegam aqui; o Next já filtra redirect e notFound. */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !sentryWebConfig(process.env)) return;
  const { captureException } = await import('@sentry/node');
  captureException(error, {
    tags: { routePath: context.routePath, routeType: context.routeType },
    extra: { method: request.method },
  });
}
