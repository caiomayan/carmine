import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts'],
    // O primeiro acesso ao catálogo de skins carrega o JSON inteiro: com a máquina cheia (turbo em
    // paralelo na CI), passa dos 5 s padrão.
    testTimeout: 30_000,
  },
});
