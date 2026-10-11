import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.WEB_E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;
const API_PORT = Number(process.env.API_E2E_PORT ?? 3333);
const FAKE_STEAM_PORT = Number(process.env.FAKE_STEAM_PORT ?? 4555);
/** Lê o .env.example da API (Postgres e Valkey do infra/docker-compose.yml) e o .env local. */
const API_NODE = 'node --env-file=.env.example --env-file-if-exists=.env';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Pouca memória na máquina do dono e no runner: poucos navegadores ao mesmo tempo.
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // A stack inteira do login (S03): a Steam OpenID falsa, a API (com Postgres e Valkey do
  // `pnpm infra:up`) e o web, todos dos builds de produção (rode `pnpm build` antes).
  // Localmente reaproveita o que já estiver no ar.
  webServer: [
    {
      command: 'node test/support/fake-steam-openid.cli.ts',
      cwd: '../api',
      port: FAKE_STEAM_PORT,
      reuseExistingServer: !process.env.CI,
      env: { FAKE_STEAM_PORT: String(FAKE_STEAM_PORT) },
      timeout: 30_000,
    },
    {
      command: `${API_NODE} dist/database/migrate.cli.js && ${API_NODE} dist/main.js`,
      cwd: '../api',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        PUBLIC_WEB_URL: baseURL,
        STEAM_OPENID_URL: `http://127.0.0.1:${FAKE_STEAM_PORT}/openid/login`,
        // Sem Steam Web API no E2E: as Contas novas ficam com o avatar neutro.
        STEAM_WEB_API_KEY: '',
      },
      timeout: 60_000,
    },
    {
      command: `pnpm exec next start --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      // A vitrine interna de componentes (/dev/*) só existe com esta variável.
      env: { CARMINE_UI_GALLERY: '1', API_URL: `http://localhost:${API_PORT}` },
      timeout: 60_000,
    },
  ],
});
