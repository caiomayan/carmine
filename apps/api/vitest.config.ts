import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emite os metadados de decorators que a injeção de dependências do Nest exige.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    // O runner próprio do CI tem mais núcleos que memória: VITEST_MAX_WORKERS limita quantos
    // arquivos (cada um com o seu Postgres e Valkey) rodam ao mesmo tempo.
    maxWorkers: process.env.VITEST_MAX_WORKERS || undefined,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.int-spec.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
