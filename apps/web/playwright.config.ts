import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.WEB_E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Contra o build de produção (rode `pnpm build` antes); localmente reaproveita o `pnpm dev`.
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // A vitrine interna de componentes (/dev/componentes) só existe com esta variável.
    env: { CARMINE_UI_GALLERY: '1' },
    timeout: 60_000,
  },
});
