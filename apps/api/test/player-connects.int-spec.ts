import { type PlayerConnectResult, playerConnectResultSchema } from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPrettyNumber } from '../src/accounts/public-id.js';
import { vipPeriods } from '../src/database/schema.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

describe('POST /api/server/player-connects', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  function connect(body: object, key: string | null = t.serverKey) {
    return t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: key === null ? {} : { authorization: `Bearer ${key}` },
      payload: body,
    });
  }

  async function connectOk(body: object): Promise<PlayerConnectResult> {
    const response = await connect(body);
    expect(response.statusCode, response.body).toBe(200);
    return playerConnectResultSchema.parse(response.json());
  }

  it('cria em até 2 s uma Conta não reivindicada com ID público ≥ 10.000 no primeiro connect', async () => {
    const steamId = steamIdFor(1);
    const startedAt = performance.now();

    const result = await connectOk({ steamId, steamName: 'coldzera' });

    expect(performance.now() - startedAt).toBeLessThan(2000);
    expect(result).toMatchObject({ displayName: 'coldzera', isFirstConnect: true });
    expect(result.publicId).toBeGreaterThanOrEqual(10_000);
    expect(await t.accounts.findBySteamId(steamId)).toMatchObject({
      steamId,
      publicId: result.publicId,
      displayName: 'coldzera',
      claimedAt: null,
    });
  });

  it('no connect seguinte devolve a mesma Conta, sem boas-vindas, com o nome Steam atualizado', async () => {
    const steamId = steamIdFor(2);
    const first = await connectOk({ steamId, steamName: 'fallen' });

    const second = await connectOk({ steamId, steamName: 'FalleN' });

    expect(second).toEqual({
      publicId: first.publicId,
      displayName: 'FalleN',
      isFirstConnect: false,
      isVip: false,
      sanctions: [],
      chatHidden: false,
    });
  });

  it('mostra "Jogador #ID" quando o nome Steam é ofensivo, e o nome aceitável depois', async () => {
    const steamId = steamIdFor(3);

    const offensive = await connectOk({ steamId, steamName: 'fdp123' });
    const acceptable = await connectOk({ steamId, steamName: 'Gabriel' });

    expect(offensive.displayName).toBe(`Jogador #${offensive.publicId}`);
    expect(acceptable.displayName).toBe('Gabriel');
  });

  it('duas Contas criadas em sequência recebem IDs crescentes', async () => {
    const a = await connectOk({ steamId: steamIdFor(4), steamName: 'a' });
    const b = await connectOk({ steamId: steamIdFor(5), steamName: 'b' });

    expect(b.publicId).toBeGreaterThan(a.publicId);
  });

  it('connects simultâneos de jogadores diferentes nunca colidem nem caem em número bonito', async () => {
    const steamIds = Array.from({ length: 40 }, (_, i) => steamIdFor(1_000 + i));

    const results = await Promise.all(
      steamIds.map((steamId) => connectOk({ steamId, steamName: 'jogador' })),
    );

    const ids = results.map((r) => r.publicId);
    expect(new Set(ids).size).toBe(steamIds.length);
    expect(ids.every((id) => id >= 10_000 && !isPrettyNumber(id))).toBe(true);
    expect(results.every((r) => r.isFirstConnect)).toBe(true);
  });

  it('connects simultâneos do mesmo jogador criam uma Conta só, com boas-vindas uma vez', async () => {
    const steamId = steamIdFor(2_000);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => connectOk({ steamId, steamName: 'duplicado' })),
    );

    expect(new Set(results.map((r) => r.publicId)).size).toBe(1);
    expect(results.filter((r) => r.isFirstConnect)).toHaveLength(1);
  });

  it('um connect reenviado pelo plugin cria a Conta com o horário original', async () => {
    const steamId = steamIdFor(6);
    const connectedAt = '2026-10-09T18:00:00.000Z';

    const result = await connectOk({ steamId, steamName: 'offline', connectedAt });

    expect(result.isFirstConnect).toBe(true);
    expect(await t.accounts.findBySteamId(steamId)).toMatchObject({
      firstConnectedAt: new Date(connectedAt),
    });
  });

  it.each([
    ['sem chave', null],
    ['com chave inválida', 'cmk_chave-invalida'],
  ])('responde 401 %s e não cria nada', async (_, key) => {
    const steamId = steamIdFor(7);

    const response = await connect({ steamId, steamName: 'intruso' }, key);

    expect(response.statusCode).toBe(401);
    expect(await t.accounts.findBySteamId(steamId)).toBeNull();
  });

  it('diz se a Conta tem VIP ativo agora (Vaga reservada, S14)', async () => {
    const steamId = steamIdFor(30);
    const before = await connectOk({ steamId, steamName: 'vip' });
    const account = await t.accounts.findBySteamId(steamId);
    if (!account) throw new Error('Conta não criada');
    await t.postgres.db.insert(vipPeriods).values({
      accountId: account.id,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
    });

    const after = await connectOk({ steamId, steamName: 'vip' });

    expect(before.isVip).toBe(false);
    expect(after.isVip).toBe(true);
  });

  it('não conta um Período VIP já encerrado', async () => {
    const steamId = steamIdFor(31);
    await connectOk({ steamId, steamName: 'ex-vip' });
    const account = await t.accounts.findBySteamId(steamId);
    if (!account) throw new Error('Conta não criada');
    await t.postgres.db.insert(vipPeriods).values({
      accountId: account.id,
      startsAt: new Date(Date.now() - 2 * 60 * 60_000),
      endsAt: new Date(Date.now() - 60_000),
    });

    expect((await connectOk({ steamId, steamName: 'ex-vip' })).isVip).toBe(false);
  });

  it('responde 400 a um SteamID inválido', async () => {
    const response = await connect({ steamId: '123', steamName: 'x' });

    expect(response.statusCode).toBe(400);
  });

  describe('!chat off / !chat on', () => {
    function setChat(steamId: string, hidden: unknown, key: string | null = t.serverKey) {
      return t.app.inject({
        method: 'PUT',
        url: `/api/server/players/${steamId}/chat-preference`,
        headers: key === null ? {} : { authorization: `Bearer ${key}` },
        payload: { hidden },
      });
    }

    it('o padrão é o chat visível; o !chat off vale nos próximos connects até o !chat on', async () => {
      const steamId = steamIdFor(700);
      expect((await connectOk({ steamId, steamName: 'quieto' })).chatHidden).toBe(false);

      expect((await setChat(steamId, true)).statusCode).toBe(204);
      expect((await connectOk({ steamId, steamName: 'quieto' })).chatHidden).toBe(true);

      expect((await setChat(steamId, false)).statusCode).toBe(204);
      expect((await connectOk({ steamId, steamName: 'quieto' })).chatHidden).toBe(false);
    });

    it('Conta que não existe: 404; corpo inválido: 400; sem a chave do servidor: 401', async () => {
      expect((await setChat(steamIdFor(701), true)).statusCode).toBe(404);
      expect((await setChat(steamIdFor(1), 'sim')).statusCode).toBe(400);
      expect((await setChat('123', true)).statusCode).toBe(400);
      expect((await setChat(steamIdFor(1), true, null)).statusCode).toBe(401);
    });
  });
});
