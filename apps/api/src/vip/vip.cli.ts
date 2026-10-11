import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { loadConfig } from '../config/config.js';
import { createDatabase } from '../database/database.js';
import { accounts } from '../database/schema.js';
import { EquippedCache } from '../equipped/equipped-cache.js';
import { VALKEY_COMMAND_TIMEOUT_MS } from '../valkey/valkey.module.js';
import { runVipCli } from './vip.cli-commands.js';
import { VipPeriods } from './vip-periods.js';

// pnpm --filter @carmine/api vip <comando>; na imagem: node dist/vip/vip.cli.js
const config = loadConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
const db = createDatabase(pool);
// Só para invalidar o equipped/v5; com o Valkey fora, o aviso sai e a resposta velha expira sozinha.
const valkey = new Redis(config.valkeyUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  commandTimeout: VALKEY_COMMAND_TIMEOUT_MS,
});
valkey.on('error', () => {});
const cache = new EquippedCache(valkey, db);
try {
  process.exitCode = await runVipCli(process.argv.slice(2), {
    findAccountId: async (steamId) => {
      const [row] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.steamId, BigInt(steamId)));
      return row?.id ?? null;
    },
    vipPeriods: new VipPeriods(db),
    invalidateEquipped: (steamId) => cache.invalidate(steamId),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
} finally {
  valkey.disconnect();
  await pool.end();
}
