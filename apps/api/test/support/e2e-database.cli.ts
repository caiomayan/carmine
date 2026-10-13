import pg from 'pg';

/**
 * Banco próprio do E2E do web (`carmine_e2e`, no mesmo Postgres do Compose): o E2E nunca escreve
 * no banco de desenvolvimento. O Playwright roda:
 * - `prepare` antes de subir a API: cria o banco se ainda não existe (as migrações vêm depois);
 * - `reset` no globalSetup: esvazia as tabelas, para cada execução começar do zero.
 *
 * Uso: node test/support/e2e-database.cli.ts <prepare|reset> (lê DATABASE_URL, que deve apontar
 * para o banco do E2E).
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL ausente');
const database = new URL(url).pathname.slice(1);
// Só um banco claramente de teste: um engano aqui apagaria o banco de desenvolvimento.
if (!/^[a-z0-9_]+_e2e$/.test(database)) {
  throw new Error(`O banco do E2E precisa terminar em _e2e (recebido: "${database}")`);
}

const command = process.argv[2];
if (command === 'prepare') {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query('select 1 from pg_database where datname = $1', [database]);
    if (found.rowCount === 0) await client.query(`create database "${database}"`);
  } finally {
    await client.end();
  }
} else if (command === 'reset') {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      "select quote_ident(tablename) as name from pg_tables where schemaname = 'public'",
    );
    if (rows.length > 0) {
      await client.query(`truncate ${rows.map((r) => r.name).join(', ')} restart identity cascade`);
    }
  } finally {
    await client.end();
  }
} else {
  console.error('Uso: e2e-database.cli.ts <prepare|reset>');
  process.exitCode = 1;
}
