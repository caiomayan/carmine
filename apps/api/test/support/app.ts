import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { type StartedValkeyContainer, ValkeyContainer } from '@testcontainers/valkey';
import { AccountsService } from '../../src/accounts/accounts.service.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/config.js';
import { GameServerRegistry } from '../../src/game-servers/game-server-registry.js';
import { VALKEY_IMAGE } from '../images.js';
import { startPostgres, type TestPostgres } from './postgres.js';

export interface TestApp {
  app: NestFastifyApplication;
  postgres: TestPostgres;
  valkey: StartedValkeyContainer;
  accounts: AccountsService;
  /** Chave válida de um Servidor Carmine já cadastrado. */
  serverKey: string;
  stop(): Promise<void>;
}

/** A API completa sobre Postgres (migrado) e Valkey reais, com um Servidor Carmine cadastrado. */
export async function startTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const [postgres, valkey] = await Promise.all([
    startPostgres(),
    new ValkeyContainer(VALKEY_IMAGE).start(),
  ]);
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    DATABASE_URL: postgres.url,
    VALKEY_URL: valkey.getConnectionUrl(),
    HEALTH_CHECK_TIMEOUT_MS: '1000',
    ...env,
  });
  const app = await createApp(config);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const { key } = await app
    .get(GameServerRegistry)
    .register({ name: 'retake-teste', mode: 'retake', address: '127.0.0.1:27015' });

  return {
    app,
    postgres,
    valkey,
    accounts: app.get(AccountsService),
    serverKey: key,
    async stop() {
      await app.close();
      await Promise.all([postgres.stop(), valkey.stop()]);
    },
  };
}

/** SteamID64 individual válido e distinto para cada `n`. */
export function steamIdFor(n: number): string {
  return (76561198000000000n + BigInt(n)).toString();
}
