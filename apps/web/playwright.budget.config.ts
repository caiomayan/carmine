import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Só o orçamento de JS (`pnpm budget:js:ci`): a mesma stack do E2E (Steam falsa, API e web de produção), sem
 * os outros specs. O passo fica na CI depois do build; o `testIgnore` da config principal o deixa fora do E2E.
 */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: 'js-budget.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
});
