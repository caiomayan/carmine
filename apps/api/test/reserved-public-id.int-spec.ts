import {
  formerPublicIdsSchema,
  playerConnectResultSchema,
  staffAuditPageSchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountErasure } from '../src/accounts/account-erasure.js';
import { runAccountsCli } from '../src/accounts/accounts.cli-commands.js';
import {
  AccountPublicIdAlreadyReserved,
  PublicIdOutOfReservedRange,
  PublicIdTaken,
  ReservedPublicIds,
} from '../src/accounts/reserved-public-ids.js';
import { accounts } from '../src/database/schema.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const FOUNDER = steamIdFor(9999);

/**
 * ID reservado por reatribuição (S10, ADR 0013): a Staff troca o ID automático de uma Conta por um
 * reservado, uma única vez; o ID antigo continua valendo como link (301).
 */
describe('ID reservado por reatribuição (S10)', () => {
  let t: TestApp;
  let reserved: ReservedPublicIds;
  let next = 1;
  let staff: Awaited<ReturnType<typeof signedInPlayer>>;
  const by = () => ({ actorSteamId: staff.steamId, reason: 'amigo do beta' });

  beforeAll(async () => {
    t = await startTestApp();
    reserved = t.app.get(ReservedPublicIds);
    staff = await signedInPlayer(t, next++);
    await t.app
      .get(StaffRoles)
      .set(staff.account.id, 'owner', { actorSteamId: FOUNDER, reason: 'teste' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  async function newAccount() {
    const steamId = steamIdFor(1000 + next++);
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: 'amigo' },
    });
    expect(response.statusCode, response.body).toBe(200);
    const { publicId } = playerConnectResultSchema.parse(response.json());
    const account = await t.accounts.findBySteamId(steamId);
    if (!account) throw new Error('Conta não criada');
    return { steamId, publicId, accountId: account.id };
  }

  const profileStatus = async (publicId: number) =>
    (await t.app.inject({ method: 'GET', url: `/api/profiles/${publicId}` })).statusCode;

  it('troca o ID automático por um reservado, com auditoria, e guarda o antigo como link', async () => {
    const friend = await newAccount();
    expect(friend.publicId).toBeGreaterThanOrEqual(10_000);

    const result = await reserved.assign(friend.accountId, 7, by());

    expect(result).toEqual({ previousPublicId: friend.publicId, publicId: 7 });
    expect(await profileStatus(7)).toBe(200);
    // O ID antigo não é mais um Perfil: o web o redireciona (301) pela lista de IDs antigos.
    expect(await profileStatus(friend.publicId)).toBe(404);
    const former = await t.app.inject({ method: 'GET', url: '/api/profiles/former-ids' });
    expect(formerPublicIdsSchema.parse(former.json()).redirects).toContainEqual({
      from: friend.publicId,
      to: 7,
    });
    // Quem entra no jogo recebe o ID novo.
    const again = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId: friend.steamId, steamName: 'amigo' },
    });
    expect(playerConnectResultSchema.parse(again.json()).publicId).toBe(7);
    // E o log de auditoria registra quem, o quê e por quê.
    const audit = await staff.call('GET', '/api/staff/audit?action=account_reserved_id');
    expect(staffAuditPageSchema.parse(audit.json()).entries).toContainEqual(
      expect.objectContaining({
        action: 'account_reserved_id',
        reason: 'amigo do beta',
        actor: expect.objectContaining({ steamId: staff.steamId }),
        targetAccount: expect.objectContaining({ steamId: friend.steamId, publicId: 7 }),
        details: { from: friend.publicId, to: 7 },
      }),
    );
  });

  it('só uma vez por Conta: depois de reservado, o ID é imutável', async () => {
    const friend = await newAccount();
    await reserved.assign(friend.accountId, 8, by());

    await expect(reserved.assign(friend.accountId, 9, by())).rejects.toBeInstanceOf(
      AccountPublicIdAlreadyReserved,
    );
    expect((await t.accounts.findById(friend.accountId))?.publicId).toBe(8);
  });

  it('uma Conta que já tem ID abaixo de 10.000 (atribuído à mão) também não troca', async () => {
    const friend = await newAccount();
    await t.postgres.db
      .update(accounts)
      .set({ publicId: 20 })
      .where(eq(accounts.id, friend.accountId));

    await expect(reserved.assign(friend.accountId, 21, by())).rejects.toBeInstanceOf(
      AccountPublicIdAlreadyReserved,
    );
  });

  it('não colide com o ID de outra Conta', async () => {
    const first = await newAccount();
    const second = await newAccount();
    await reserved.assign(first.accountId, 100, by());

    await expect(reserved.assign(second.accountId, 100, by())).rejects.toBeInstanceOf(
      PublicIdTaken,
    );
    // A falha não gasta a única troca da Conta.
    expect(await reserved.assign(second.accountId, 101, by())).toMatchObject({ publicId: 101 });
  });

  it('só aceita IDs de 1 a 9.999', async () => {
    const friend = await newAccount();

    for (const invalid of [0, -5, 10_000, 12_345, 1.5, Number.NaN]) {
      await expect(reserved.assign(friend.accountId, invalid, by())).rejects.toBeInstanceOf(
        PublicIdOutOfReservedRange,
      );
    }
    expect((await t.accounts.findById(friend.accountId))?.publicId).toBe(friend.publicId);
  });

  it('simultâneas para o mesmo ID: uma vence, a outra recebe ID ocupado', async () => {
    const a = await newAccount();
    const b = await newAccount();

    const results = await Promise.allSettled([
      reserved.assign(a.accountId, 500, by()),
      reserved.assign(b.accountId, 500, by()),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(PublicIdTaken);
  });

  it('Conta anonimizada não recebe ID reservado', async () => {
    const friend = await newAccount();
    await new AccountErasure(t.postgres.db, {
      dropSessions: async () => {},
      invalidateEquipped: async () => {},
    }).anonymize(friend.accountId, by());

    await expect(reserved.assign(friend.accountId, 600, by())).rejects.toThrow(/anonimizada/);
  });

  describe('CLI accounts assign-reserved-id', () => {
    const run = async (args: string[]) => {
      const out: string[] = [];
      const err: string[] = [];
      const code = await runAccountsCli(args, {
        findAccountId: async () => null,
        findAccountIdBySteamId: async (steamId) =>
          (await t.accounts.findBySteamId(steamId))?.id ?? null,
        erasure: {} as AccountErasure,
        reserved,
        out: (line) => out.push(line),
        err: (line) => err.push(line),
      });
      return { code, out: out.join('\n'), err: err.join('\n') };
    };

    it('reatribui e diz o que mudou e para onde o link antigo vai', async () => {
      const friend = await newAccount();

      const { code, out } = await run([
        'assign-reserved-id',
        '--steam-id',
        friend.steamId,
        '--public-id',
        '1',
        '--by',
        staff.steamId,
        '--reason',
        'fundador do beta',
      ]);

      expect(code).toBe(0);
      expect(out).toContain(`#${friend.publicId} → #1`);
      expect(out).toContain(`/${friend.publicId}`);
      expect((await t.accounts.findById(friend.accountId))?.publicId).toBe(1);
    });

    it('recusa com mensagem clara: já reservado, ocupado, fora da faixa, sem Conta, sem motivo', async () => {
      const friend = await newAccount();
      const base = ['assign-reserved-id', '--steam-id', friend.steamId, '--by', staff.steamId];
      const reason = ['--reason', 'teste'];

      const outOfRange = await run([...base, '--public-id', '10000', ...reason]);
      const taken = await run([...base, '--public-id', '1', ...reason]);
      const noAccount = await run([
        'assign-reserved-id',
        '--steam-id',
        steamIdFor(777_777),
        '--public-id',
        '2',
        '--by',
        staff.steamId,
        ...reason,
      ]);
      const noReason = await run([...base, '--public-id', '2']);
      await run([...base, '--public-id', '3', ...reason]);
      const again = await run([...base, '--public-id', '4', ...reason]);

      for (const failure of [outOfRange, taken, noAccount, noReason, again]) {
        expect(failure.code).toBe(1);
      }
      expect(outOfRange.err).toContain('1 a 9999');
      expect(taken.err).toContain('já pertence');
      expect(noAccount.err).toContain('nenhuma Conta');
      expect(noReason.err).toContain('--reason');
      expect(again.err).toContain('imutável');
    });
  });
});
