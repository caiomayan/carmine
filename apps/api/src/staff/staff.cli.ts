import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { loadConfig } from '../config/config.js';
import { createDatabase } from '../database/database.js';
import { accounts } from '../database/schema.js';
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
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
} finally {
  await pool.end();
}
