import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { AppModule } from '../app.module.js';
import { loadConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { accounts } from '../database/schema.js';
import { VipCompensation } from '../vip/vip-compensation.js';
import { runPaymentsCli } from './payments.cli-commands.js';
import { Payments } from './payments.js';

// pnpm --filter @carmine/api payments <comando>; na imagem: node dist/payments/payments.cli.js
// Sobe a API sem escutar porta (os mesmos serviços do site) e sai.
const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadConfig(process.env)), {
  logger: ['error', 'warn'],
});
let code = 1;
try {
  const db = app.get(DATABASE, { strict: false });
  code = await runPaymentsCli(process.argv.slice(2), {
    payments: app.get(Payments, { strict: false }),
    compensation: app.get(VipCompensation, { strict: false }),
    findAccountId: async (steamId) => {
      const [row] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.steamId, BigInt(steamId)));
      return row?.id ?? null;
    },
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
} finally {
  await app.close();
}
process.exit(code);
