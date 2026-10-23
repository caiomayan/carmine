import { readFileSync } from 'node:fs';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placeholderNameFor } from '../src/accounts/placeholder-names.js';
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

  it('a migração 0013 troca "Jogador #ID" pelo mesmo nome fictício que o código calcula', async () => {
    await runMigrations(postgres.getConnectionUri());
    const client = new Client({ connectionString: postgres.getConnectionUri() });
    await client.connect();
    try {
      const ids = [10_016, 10_017, 10_018, 12_345, 99_999];
      for (const id of ids) {
        await client.query(
          'insert into accounts (steam_id, public_id, steam_name, display_name) values ($1, $2, $3, $4)',
          [76_561_198_000_000_000n + BigInt(id), id, `Steam ${id}`, `Jogador #${id}`],
        );
      }
      // Quem escolheu o próprio nome, e quem tem outro nome gravado, não é tocado.
      await client.query(
        "insert into accounts (steam_id, public_id, steam_name, display_name, custom_display_name) values (76561198000000001, 20001, 'x', 'Jogador #20001', 'Fer'), (76561198000000002, 20002, 'coldzera', 'coldzera', null)",
      );

      await client.query(
        readFileSync(new URL('../drizzle/0013_u1b_nomes_ficticios.sql', import.meta.url), 'utf8'),
      );

      const { rows } = await client.query(
        'select public_id::int as id, display_name from accounts',
      );
      const names = new Map(rows.map((row) => [row.id, row.display_name]));
      for (const id of ids) expect(names.get(id)).toBe(placeholderNameFor(id));
      expect(names.get(20_001)).toBe('Jogador #20001');
      expect(names.get(20_002)).toBe('coldzera');
    } finally {
      await client.end();
    }
  });
});
