import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { SessionStore } from '../auth/sessions.js';
import { loadConfig } from '../config/config.js';
import { createDatabase } from '../database/database.js';
import { accounts } from '../database/schema.js';
import { EquippedCache } from '../equipped/equipped-cache.js';
import { VALKEY_COMMAND_TIMEOUT_MS } from '../valkey/valkey.module.js';
import { AccountErasure } from './account-erasure.js';
import { runAccountsCli } from './accounts.cli-commands.js';
import { ReservedPublicIds } from './reserved-public-ids.js';

// pnpm --filter @carmine/api accounts <comando>; na imagem: node dist/accounts/accounts.cli.js
const config = loadConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
const db = createDatabase(pool);
// Para derrubar as sessões e invalidar o equipped/v5; com o Valkey fora, o CLI avisa.
const valkey = new Redis(config.valkeyUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  commandTimeout: VALKEY_COMMAND_TIMEOUT_MS,
});
valkey.on('error', () => {});
const sessions = new SessionStore(valkey, config.session);
const cache = new EquippedCache(valkey, db);
try {
  process.exitCode = await runAccountsCli(process.argv.slice(2), {
    findAccountId: async (publicId) => {
      const [row] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.publicId, publicId));
      return row?.id ?? null;
    },
    findAccountIdBySteamId: async (steamId) => {
      const [row] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.steamId, BigInt(steamId)));
      return row?.id ?? null;
    },
    reserved: new ReservedPublicIds(db),
    erasure: new AccountErasure(db, {
      dropSessions: (accountId) => sessions.destroyAllOf(accountId),
      invalidateEquipped: (steamId) => cache.invalidate(steamId),
    }),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
} finally {
  valkey.disconnect();
  await pool.end();
}
