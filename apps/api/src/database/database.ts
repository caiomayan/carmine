import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

/** Cliente Drizzle sobre um pool do pg; usado pela API, pelos CLIs e pelos testes. */
export function createDatabase(pool: Pool): Database {
  return drizzle({ client: pool, schema, casing: 'snake_case' });
}
