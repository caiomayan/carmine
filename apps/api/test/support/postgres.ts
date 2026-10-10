import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { createDatabase, type Database } from '../../src/database/database.js';
import { runMigrations } from '../../src/database/migrate.js';
import { POSTGRES_IMAGE } from '../images.js';

export interface TestPostgres {
  container: StartedPostgreSqlContainer;
  url: string;
  db: Database;
  stop(): Promise<void>;
}

/** Postgres real e migrado, num container só deste arquivo de teste. */
export async function startPostgres(): Promise<TestPostgres> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    container,
    url,
    db: createDatabase(pool),
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}
