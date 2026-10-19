import { defineConfig, devices } from '@playwright/test';
import { E2E_DATABASE_URL } from './e2e/api-cli';

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
  // O `next dev` compila cada rota na primeira visita.
  ...(process.env.E2E_DEV === '1' ? { timeout: 90_000, expect: { timeout: 15_000 } } : {}),
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
      // Banco próprio do E2E (criado aqui, migrado e esvaziado no globalSetup): nada vai para o
      // banco de desenvolvimento.
      command: `node test/support/e2e-database.cli.ts prepare && ${API_NODE} dist/database/migrate.cli.js && ${API_NODE} dist/main.js`,
      cwd: '../api',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        LOG_LEVEL: 'warn',
        PUBLIC_WEB_URL: baseURL,
        STEAM_OPENID_URL: `http://127.0.0.1:${FAKE_STEAM_PORT}/openid/login`,
        // A Steam Web API do E2E é a mesma Steam falsa: amigos por SteamID (lista privada e
        // Steam fora do ar em IDs fixos) e nenhum avatar, então as Contas ficam com o neutro.
        STEAM_WEB_API_KEY: 'fake',
        STEAM_WEB_API_URL: `http://127.0.0.1:${FAKE_STEAM_PORT}`,
        // Offline rápido para o E2E da S06 (em produção, 45 s sem batimento).
        SERVER_OFFLINE_AFTER_SECONDS: '4',
        LIVE_SERVERS_SWEEP_SECONDS: '1',
        // Sem cache do Ranking no E2E: os testes precisam ver os resultados novos na hora (em produção, 45 s).
        RANKING_CACHE_TTL_SECONDS: '0',
        // Todo pedido do E2E chega à API do mesmo IP (o Next repassa /api/*): sem limite real.
        RATE_LIMIT_LOGIN_PER_MINUTE: '100000',
        RATE_LIMIT_PUBLIC_PER_MINUTE: '100000',
        RATE_LIMIT_EQUIPPED_PER_MINUTE: '100000',
        RATE_LIMIT_MUTATIONS_PER_MINUTE: '100000',
        RATE_LIMIT_SERVER_PER_MINUTE: '100000',
      },
      timeout: 60_000,
    },
    {
      // E2E_DEV=1 roda contra o `next dev`: lá os erros do servidor (i18n, React) também
      // chegam ao console do navegador, e a fixture de console os pega.
      command: `pnpm exec next ${process.env.E2E_DEV === '1' ? 'dev' : 'start'} --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      // A vitrine interna de componentes (/dev/*) só existe com esta variável.
      env: {
        CARMINE_UI_GALLERY: '1',
        API_URL: `http://localhost:${API_PORT}`,
        // Qualquer erro de i18n derruba a página (src/i18n/request.ts).
        CARMINE_STRICT_I18N: '1',
      },
      timeout: 60_000,
    },
  ],
});
