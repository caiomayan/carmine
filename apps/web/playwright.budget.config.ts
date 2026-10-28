import { defineConfig, devices } from '@playwright/test';
import base, { ANALYTICS_WEB_PORT } from './playwright.config';

/**
 * Só o orçamento de JS (`pnpm budget:js:ci`): a mesma stack do E2E (Steam falsa, API e web de produção), sem
 * os outros specs. O passo fica na CI depois do build; o `testIgnore` da config principal o deixa fora do E2E.
 */
export default defineConfig({
  ...base,
  // Sem o web da contagem de páginas (analytics.spec.ts): o orçamento mede o site sem a chave do PostHog.
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).filter(
    (server) => !server.url?.includes(`:${ANALYTICS_WEB_PORT}`),
  ),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  testIgnore: [],
  testMatch: 'js-budget.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
});
