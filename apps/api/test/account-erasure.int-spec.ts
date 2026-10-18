import {
  ANONYMIZED_DISPLAY_NAME,
  accountAnonymizedSchema,
  playerConnectResultSchema,
  type StaffRole,
  staffAccountSearchSchema,
  staffAuditPageSchema,
  staffErrorSchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountErasure } from '../src/accounts/account-erasure.js';
import { runAccountsCli } from '../src/accounts/accounts.cli-commands.js';
import type { ReservedPublicIds } from '../src/accounts/reserved-public-ids.js';
import { SessionStore } from '../src/auth/sessions.js';
import { accounts, inventoryItems, presets, vipPeriods } from '../src/database/schema.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const DEAGLE = 66;
const FOUNDER = steamIdFor(9999);

/**
 * Exclusão de dados (S08, Política de Privacidade, seção 8): um pedido resulta na Conta
 * anonimizada, pelo painel da Staff (só o Dono) ou pelo CLI.
 */
describe('Exclusão de dados (S08)', () => {
  let t: TestApp;
  let next = 1;
  let owner: Awaited<ReturnType<typeof member>>;

  beforeAll(async () => {
    t = await startTestApp();
    owner = await member('owner');
  });

  afterAll(async () => {
    await t?.stop();
  });

  async function member(role: StaffRole | null, options?: { vipUntil?: number }) {
    const player = await signedInPlayer(t, next++, options);
    if (role) {
      await t.app
        .get(StaffRoles)
        .set(player.account.id, role, { actorSteamId: FOUNDER, reason: 'teste' });
    }
    return player;
  }

  async function connect(steamId: string, steamName = 'jogador') {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName },
    });
    expect(response.statusCode, response.body).toBe(200);
    return playerConnectResultSchema.parse(response.json());
  }

  const anonymize = (by: Awaited<ReturnType<typeof member>>, publicId: number) =>
    by.call('POST', `/api/staff/accounts/${publicId}/anonymize`, {
      reason: 'pedido de exclusão pelo contato, protocolo 7',
    });

  const profileStatus = async (publicId: number) =>
    (await t.app.inject({ method: 'GET', url: `/api/profiles/${publicId}` })).statusCode;

  it('de ponta a ponta: o pedido anonimiza a Conta e quem voltar a jogar ganha uma Conta nova', async () => {
    const target = await member(null, { vipUntil: Date.now() + 86_400_000 });
    await connect(target.steamId, 'Fulano de Tal');
    await target.equip(await target.add({ id: DEAGLE, wear: 0.3, seed: 1000 }));
    await t.app.inject({
      method: 'PUT',
      url: `/api/server/players/${target.steamId}/chat-preference`,
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { hidden: true },
    });
    const { publicId } = target.account;
    expect(await profileStatus(publicId)).toBe(200);

    const response = await anonymize(owner, publicId);

    expect(response.statusCode, response.body).toBe(200);
    expect(accountAnonymizedSchema.parse(response.json())).toMatchObject({
      publicId,
      steamIdRetained: false,
    });
    // O Perfil some, também pelo SteamID64.
    expect(await profileStatus(publicId)).toBe(404);
    const located = await t.app.inject({ url: `/api/profiles/by-steam-id/${target.steamId}` });
    expect(located.statusCode).toBe(404);
    // Nada que identifique a pessoa nem o que ela montou fica na Conta.
    const [row] = await t.postgres.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, target.account.id));
    expect(row).toMatchObject({
      steamId: -BigInt(publicId),
      steamName: '',
      displayName: ANONYMIZED_DISPLAY_NAME,
      avatarUrl: null,
      claimedAt: null,
      chatHidden: false,
    });
    expect(row?.anonymizedAt).toBeInstanceOf(Date);
    const accountId = target.account.id;
    for (const table of [inventoryItems, presets, vipPeriods]) {
      const rows = await t.postgres.db.select().from(table).where(eq(table.accountId, accountId));
      expect(rows).toEqual([]);
    }
    // As sessões do site caíram.
    expect((await target.call('GET', '/api/me')).statusCode).toBe(401);
    // A Staff não acha mais a Conta; o log guarda a ação.
    const search = await owner.call('GET', `/api/staff/accounts?q=${target.steamId}`);
    expect(staffAccountSearchSchema.parse(search.json()).accounts).toEqual([]);
    const detail = await owner.call('GET', `/api/staff/accounts/${publicId}`);
    expect(detail.statusCode).toBe(404);
    const audit = await owner.call('GET', `/api/staff/audit?action=account_anonymize`);
    expect(staffAuditPageSchema.parse(audit.json()).entries).toEqual([
      expect.objectContaining({
        action: 'account_anonymize',
        reason: 'pedido de exclusão pelo contato, protocolo 7',
        details: expect.objectContaining({ steamIdRetained: false }),
      }),
    ]);

    // Voltou a jogar: Conta nova, nada herdado.
    const again = await connect(target.steamId, 'Fulano de Tal');
    expect(again.publicId).not.toBe(publicId);
    expect(again).toMatchObject({ isFirstConnect: true, chatHidden: false });
  });

  it('com um ban valendo, o SteamID64 fica até o ban acabar, e o ban continua valendo', async () => {
    const target = await member(null);
    await connect(target.steamId, 'Trapaceiro');
    const punished = await owner.call(
      'POST',
      `/api/staff/accounts/${target.account.publicId}/sanctions`,
      {
        category: 'cheat',
        reason: 'aimbot',
        measures: [{ type: 'ban', durationMinutes: null }],
        evidenceUrl: 'https://youtu.be/demo123',
      },
    );
    expect(punished.statusCode, punished.body).toBe(201);

    const response = await anonymize(owner, target.account.publicId);

    expect(accountAnonymizedSchema.parse(response.json()).steamIdRetained).toBe(true);
    expect(await profileStatus(target.account.publicId)).toBe(404);
    const banned = await connect(target.steamId, 'Trapaceiro');
    expect(banned.publicId).toBe(target.account.publicId);
    expect(banned.displayName).toBe(ANONYMIZED_DISPLAY_NAME);
    expect(banned.sanctions.map((s) => s.type)).toEqual(['ban']);

    // Recurso aceito: no próximo connect o vínculo se desfaz e nasce uma Conta nova.
    const detail = await owner.call('GET', `/api/staff/accounts/${target.account.publicId}`);
    expect(detail.json()).toMatchObject({ account: { anonymized: true } });
    const ban = (detail.json() as { sanctions: { id: string }[] }).sanctions[0];
    const revoked = await owner.call('POST', `/api/staff/sanctions/${ban?.id}/revoke`, {
      reason: 'recurso aceito',
      appealAccepted: true,
    });
    expect(revoked.statusCode, revoked.body).toBe(200);
    const fresh = await connect(target.steamId, 'Trapaceiro');
    expect(fresh.publicId).not.toBe(target.account.publicId);
    expect(fresh.sanctions).toEqual([]);
  });

  it('só o Dono anonimiza; Conta da Staff sai da Staff antes; repetir é recusado', async () => {
    const admin = await member('admin');
    const moderator = await member('moderator');
    const target = await member(null);

    const byAdmin = await anonymize(admin, target.account.publicId);
    expect(byAdmin.statusCode).toBe(403);
    expect(staffErrorSchema.parse(byAdmin.json()).code).toBe('forbidden');

    const staffTarget = await anonymize(owner, moderator.account.publicId);
    expect(staffErrorSchema.parse(staffTarget.json()).code).toBe('target_protected');

    expect((await anonymize(owner, target.account.publicId)).statusCode).toBe(200);
    // Detachada: a Conta já não aparece para a Staff.
    expect((await anonymize(owner, target.account.publicId)).statusCode).toBe(404);
  });

  describe('CLI accounts anonymize', () => {
    async function cli(...argv: string[]) {
      const lines: string[] = [];
      const errors: string[] = [];
      const exitCode = await runAccountsCli(argv, {
        findAccountId: async (publicId) => (await t.accounts.findByPublicId(publicId))?.id ?? null,
        findAccountIdBySteamId: async () => null,
        reserved: {} as ReservedPublicIds,
        erasure: new AccountErasure(t.postgres.db, {
          dropSessions: (accountId) => t.app.get(SessionStore).destroyAllOf(accountId),
          invalidateEquipped: async () => {},
        }),
        out: (line) => lines.push(line),
        err: (line) => errors.push(line),
      });
      return { exitCode, output: lines.join('\n'), errors: errors.join('\n') };
    }

    it('anonimiza pelo ID público, com auditoria, e recusa repetir', async () => {
      const target = await member(null);
      const id = String(target.account.publicId);

      const result = await cli(
        'anonymize',
        '--public-id',
        id,
        '--by',
        FOUNDER,
        '--reason',
        'e-mail',
      );

      expect(result).toMatchObject({ exitCode: 0, output: expect.stringContaining('anonimizada') });
      expect(await profileStatus(target.account.publicId)).toBe(404);
      const repeated = await cli('anonymize', '--public-id', id, '--by', FOUNDER, '--reason', 'x');
      expect(repeated.exitCode).toBe(1);
      expect(repeated.errors).toMatch(/já foi anonimizada/);
    });

    it('falha com código 1 sem motivo, com ID inválido ou Conta inexistente', async () => {
      expect((await cli('anonymize', '--public-id', '10016', '--by', FOUNDER)).exitCode).toBe(1);
      expect(
        (await cli('anonymize', '--public-id', 'abc', '--by', FOUNDER, '--reason', 'x')).exitCode,
      ).toBe(1);
      const missing = await cli(
        'anonymize',
        '--public-id',
        '999999',
        '--by',
        FOUNDER,
        '--reason',
        'x',
      );
      expect(missing.errors).toMatch(/nenhuma Conta/);
      expect((await cli('explode')).errors).toMatch(/Uso:/);
    });
  });
});
