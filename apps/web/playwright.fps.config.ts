import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Só a auditoria de fps (`pnpm fps:audit`): a mesma stack do E2E (Steam falsa, API e web de produção), sem os outros
 * specs. Roda à parte, como o orçamento de JS; o `testIgnore` da config principal o deixa fora do E2E.
 */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: 'fps.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
});
