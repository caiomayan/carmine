import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { DisplayNames } from '../accounts/display-names.js';
import { loadConfig } from '../config/config.js';
import { createDatabase } from '../database/database.js';
import { accounts } from '../database/schema.js';
import { RankingRemovals } from '../stats/ranking-removals.js';
import { runStaffCli } from './staff.cli-commands.js';
import { StaffRoles } from './staff-roles.js';

// pnpm --filter @carmine/api staff <comando>; na imagem: node dist/staff/staff.cli.js
const config = loadConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, max: 1 });
const db = createDatabase(pool);
try {
  process.exitCode = await runStaffCli(process.argv.slice(2), {
    findAccountId: async (steamId) => {
      const [row] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.steamId, BigInt(steamId)));
      return row?.id ?? null;
    },
    roles: new StaffRoles(db),
    displayNames: new DisplayNames(db),
    rankingRemovals: new RankingRemovals(db),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
} finally {
  await pool.end();
}
