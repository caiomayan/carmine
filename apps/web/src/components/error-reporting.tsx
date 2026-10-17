'use client';

import { useEffect } from 'react';
import { SENTRY_DATA_COLLECTION } from '@/lib/sentry-config';

/**
 * Sentry do navegador, só de erros. Carrega o SDK (~30 kB) depois da hidratação, fora da
 * primeira carga, e só se o servidor repassou um DSN (`SENTRY_DSN` em tempo de execução). Sem
 * breadcrumbs: eles registram URLs e cliques, e o que importa é a pilha do erro.
 */
export function ErrorReporting({
  dsn,
  environment,
  release,
}: {
  dsn: string;
  environment: string;
  release?: string;
}) {
  useEffect(() => {
    let cancelled = false;
    void import('@sentry/browser').then((Sentry) => {
      if (cancelled || Sentry.getClient()) return;
      Sentry.init({
        dsn,
        environment,
        release,
        dataCollection: SENTRY_DATA_COLLECTION,
        integrations: (defaults) => defaults.filter((i) => i.name !== 'Breadcrumbs'),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [dsn, environment, release]);
  return null;
}
