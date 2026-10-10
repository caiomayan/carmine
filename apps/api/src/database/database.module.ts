import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { createDatabase, type Database } from './database.js';

export type { Database } from './database.js';

export const DATABASE = Symbol('DATABASE');
const PG_POOL = Symbol('PG_POOL');

const providers: Provider[] = [
  {
    provide: PG_POOL,
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) => {
      const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
      // Sem este listener, a queda de uma conexão ociosa derruba o processo.
      pool.on('error', (error) => new Logger('Database').warn(`Conexão ociosa falhou: ${error}`));
      return pool;
    },
  },
  {
    provide: DATABASE,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => createDatabase(pool),
  },
];

@Global()
@Module({ providers, exports: [DATABASE] })
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
