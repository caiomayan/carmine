import {
  currentSessionSchema,
  displayNameChangedSchema,
  displayNameErrorSchema,
  profileSchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DisplayNames } from '../src/accounts/display-names.js';
import { accounts, staffAuditLog } from '../src/database/schema.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Perfil completo (S11): Nome de exibição e Perfil privado', () => {
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const connect = async (steamId: string, steamName: string) => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<{ displayName: string; publicId: number }>();
  };

  /** Uma Conta que jogou (nome Steam já gravado) e depois entrou no site. */
  const player = async (steamName = 'coldzera') => {
    const n = next++;
    await connect(steamIdFor(n), steamName);
    return signedInPlayer(t, n);
  };

  type Player = Awaited<ReturnType<typeof player>>;

  const rename = (p: Player, displayName: string) =>
    p.call('PUT', '/api/me/display-name', { displayName });

  const errorOf = (response: { json: () => unknown }) =>
    displayNameErrorSchema.parse(response.json());

  const profileOf = async (p: Player) =>
    profileSchema.parse(
      (await t.app.inject({ url: `/api/profiles/${p.account.publicId}` })).json(),
    );

  /** Volta a última troca no tempo, como se tivesse sido há `days` dias. */
  const backdate = (accountId: string, days: number) =>
    t.postgres.db
      .update(accounts)
      .set({ displayNameChangedAt: new Date(Date.now() - days * DAY_MS) })
      .where(eq(accounts.id, accountId));

  describe('troca do nome', () => {
    it('troca, normaliza, aparece no Perfil e no próximo connect no jogo', async () => {
      const p = await player('coldzera');

      const response = await rename(p, '  Fer   Ninja ');

      expect(response.statusCode, response.body).toBe(200);
      const changed = displayNameChangedSchema.parse(response.json());
      expect(changed.displayName).toBe('Fer Ninja');
      expect(new Date(changed.nextChangeAt).getTime()).toBeGreaterThan(Date.now() + 6.9 * DAY_MS);
      expect((await profileOf(p)).displayName).toBe('Fer Ninja');
      // O jogador reconecta (mesmo trocando o nome na Steam): vale o nome da plataforma.
      expect(await connect(p.steamId, 'outro nome steam')).toMatchObject({
        displayName: 'Fer Ninja',
        publicId: p.account.publicId,
      });
    });

    it('antes de 7 dias a troca é recusada com a data em que fica livre', async () => {
      const p = await player();
      expect((await rename(p, 'Primeiro')).statusCode).toBe(200);

      const response = await rename(p, 'Segundo');

      expect(response.statusCode).toBe(409);
      const error = errorOf(response);
      expect(error.code).toBe('too_soon');
      expect(error.message).toMatch(/a partir de .* \(horário de Brasília\)/);
      expect(new Date(error.nextChangeAt ?? '').getTime()).toBeGreaterThan(
        Date.now() + 6.9 * DAY_MS,
      );
      expect((await connect(p.steamId, 'coldzera')).displayName).toBe('Primeiro');
    });

    it('depois de 7 dias troca de novo', async () => {
      const p = await player();
      await rename(p, 'Primeiro');
      await backdate(p.account.id, 7.01);

      const response = await rename(p, 'Segundo');

      expect(response.statusCode, response.body).toBe(200);
      expect((await connect(p.steamId, 'coldzera')).displayName).toBe('Segundo');
    });

    it('repetir o nome atual não gasta o prazo', async () => {
      const p = await player();
      await rename(p, 'Mesmo Nome');
      await backdate(p.account.id, 8);

      expect((await rename(p, ' Mesmo  Nome ')).statusCode).toBe(200);

      const [row] = await t.postgres.db
        .select()
        .from(accounts)
        .where(eq(accounts.id, p.account.id));
      expect(Date.now() - (row?.displayNameChangedAt?.getTime() ?? 0)).toBeGreaterThan(
        7.9 * DAY_MS,
      );
    });

    it('não é único', async () => {
      const a = await player();
      const b = await player();

      expect((await rename(a, 'Igualzinho')).statusCode).toBe(200);
      expect((await rename(b, 'Igualzinho')).statusCode).toBe(200);
    });

    it.each([
      ['F', 'too_short'],
      ['a'.repeat(25), 'too_long'],
      ['<b>Fer</b>', 'invalid_chars'],
      ['Filho da Puta', 'offensive'],
      ['c4r4lh0', 'offensive'],
    ])('recusa "%s" (%s) sem gastar o prazo', async (name, code) => {
      const p = await player();

      const response = await rename(p, name);

      expect(response.statusCode).toBe(422);
      expect(errorOf(response).code).toBe(code);
      expect((await rename(p, 'Nome Bom')).statusCode).toBe(200);
    });

    it('corpo fora do formato é invalid_body; sem sessão é 401', async () => {
      const p = await player();
      const bad = await p.call('PUT', '/api/me/display-name', { nome: 'x' });
      expect(bad.statusCode).toBe(400);
      expect(errorOf(bad).code).toBe('invalid_body');

      const anonymous = await t.app.inject({
        method: 'PUT',
        url: '/api/me/display-name',
        payload: { displayName: 'Fer' },
      });
      expect(anonymous.statusCode).toBe(401);
    });

    it('Conta não reivindicada não tem nome próprio', async () => {
      const n = next++;
      await connect(steamIdFor(n), 'so jogou');
      const unclaimed = await t.accounts.findBySteamId(steamIdFor(n));

      await expect(
        t.app.get(DisplayNames).change(unclaimed?.id ?? '', 'Quero Um Nome'),
      ).rejects.toMatchObject({ code: 'not_claimed' });
    });

    it('/api/me diz se há nome próprio e quando dá para trocar', async () => {
      const p = await player();
      const before = currentSessionSchema.parse((await p.call('GET', '/api/me')).json());
      expect(before.displayNameChange).toEqual({ custom: false, nextChangeAt: null });

      await rename(p, 'Com Nome');

      const after = currentSessionSchema.parse((await p.call('GET', '/api/me')).json());
      expect(after.displayNameChange.custom).toBe(true);
      expect(after.account.displayName).toBe('Com Nome');
      expect(after.displayNameChange.nextChangeAt).not.toBeNull();
    });
  });

  describe('reset pela Staff', () => {
    const staff = (steamId: string) => ({ actorSteamId: steamId, reason: 'nome ofensivo' });

    it('com nome próprio: volta ao nome Steam, recomeça o prazo e registra na auditoria', async () => {
      const p = await player('nome steam');
      await rename(p, 'Nome Proprio');
      await backdate(p.account.id, 30);
      const owner = await player('dono');

      const reset = await t.app.get(DisplayNames).reset(p.account.id, staff(owner.steamId));

      expect(reset.displayName).toBe('nome steam');
      expect((await connect(p.steamId, 'nome steam')).displayName).toBe('nome steam');
      expect((await rename(p, 'Outro Nome')).statusCode).toBe(409);
      const [entry] = await t.postgres.db
        .select()
        .from(staffAuditLog)
        .where(eq(staffAuditLog.targetAccountId, p.account.id));
      expect(entry).toMatchObject({
        action: 'display_name_reset',
        reason: 'nome ofensivo',
        details: {
          displayNameBefore: 'Nome Proprio',
          displayNameAfter: 'nome steam',
          customNameBefore: 'Nome Proprio',
          cooldownRestarted: true,
        },
      });
    });

    it('sem nome próprio: "Jogador #ID" até mudar o nome Steam, e o prazo não é tocado', async () => {
      const p = await player('nome horrível');
      const owner = await player('dono');

      await t.app.get(DisplayNames).reset(p.account.id, staff(owner.steamId));

      expect((await connect(p.steamId, 'nome horrível')).displayName).toBe(
        `Jogador #${p.account.publicId}`,
      );
      expect((await connect(p.steamId, 'nome limpo')).displayName).toBe('nome limpo');
      expect((await rename(p, 'Meu Nome')).statusCode).toBe(200);
    });
  });

  describe('Perfil privado', () => {
    it('o Perfil público diz se é privado', async () => {
      const p = await player();
      expect((await profileOf(p)).isPrivate).toBe(false);

      const on = await p.call('PUT', '/api/me/privacy', { isPrivate: true });
      expect(on.statusCode, on.body).toBe(204);
      expect((await profileOf(p)).isPrivate).toBe(true);
      const me = currentSessionSchema.parse((await p.call('GET', '/api/me')).json());
      expect(me.account.isPrivate).toBe(true);

      await p.call('PUT', '/api/me/privacy', { isPrivate: false });
      expect((await profileOf(p)).isPrivate).toBe(false);
    });

    it('nome, avatar, Loadout e presença continuam públicos com o Perfil privado', async () => {
      const p = await player('coldzera');
      await p.call('PUT', '/api/me/privacy', { isPrivate: true });

      expect(await profileOf(p)).toMatchObject({
        displayName: 'coldzera',
        loadoutShowcase: { items: [] },
        steamProfileUrl: expect.stringContaining(p.steamId),
      });
    });

    it('exige sessão e corpo válido', async () => {
      const anonymous = await t.app.inject({
        method: 'PUT',
        url: '/api/me/privacy',
        payload: { isPrivate: true },
      });
      expect(anonymous.statusCode).toBe(401);
      const p = await player();
      expect((await p.call('PUT', '/api/me/privacy', { isPrivate: 'sim' })).statusCode).toBe(400);
    });
  });
});
