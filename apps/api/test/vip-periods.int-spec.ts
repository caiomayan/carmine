import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { AvatarRefresher } from '../src/accounts/avatar-refresher.js';
import { accounts } from '../src/database/schema.js';
import { runVipCli } from '../src/vip/vip.cli-commands.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { steamIdFor } from './support/app.js';
import { startPostgres, type TestPostgres } from './support/postgres.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Períodos VIP', () => {
  let postgres: TestPostgres;
  let vip: VipPeriods;
  let accountsService: AccountsService;
  let next = 1;

  beforeAll(async () => {
    postgres = await startPostgres();
    vip = new VipPeriods(postgres.db);
    accountsService = new AccountsService(postgres.db, new AvatarRefresher(postgres.db, null));
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  async function newAccount() {
    const steamId = steamIdFor(next++);
    const { account } = await accountsService.claimOnLogin(steamId);
    return { steamId, id: account.id };
  }

  it('uma Conta nova não tem VIP', async () => {
    const { id } = await newAccount();

    expect(await vip.statusOf(id)).toEqual({ active: false, endsAt: null, endedAt: null });
  });

  it('conceder com VIP ativo soma os dias ao fim do Período', async () => {
    const { id } = await newAccount();
    const now = new Date('2026-10-11T12:00:00Z');

    await vip.grant(id, 10, now);
    const status = await vip.grant(id, 90, now);

    expect(status).toEqual({
      active: true,
      endsAt: new Date(now.getTime() + 100 * DAY_MS),
      endedAt: null,
    });
  });

  it('concessões simultâneas não se sobrepõem', async () => {
    const { id } = await newAccount();
    const now = new Date('2026-10-11T12:00:00Z');

    await Promise.all([vip.grant(id, 30, now), vip.grant(id, 30, now)]);

    expect((await vip.statusOf(id, now)).endsAt).toEqual(new Date(now.getTime() + 60 * DAY_MS));
  });

  describe('CLI', () => {
    async function run(...argv: string[]) {
      const out: string[] = [];
      const err: string[] = [];
      const code = await runVipCli(argv, {
        findAccountId: async (steamId) => {
          const [row] = await postgres.db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.steamId, BigInt(steamId)));
          return row?.id ?? null;
        },
        vipPeriods: vip,
        out: (line) => out.push(line),
        err: (line) => err.push(line),
      });
      return { code, out: out.join('\n'), err: err.join('\n') };
    }

    it('grant concede os dias e status mostra até quando', async () => {
      const { steamId, id } = await newAccount();

      const granted = await run('grant', '--steam-id', steamId, '--days', '1');

      expect(granted.code).toBe(0);
      expect((await vip.statusOf(id)).active).toBe(true);
      const status = await run('status', '--steam-id', steamId);
      expect(status.out).toMatch(new RegExp(`^${steamId}: VIP até \\d{4}-`));
    });

    it.each([
      [['grant', '--steam-id', '123', '--days', '1'], '--steam-id'],
      [['grant', '--steam-id', steamIdFor(500), '--days', '0'], '--days'],
      [['grant', '--steam-id', steamIdFor(500), '--days', '1'], 'nenhuma Conta'],
      [['revoke'], 'Uso:'],
    ])('recusa %j', async (argv, message) => {
      const result = await run(...argv);

      expect(result.code).toBe(1);
      expect(result.err).toContain(message);
    });
  });
});
