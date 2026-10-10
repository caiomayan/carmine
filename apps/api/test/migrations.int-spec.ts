import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/database/migrate.js';
import { POSTGRES_IMAGE } from './images.js';

describe('runMigrations', () => {
  let postgres: StartedPostgreSqlContainer;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  async function appliedMigrations(): Promise<number> {
    const client = new Client({ connectionString: postgres.getConnectionUri() });
    await client.connect();
    try {
      const result = await client.query(
        'select count(*)::int as total from drizzle.__drizzle_migrations',
      );
      return result.rows[0].total;
    } finally {
      await client.end();
    }
  }

  it('aplica as migrações num banco vazio e não reaplica na segunda execução', async () => {
    await runMigrations(postgres.getConnectionUri());
    const afterFirstRun = await appliedMigrations();

    await runMigrations(postgres.getConnectionUri());

    expect(afterFirstRun).toBeGreaterThan(0);
    expect(await appliedMigrations()).toBe(afterFirstRun);
  });
});
