import {
  type PlayerConnectResult,
  playerConnectResultSchema,
  playerVipSchema,
} from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placeholderNameFor } from '../src/accounts/placeholder-names.js';
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
    expect(result).toMatchObject({
      displayName: 'coldzera',
      isFirstConnect: true,
      greeting: 'Bem-vindo, coldzera. Ao jogar você concorda com os termos: stcarmine.com/terms',
    });
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
      plan: null,
      vipNotice: null,
      vipEndsAt: null,
      sanctions: [],
      chatHidden: false,
      applyAwpDefault: true,
      greeting: 'Bem-vindo, FalleN.',
    });
  });

  it('mostra o nome fictício quando o nome Steam é ofensivo, e o nome aceitável depois', async () => {
    const steamId = steamIdFor(3);

    const offensive = await connectOk({ steamId, steamName: 'fdp123' });
    const acceptable = await connectOk({ steamId, steamName: 'Gabriel' });

    expect(offensive.displayName).toBe(placeholderNameFor(offensive.publicId));
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
    // O plugin antigo lê `isVip`; o novo lê o plano (as concessões de antes da S20 são Capo).
    expect(before.plan).toBeNull();
    expect(after.plan).toBe('capo');
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

  describe('aviso do fim do VIP no chat do jogo (S14)', () => {
    async function withPeriod(n: number, startsInMs: number, endsInMs: number) {
      const steamId = steamIdFor(n);
      await connectOk({ steamId, steamName: `vip${n}` });
      const account = await t.accounts.findBySteamId(steamId);
      if (!account) throw new Error('Conta não criada');
      await t.postgres.db.insert(vipPeriods).values({
        accountId: account.id,
        startsAt: new Date(Date.now() + startsInMs),
        endsAt: new Date(Date.now() + endsInMs),
      });
      return steamId;
    }
    const DAY = 24 * 60 * 60_000;
    const vip = (steamId: string) =>
      t.app.inject({
        url: `/api/server/players/${steamId}/vip`,
        headers: { authorization: `Bearer ${t.serverKey}` },
      });

    it('3 dias antes do fim o connect traz o aviso e o fim; sem VIP ou longe do fim, nada', async () => {
      const soon = await withPeriod(40, -DAY, 2 * DAY);
      const far = await withPeriod(41, -DAY, 30 * DAY);

      const result = await connectOk({ steamId: soon, steamName: 'vip40' });
      expect(result).toMatchObject({ isVip: true, vipNotice: 'ending_soon' });
      expect(Date.parse(result.vipEndsAt as string)).toBeGreaterThan(Date.now() + DAY);
      expect(await connectOk({ steamId: far, steamName: 'vip41' })).toMatchObject({
        isVip: true,
        vipNotice: null,
      });
    });

    it('no dia do fim e no dia em que acabou', async () => {
      const ending = await withPeriod(42, -DAY, 60_000);
      const ended = await withPeriod(43, -2 * DAY, -1000);

      expect((await connectOk({ steamId: ending, steamName: 'vip42' })).vipNotice).toBe(
        'ending_today',
      );
      expect(await connectOk({ steamId: ended, steamName: 'vip43' })).toMatchObject({
        isVip: false,
        vipNotice: 'ended_today',
        vipEndsAt: null,
      });
    });

    it('GET /api/server/players/{steamId}/vip dá o VIP de agora, e recusa chave errada e Conta desconhecida', async () => {
      const steamId = await withPeriod(44, -DAY, 2 * DAY);

      const response = await vip(steamId);
      expect(response.statusCode, response.body).toBe(200);
      const body = playerVipSchema.parse(response.json());
      expect(body).toMatchObject({ active: true, endedAt: null, notice: 'ending_soon' });

      expect((await vip(steamIdFor(9999))).statusCode).toBe(404);
      const unauthorized = await t.app.inject({ url: `/api/server/players/${steamId}/vip` });
      expect(unauthorized.statusCode).toBe(401);
    });
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

  describe('AWP por padrão do Retake (S16)', () => {
    function markAwp(steamId: string, key: string | null = t.serverKey) {
      return t.app.inject({
        method: 'POST',
        url: `/api/server/players/${steamId}/awp-default`,
        headers: key === null ? {} : { authorization: `Bearer ${key}` },
      });
    }

    it('todo connect manda applyAwpDefault até a marca; depois dela, nunca mais, e marcar de novo não muda nada', async () => {
      const steamId = steamIdFor(710);
      expect((await connectOk({ steamId, steamName: 'sniper' })).applyAwpDefault).toBe(true);
      expect((await connectOk({ steamId, steamName: 'sniper' })).applyAwpDefault).toBe(true);

      expect((await markAwp(steamId)).statusCode).toBe(204);
      expect((await markAwp(steamId)).statusCode).toBe(204);

      expect((await connectOk({ steamId, steamName: 'sniper' })).applyAwpDefault).toBe(false);
    });

    it('Conta que não existe: 404; SteamID inválido: 400; sem a chave do servidor: 401', async () => {
      expect((await markAwp(steamIdFor(711))).statusCode).toBe(404);
      expect((await markAwp('123')).statusCode).toBe(400);
      expect((await markAwp(steamIdFor(1), null)).statusCode).toBe(401);
    });
  });

  describe('!rank e !stats do jogo (S16)', () => {
    function line(kind: 'rank' | 'stats', steamId: string, key: string | null = t.serverKey) {
      return t.app.inject({
        url: `/api/server/players/${steamId}/${kind}`,
        headers: key === null ? {} : { authorization: `Bearer ${key}` },
      });
    }

    it('Conta sem jogo na semana: o rank diz quanto falta e o stats diz que ainda não jogou', async () => {
      const steamId = steamIdFor(720);
      await connectOk({ steamId, steamName: 'novato' });

      const rank = await line('rank', steamId);
      const stats = await line('stats', steamId);

      expect(rank.statusCode, rank.body).toBe(200);
      expect(rank.json().message).toMatch(
        /^Falt(a|am) \d+ (round|rounds|minuto|minutos) para você entrar no Ranking desta semana.$/,
      );
      expect(stats.json().message).toMatch(
        /^Você ainda não jogou (Retake|Deathmatch) esta semana.$/,
      );
    });

    it('Conta que não existe: 404; SteamID inválido: 400; sem a chave do servidor: 401', async () => {
      expect((await line('rank', steamIdFor(721))).statusCode).toBe(404);
      expect((await line('stats', steamIdFor(721))).statusCode).toBe(404);
      expect((await line('rank', '123')).statusCode).toBe(400);
      expect((await line('stats', steamIdFor(1), null)).statusCode).toBe(401);
    });
  });
});
