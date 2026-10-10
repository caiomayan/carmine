import { Pool } from 'pg';
import { loadConfig } from '../config/config.js';
import { createDatabase } from '../database/database.js';
import { GameServerRegistry } from './game-server-registry.js';
import { runServersCli } from './servers.cli-commands.js';

// pnpm --filter @carmine/api servers <comando>; na imagem: node dist/game-servers/servers.cli.js
const config = loadConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
try {
  process.exitCode = await runServersCli(process.argv.slice(2), {
    registry: new GameServerRegistry(createDatabase(pool)),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
} finally {
  await pool.end();
}
