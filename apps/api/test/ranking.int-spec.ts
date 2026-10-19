import {
  type GameMode,
  profileStatsSchema,
  type Ranking,
  rankingSchema,
  type StaffRole,
  staffAuditPageSchema,
  staffErrorSchema,
} from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountStatsWeekly } from '../src/database/schema.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { weekStartOf } from '../src/stats/stats-week.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const THIS_WEEK = weekStartOf(new Date());
const LAST_WEEK = weekStartOf(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
const FOUNDER = steamIdFor(9999);

describe('Ranking semanal (S12, parte B)', () => {
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const player = async () => signedInPlayer(t, next++);
  type Player = Awaited<ReturnType<typeof player>>;

  const staff = async (role: StaffRole) => {
    const member = await player();
    await t.app
      .get(StaffRoles)
      .set(member.account.id, role, { actorSteamId: FOUNDER, reason: 'teste' });
    return member;
  };

  /** Escreve a semana de uma Conta direto no agregado (a coleta já é testada em stats). */
  const seed = async (
    who: Player,
    mode: GameMode,
    over: Partial<typeof accountStatsWeekly.$inferInsert> = {},
    weekStart = THIS_WEEK,
  ) => {
    await t.postgres.db.insert(accountStatsWeekly).values({
      accountId: who.account.id,
      mode,
      weekStart,
      roundsPlayed: 60,
      secondsPlayed: 2400,
      ...over,
    });
  };

  const ranking = async (mode: GameMode, query = '', viewer?: Player): Promise<Ranking> => {
    const response = viewer
      ? await viewer.call('GET', `/api/ranking/${mode}${query}`)
      : await t.app.inject({ url: `/api/ranking/${mode}${query}` });
    expect(response.statusCode, response.body).toBe(200);
    return rankingSchema.parse(response.json());
  };

  // O cache de 45 s é por Modo e semana; cada teste usa os dois Modos e semanas de propósito
  // distintos, ou invalida via a Staff, para não depender do TTL.
  const flush = () => t.valkey.executeCliCmd('flushall');

  it('um empate em rounds vencidos é resolvido pelo K/D', async () => {
    await flush();
    const baixo = await player();
    const alto = await player();
    await seed(baixo, 'retake', { roundsWon: 30, kills: 10, deaths: 10 });
    await seed(alto, 'retake', { roundsWon: 30, kills: 30, deaths: 10 });

    const result = await ranking('retake');

    const mine = result.entries.filter(
      (entry) =>
        !entry.player.private &&
        [alto.account.publicId, baixo.account.publicId].includes(entry.player.publicId),
    );
    expect(mine.map((entry) => !entry.player.private && entry.player.publicId)).toEqual([
      alto.account.publicId,
      baixo.account.publicId,
    ]);
    expect(mine[0]?.position).toBeLessThan(mine[1]?.position ?? 0);
  });

  it('quem não cumpriu o mínimo não entra; o jogador logado vê o que falta', async () => {
    await flush();
    const curto = await player();
    await seed(curto, 'retake', { roundsPlayed: 38, roundsWon: 30 });
    await seed(curto, 'deathmatch', { secondsPlayed: 22 * 60 + 5, kills: 99 });

    const retake = await ranking('retake', '', curto);
    const dm = await ranking('deathmatch', '', curto);

    expect(retake.entries.some((entry) => entry.self)).toBe(false);
    expect(retake.viewer).toEqual({
      entry: null,
      progress: { unit: 'rounds', missing: 12 },
      removed: false,
    });
    expect(dm.viewer?.progress).toEqual({ unit: 'minutes', missing: 8 });
  });

  it('o visitante sem sessão não recebe a parte do jogador', async () => {
    expect((await ranking('retake')).viewer).toBeNull();
  });

  it('a própria posição aparece mesmo fora do top 50', async () => {
    await flush();
    const last = await player();
    await seed(last, 'deathmatch', { kills: 1, secondsPlayed: 1800, headshots: 0 });
    // 50 jogadores melhores que o último.
    const crowd = await Promise.all(Array.from({ length: 50 }, player));
    await Promise.all(crowd.map((p) => seed(p, 'deathmatch', { kills: 500, secondsPlayed: 3600 })));

    const result = await ranking('deathmatch', '', last);

    expect(result.entries).toHaveLength(50);
    expect(result.entries.some((entry) => entry.self)).toBe(false);
    expect(result.viewer?.entry?.position).toBeGreaterThan(50);
    expect(result.viewer?.entry?.self).toBe(true);
  });

  it('Perfil privado aparece como "Jogador privado", sem ID, nome nem avatar, e ocupa a posição', async () => {
    await flush();
    const quiet = await player();
    const open = await player();
    await seed(quiet, 'retake', { roundsWon: 9_001, kills: 5 }, THIS_WEEK);
    await seed(open, 'retake', { roundsWon: 9_000, kills: 5 }, THIS_WEEK);
    await quiet.call('PUT', '/api/me/privacy', { isPrivate: true });

    const result = await ranking('retake');

    expect(result.entries[0]?.player).toEqual({ private: true, displayName: 'Jogador privado' });
    expect(result.entries[0]?.position).toBe(1);
    expect(JSON.stringify(result.entries[0])).not.toContain(quiet.steamId);
    expect(JSON.stringify(result.entries[0])).not.toContain(`${quiet.account.publicId}`);
    expect(result.entries[1]?.position).toBe(2);
    // O dono privado vê a própria linha marcada.
    expect((await ranking('retake', '', quiet)).entries[0]?.self).toBe(true);
  });

  it('semana sem ninguém elegível volta vazia (o web mostra o estado explicativo)', async () => {
    await flush();
    const result = await ranking('retake', '?week=2020-01-06');

    expect(result.entries).toEqual([]);
    expect(result.current).toBe(false);
    expect(result.weekEnd).toBe('2020-01-12');
    expect(result.minimum).toEqual({ unit: 'rounds', value: 50 });
  });

  it('semanas anteriores são consultáveis e listadas', async () => {
    await flush();
    const veteran = await player();
    await seed(veteran, 'retake', { roundsWon: 77_777 }, LAST_WEEK);

    const past = await ranking('retake', `?week=${LAST_WEEK}`);
    const now = await ranking('retake');

    expect(past.current).toBe(false);
    expect(past.entries[0]?.score).toBe(77_777);
    expect(now.current).toBe(true);
    expect(now.weeks[0]).toBe(THIS_WEEK);
    expect(now.weeks).toContain(LAST_WEEK);
  });

  it('semana inválida, futura ou que não é segunda-feira é recusada; Modo desconhecido é 404', async () => {
    const bad = (query: string) => t.app.inject({ url: `/api/ranking/retake${query}` });

    expect((await bad('?week=2026-10-13')).statusCode).toBe(400);
    expect((await bad('?week=abc')).statusCode).toBe(400);
    expect((await bad('?week=2999-01-04')).statusCode).toBe(400);
    expect((await t.app.inject({ url: '/api/ranking/5v5' })).statusCode).toBe(404);
  });

  it('a Staff remove uma entrada com motivo e auditoria, sem apagar as Estatísticas', async () => {
    await flush();
    const cheater = await player();
    await seed(cheater, 'retake', { roundsWon: 88_888, kills: 40, deaths: 2 });
    const mod = await staff('moderator');
    const owner = await staff('owner');
    expect((await ranking('retake')).entries[0]?.score).toBe(88_888);

    const removal = await mod.call(
      'POST',
      `/api/staff/accounts/${cheater.account.publicId}/ranking-removals`,
      { mode: 'retake', weekStart: THIS_WEEK, reason: 'rounds de bot farm' },
    );

    expect(removal.statusCode, removal.body).toBe(200);
    const after = await ranking('retake', '', cheater);
    expect(after.entries.some((entry) => entry.score === 88_888)).toBe(false);
    expect(after.viewer).toMatchObject({ entry: null, removed: true });
    const stats = profileStatsSchema.parse(
      (await t.app.inject({ url: `/api/profiles/${cheater.account.publicId}/stats` })).json(),
    );
    expect(stats.modes[0]).toMatchObject({ mode: 'retake', kills: 40 });
    const audit = staffAuditPageSchema.parse(
      (await owner.call('GET', `/api/staff/audit?action=ranking_entry_remove`)).json(),
    );
    expect(audit.entries[0]).toMatchObject({
      action: 'ranking_entry_remove',
      reason: 'rounds de bot farm',
      actor: { steamId: mod.steamId },
      targetAccount: { steamId: cheater.steamId },
      details: { mode: 'retake', weekStart: THIS_WEEK },
    });
  });

  it('remover de novo ou sem Estatísticas é recusado; sem papel de Staff, 403', async () => {
    await flush();
    const target = await player();
    await seed(target, 'retake');
    const mod = await staff('moderator');
    const url = `/api/staff/accounts/${target.account.publicId}/ranking-removals`;
    const body = { mode: 'retake', weekStart: THIS_WEEK, reason: 'teste' };

    expect((await mod.call('POST', url, body)).statusCode).toBe(200);
    const again = await mod.call('POST', url, body);
    expect(again.statusCode).toBe(409);
    expect(staffErrorSchema.parse(again.json()).code).toBe('ranking_entry_already_removed');
    const none = await mod.call('POST', url, { ...body, mode: 'deathmatch' });
    expect(none.statusCode).toBe(404);
    expect(staffErrorSchema.parse(none.json()).code).toBe('ranking_entry_not_found');
    const nobody = await player();
    expect((await nobody.call('POST', url, body)).statusCode).toBe(403);
  });
});
