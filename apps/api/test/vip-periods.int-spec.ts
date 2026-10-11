import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { AvatarRefresher } from '../src/accounts/avatar-refresher.js';
import { accounts } from '../src/database/schema.js';
import { runVipCli } from '../src/vip/vip.cli-commands.js';
import { NoVipToRevoke, VipPeriods } from '../src/vip/vip-periods.js';
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

  describe('pela Staff, com auditoria', () => {
    const staff = { actorSteamId: steamIdFor(900), reason: 'beta fechado' };

    it('conceder registra autor, ação, alvo, motivo, horário e o que mudou', async () => {
      const { id, steamId } = await newAccount();
      const now = new Date('2026-10-11T12:00:00Z');

      await vip.grant(id, 30, now, staff);

      expect(await vip.auditOf(id)).toEqual([
        {
          actorSteamId: staff.actorSteamId,
          action: 'vip_grant',
          targetSteamId: steamId,
          reason: 'beta fechado',
          details: {
            days: 30,
            endsAtBefore: null,
            endsAtAfter: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
          },
          createdAt: now,
        },
      ]);
    });

    it('revogar encerra o Período agora, apaga os encadeados e registra', async () => {
      const { id } = await newAccount();
      const start = new Date('2026-10-01T12:00:00Z');
      const now = new Date('2026-10-11T12:00:00Z');
      await vip.grant(id, 30, start);
      await vip.grant(id, 30, start); // encadeado: começa no fim do primeiro

      const status = await vip.revoke(id, { ...staff, reason: 'reembolso' }, now);

      expect(status).toEqual({ active: false, endsAt: null, endedAt: now });
      const [entry] = await vip.auditOf(id);
      expect(entry).toMatchObject({
        action: 'vip_revoke',
        reason: 'reembolso',
        details: { endsAtBefore: new Date(start.getTime() + 60 * DAY_MS).toISOString() },
      });
    });

    it('revogar sem VIP ativo é recusado e não registra nada', async () => {
      const { id } = await newAccount();

      await expect(vip.revoke(id, staff)).rejects.toThrow(NoVipToRevoke);
      expect(await vip.auditOf(id)).toEqual([]);
    });
  });

  describe('CLI', () => {
    const invalidated: string[] = [];

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
        invalidateEquipped: async (steamId) => {
          invalidated.push(steamId);
        },
        out: (line) => out.push(line),
        err: (line) => err.push(line),
      });
      return { code, out: out.join('\n'), err: err.join('\n') };
    }

    const by = ['--by', steamIdFor(900)];

    it('grant concede os dias, invalida o equipped e status mostra até quando e o log', async () => {
      const { steamId, id } = await newAccount();

      const granted = await run(
        'grant',
        '--steam-id',
        steamId,
        '--days',
        '1',
        ...by,
        '--reason',
        'teste',
      );

      expect(granted.code).toBe(0);
      expect((await vip.statusOf(id)).active).toBe(true);
      expect(invalidated).toContain(steamId);
      const status = await run('status', '--steam-id', steamId);
      expect(status.out).toMatch(new RegExp(`^${steamId}: VIP até \\d{4}-`));
      expect(status.out).toContain(`vip_grant por ${steamIdFor(900)}: teste`);
    });

    it('revoke tira o VIP e registra', async () => {
      const { steamId, id } = await newAccount();
      await run('grant', '--steam-id', steamId, '--days', '5', ...by, '--reason', 'teste');

      const revoked = await run('revoke', '--steam-id', steamId, ...by, '--reason', 'fim do teste');

      expect(revoked.code, revoked.err).toBe(0);
      expect((await vip.statusOf(id)).active).toBe(false);
      expect((await vip.auditOf(id))[0]?.action).toBe('vip_revoke');
    });

    it.each([
      [['grant', '--steam-id', '123', '--days', '1', ...by, '--reason', 'x'], '--steam-id'],
      [['grant', '--steam-id', steamIdFor(500), '--days', '0', ...by, '--reason', 'x'], '--days'],
      [['grant', '--steam-id', steamIdFor(500), '--days', '1', '--reason', 'x'], '--by'],
      [['grant', '--steam-id', steamIdFor(500), '--days', '1', ...by], '--reason'],
      [['grant', '--steam-id', steamIdFor(500), '--days', '1', ...by, '--reason', ' '], '--reason'],
      [
        ['grant', '--steam-id', steamIdFor(500), '--days', '1', ...by, '--reason', 'x'],
        'nenhuma Conta',
      ],
      [['revoke', '--steam-id', steamIdFor(500), ...by], '--reason'],
      [['frobnicate'], 'Uso:'],
    ])('recusa %j', async (argv, message) => {
      const result = await run(...argv);

      expect(result.code).toBe(1);
      expect(result.err).toContain(message);
    });

    it('revoke de quem não tem VIP é recusado', async () => {
      const { steamId } = await newAccount();

      const result = await run('revoke', '--steam-id', steamId, ...by, '--reason', 'x');

      expect(result.code).toBe(1);
      expect(result.err).toContain('não tem VIP ativo');
    });
  });
});
