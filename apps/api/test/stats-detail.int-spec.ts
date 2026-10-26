import {
  type EventBatch,
  eventBatchResultSchema,
  profileActivitySchema,
  profileSessionsSchema,
  profileWeaponsSchema,
  type RoundEndEvent,
  type SessionEndEvent,
  type SessionStartEvent,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountErasure } from '../src/accounts/account-erasure.js';
import {
  accountStatsDaily,
  accountStatsWeekly,
  accounts,
  accountWeaponStats,
  playSessions,
  serverHours,
} from '../src/database/schema.js';
import { DataRetention } from '../src/reports/data-retention.js';
import { dayOf } from '../src/stats/stats-week.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();
const AT = NOW.toISOString();

let seq = 0;
/** UUID de mentira, único por chamada. */
const eventId = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;

const batch = (events: Partial<EventBatch>): EventBatch => ({
  kills: [],
  damages: [],
  roundEnds: [],
  sessionStarts: [],
  sessionEnds: [],
  ...events,
});

const kill = (
  killer: string,
  victim: string | null,
  over: Partial<EventBatch['kills'][number]> = {},
): EventBatch['kills'][number] => ({
  id: eventId(),
  at: AT,
  warmup: false,
  killerSteamId: killer,
  killerIsBot: false,
  victimSteamId: victim,
  victimIsBot: false,
  assisterSteamId: null,
  assisterIsBot: false,
  headshot: false,
  weapon: 'ak47',
  teamKill: false,
  ...over,
});

describe('Estatísticas detalhadas (S12b)', () => {
  let t: TestApp;
  let next = 1;
  const db = () => t.postgres.db;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const player = async () => {
    const n = next++;
    await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId: steamIdFor(n), steamName: `jogador${n}` },
    });
    return signedInPlayer(t, n);
  };

  const send = async (events: EventBatch) => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/events',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: events,
    });
    expect(response.statusCode, response.body).toBe(200);
    return eventBatchResultSchema.parse(response.json());
  };

  const serverId = async () => {
    const server = await db().query.gameServers.findFirst();
    return server?.id as string;
  };

  const snapshot = async () => ({
    daily: await db().select().from(accountStatsDaily),
    weapons: await db().select().from(accountWeaponStats),
    sessions: await db().select().from(playSessions),
    hours: await db().select().from(serverHours),
    weekly: await db().select().from(accountStatsWeekly),
  });

  it('o mesmo lote, ou parte dele em outro lote, não muda nenhuma das tabelas', async () => {
    const a = await player();
    const b = await player();
    const sessionId = eventId();
    const events = batch({
      kills: [
        kill(a.steamId, b.steamId, { killerTeam: 'ct', headshot: true, weapon: 'weapon_m4a1' }),
        kill(a.steamId, b.steamId, { killerTeam: 't', weapon: 'hkp2000' }),
      ],
      roundEnds: [
        {
          id: eventId(),
          at: AT,
          warmup: false,
          winner: 'ct',
          players: [
            { steamId: a.steamId, team: 'ct' },
            { steamId: b.steamId, team: 't' },
          ],
          map: 'de_mirage',
          roundNumber: 5,
          scoreCt: 3,
          scoreT: 2,
        },
      ],
      sessionStarts: [{ id: eventId(), at: AT, sessionId, steamId: a.steamId, map: 'de_mirage' }],
      sessionEnds: [
        {
          id: eventId(),
          at: new Date(NOW.getTime() + 600_000).toISOString(),
          sessionId,
          steamId: a.steamId,
          startedAt: AT,
          maps: ['de_mirage', 'de_inferno'],
        },
      ],
    });

    const first = await send(events);
    expect(first.accepted).toBe(5);
    const after = await snapshot();
    expect(after.weapons.filter((w) => w.accountId === a.account.id)).toHaveLength(2);

    const again = await send(events);
    expect(again).toEqual({ accepted: 0, duplicates: 5, ignored: 0 });
    // Parte do lote, junto de um evento novo: só o novo conta.
    const partial = await send({
      ...events,
      kills: [...events.kills, kill(b.steamId, a.steamId, { killerTeam: 't', weapon: 'awp' })],
    });
    expect(partial.accepted).toBe(1);
    expect(partial.duplicates).toBe(5);

    const final = await snapshot();
    expect(final.sessions).toEqual(after.sessions);
    expect(final.hours).toEqual(after.hours);
    // A kill nova de b em a só soma uma morte a a no dia; o resto fica como estava.
    const dailyOf = (rows: typeof final.daily) =>
      rows.filter((d) => d.accountId === a.account.id).map(({ updatedAt: _, ...row }) => row);
    expect(dailyOf(final.daily)).toEqual(
      dailyOf(after.daily).map((row) => ({ ...row, deaths: row.deaths + 1 })),
    );
    expect(final.weapons.filter((w) => w.accountId === a.account.id)).toEqual(
      after.weapons.filter((w) => w.accountId === a.account.id),
    );
    expect(final.weapons.find((w) => w.accountId === b.account.id)).toMatchObject({
      weapon: 'awp',
      side: 't',
      kills: 1,
    });
  });

  it('a mesma kill soma no dia, na semana e na arma por lado, com a arma normalizada', async () => {
    const a = await player();
    const b = await player();
    await send(
      batch({
        kills: [
          kill(a.steamId, b.steamId, { killerTeam: 'ct', headshot: true, weapon: 'hkp2000' }),
          kill(a.steamId, b.steamId, { killerTeam: 'ct', weapon: 'weapon_knife_karambit' }),
          // Plugin velho: conta nas Estatísticas, não no radar.
          kill(a.steamId, b.steamId, { weapon: 'ak47' }),
          kill(a.steamId, b.steamId, { killerTeam: 't', weapon: 'arma-estranha' }),
        ],
      }),
    );
    const [daily] = await db()
      .select()
      .from(accountStatsDaily)
      .where(eq(accountStatsDaily.accountId, a.account.id));
    const [weekly] = await db()
      .select()
      .from(accountStatsWeekly)
      .where(eq(accountStatsWeekly.accountId, a.account.id));
    expect(daily).toMatchObject({ day: dayOf(NOW), kills: 4, headshots: 1 });
    expect(weekly).toMatchObject({ kills: 4, headshots: 1 });
    const weapons = await db()
      .select()
      .from(accountWeaponStats)
      .where(eq(accountWeaponStats.accountId, a.account.id));
    expect(weapons.map((w) => `${w.weapon}:${w.side}:${w.kills}`).sort()).toEqual([
      'knife:ct:1',
      'other:t:1',
      'p2000:ct:1',
    ]);
  });

  it('aquecimento, bot e aliado não entram no dia nem na arma', async () => {
    const a = await player();
    const b = await player();
    const before = (await snapshot()).weapons.length;
    await send(
      batch({
        kills: [
          kill(a.steamId, b.steamId, { warmup: true, killerTeam: 'ct' }),
          kill(a.steamId, null, { victimIsBot: true, killerTeam: 'ct' }),
          kill(a.steamId, b.steamId, { teamKill: true, killerTeam: 'ct' }),
        ],
      }),
    );
    const daily = await db()
      .select()
      .from(accountStatsDaily)
      .where(eq(accountStatsDaily.accountId, a.account.id));
    expect(daily).toHaveLength(0);
    expect((await snapshot()).weapons).toHaveLength(before);
  });

  it('as horas do servidor: só round sem aquecimento e com mapa, com o placar do último round', async () => {
    const id = await serverId();
    const at = (minutes: number) => new Date(Date.UTC(2026, 0, 6, 15, minutes)).toISOString();
    const round = (over: Partial<RoundEndEvent>): RoundEndEvent => ({
      id: eventId(),
      at: at(1),
      warmup: false,
      winner: 'ct',
      players: [],
      map: 'de_nuke',
      ...over,
    });
    await send(
      batch({
        roundEnds: [
          round({ at: at(1), winner: 'ct', roundNumber: 1, scoreCt: 1, scoreT: 0 }),
          round({ at: at(5), winner: 't', roundNumber: 2, scoreCt: 1, scoreT: 1 }),
          round({ at: at(3), winner: 'none' }),
          round({ at: at(2), warmup: true }),
          round({ at: at(4), map: undefined }),
        ],
      }),
    );
    const rows = await db().select().from(serverHours).where(eq(serverHours.serverId, id));
    const hour = rows.find((row) => row.map === 'de_nuke');
    expect(hour).toMatchObject({
      roundsPlayed: 3,
      ctWins: 1,
      tWins: 1,
      lastRoundNumber: 2,
      scoreCt: 1,
      scoreT: 1,
    });
    expect(hour?.firstRoundAt.toISOString()).toBe(at(1));
    expect(hour?.lastRoundAt.toISOString()).toBe(at(5));

    // Um lote mais antigo soma rounds mas não troca o placar final.
    await send(
      batch({
        roundEnds: [round({ at: at(0), winner: 'ct', roundNumber: 1, scoreCt: 9, scoreT: 9 })],
      }),
    );
    const [updated] = await db().select().from(serverHours).where(eq(serverHours.map, 'de_nuke'));
    expect(updated).toMatchObject({ roundsPlayed: 4, ctWins: 2, scoreCt: 1, scoreT: 1 });
    expect(updated?.firstRoundAt.toISOString()).toBe(at(0));
  });

  describe('Sessões de jogo', () => {
    const start = (steamId: string, sessionId: string, over: Partial<SessionStartEvent> = {}) => ({
      id: eventId(),
      at: AT,
      sessionId,
      steamId,
      ...over,
    });
    const end = (
      steamId: string,
      sessionId: string,
      over: Partial<SessionEndEvent> = {},
    ): SessionEndEvent => ({
      id: eventId(),
      at: new Date(NOW.getTime() + 1_800_000).toISOString(),
      sessionId,
      steamId,
      startedAt: AT,
      ...over,
    });

    it('início e fim em qualquer ordem dão a mesma Sessão', async () => {
      const a = await player();
      const inOrder = eventId();
      const reversed = eventId();
      await send(batch({ sessionStarts: [start(a.steamId, inOrder, { map: 'de_dust2' })] }));
      await send(
        batch({ sessionEnds: [end(a.steamId, inOrder, { maps: ['de_dust2', 'de_inferno'] })] }),
      );
      await send(batch({ sessionEnds: [end(a.steamId, reversed)] }));
      await send(batch({ sessionStarts: [start(a.steamId, reversed, { map: 'de_mirage' })] }));

      const rows = await db()
        .select()
        .from(playSessions)
        .where(eq(playSessions.accountId, a.account.id));
      const one = rows.find((row) => row.id === inOrder);
      const two = rows.find((row) => row.id === reversed);
      expect(one).toMatchObject({
        seconds: 1800,
        map: 'de_dust2',
        maps: ['de_dust2', 'de_inferno'],
      });
      expect(two).toMatchObject({ seconds: 1800, map: 'de_mirage', maps: ['de_mirage'] });
      expect(one?.mode).toBe('retake');
    });

    it('um fim repetido não reescreve a Sessão, e um fim inválido fica sem duração', async () => {
      const a = await player();
      const id = eventId();
      await send(batch({ sessionStarts: [start(a.steamId, id)] }));
      await send(batch({ sessionEnds: [end(a.steamId, id)] }));
      await send(
        batch({
          sessionEnds: [
            end(a.steamId, id, { at: new Date(NOW.getTime() + 7_200_000).toISOString() }),
          ],
        }),
      );
      const [row] = await db().select().from(playSessions).where(eq(playSessions.id, id));
      expect(row?.seconds).toBe(1800);

      const absurd = eventId();
      await send(
        batch({
          sessionEnds: [
            end(a.steamId, absurd, { at: new Date(NOW.getTime() + 3 * DAY_MS).toISOString() }),
          ],
        }),
      );
      const [bad] = await db().select().from(playSessions).where(eq(playSessions.id, absurd));
      expect(bad?.seconds).toBeNull();
      expect(bad?.endedAt).not.toBeNull();
    });

    it('a Sessão que atravessa a meia-noite divide o tempo pelos dias', async () => {
      const a = await player();
      const midnight = Date.UTC(2026, 0, 7, 3, 0); // 00:00 de Brasília
      const startedAt = new Date(midnight - 600_000).toISOString();
      await send(
        batch({
          sessionEnds: [
            {
              id: eventId(),
              at: new Date(midnight + 1_200_000).toISOString(),
              sessionId: eventId(),
              steamId: a.steamId,
              startedAt,
            },
          ],
        }),
      );
      const days = await db()
        .select()
        .from(accountStatsDaily)
        .where(eq(accountStatsDaily.accountId, a.account.id));
      expect(days.map((d) => [d.day, d.secondsPlayed]).sort()).toEqual([
        ['2026-01-06', 600],
        ['2026-01-07', 1200],
      ]);
    });
  });

  describe('endpoints do Perfil', () => {
    it('atividade, armas e Sessões de uma Conta com dados', async () => {
      const a = await player();
      const b = await player();
      const sessionId = eventId();
      await send(
        batch({
          kills: [
            kill(a.steamId, b.steamId, { killerTeam: 'ct', headshot: true, weapon: 'awp' }),
            kill(a.steamId, b.steamId, { killerTeam: 't', weapon: 'awp' }),
            kill(a.steamId, b.steamId, { killerTeam: 't', weapon: 'glock' }),
          ],
          sessionStarts: [
            { id: eventId(), at: AT, sessionId, steamId: a.steamId, map: 'de_mirage' },
          ],
          sessionEnds: [
            {
              id: eventId(),
              at: new Date(NOW.getTime() + 900_000).toISOString(),
              sessionId,
              steamId: a.steamId,
              startedAt: AT,
            },
          ],
        }),
      );

      const publicId = a.account.publicId;
      const activity = profileActivitySchema.parse(
        (await t.app.inject({ url: `/api/profiles/${publicId}/stats/activity?weeks=4` })).json(),
      );
      expect(activity.visible).toBe(true);
      expect(activity.since).toBe(dayOf(NOW));
      expect(activity.days).toEqual([
        { day: dayOf(NOW), secondsPlayed: 900, roundsPlayed: 0, kills: 3 },
      ]);

      const weapons = profileWeaponsSchema.parse(
        (
          await t.app.inject({ url: `/api/profiles/${publicId}/stats/weapons?mode=retake&limit=1` })
        ).json(),
      );
      expect(weapons.weapons).toEqual([{ weapon: 'awp', kills: 2, headshots: 1, ct: 1, t: 1 }]);
      const none = profileWeaponsSchema.parse(
        (
          await t.app.inject({ url: `/api/profiles/${publicId}/stats/weapons?mode=deathmatch` })
        ).json(),
      );
      expect(none.weapons).toEqual([]);

      // De fora: Modo, mapa, dia e duração; nada de hora nem de "em andamento".
      const stranger = profileSessionsSchema.parse(
        (await t.app.inject({ url: `/api/profiles/${publicId}/sessions` })).json(),
      );
      expect(stranger.sessions).toEqual([
        {
          id: sessionId,
          mode: 'retake',
          map: 'de_mirage',
          maps: ['de_mirage'],
          day: dayOf(NOW),
          startedAt: null,
          endedAt: null,
          seconds: 900,
          live: false,
        },
      ]);
      // A própria Conta vê o horário.
      const own = profileSessionsSchema.parse(
        (await a.call('GET', `/api/profiles/${publicId}/sessions`)).json(),
      );
      expect(own.sessions[0]?.startedAt).toBe(AT);
    });

    it('uma Conta sem nada detalhado volta vazia, com since nulo', async () => {
      const a = await player();
      const body = profileActivitySchema.parse(
        (await t.app.inject({ url: `/api/profiles/${a.account.publicId}/stats/activity` })).json(),
      );
      expect(body).toEqual({ visible: true, since: null, days: [] });
    });

    it('Perfil privado: só a própria Conta vê', async () => {
      const a = await player();
      const b = await player();
      await send(batch({ kills: [kill(a.steamId, b.steamId, { killerTeam: 'ct' })] }));
      await db()
        .update(accounts)
        .set({ profilePrivate: true })
        .where(eq(accounts.id, a.account.id));
      const publicId = a.account.publicId;

      for (const path of ['stats/activity', 'stats/weapons', 'sessions']) {
        const stranger = (await t.app.inject({ url: `/api/profiles/${publicId}/${path}` })).json();
        expect(stranger, path).toMatchObject({ visible: false, since: null });
        const own = (await a.call('GET', `/api/profiles/${publicId}/${path}`)).json();
        expect(own.visible, path).toBe(true);
      }
    });

    it('valida as consultas e o ID', async () => {
      const a = await player();
      const id = a.account.publicId;
      for (const url of [
        `/api/profiles/${id}/stats/activity?weeks=0`,
        `/api/profiles/${id}/stats/activity?weeks=53`,
        `/api/profiles/${id}/stats/activity?weeks=abc`,
        `/api/profiles/${id}/stats/weapons?mode=5v5`,
        `/api/profiles/${id}/stats/weapons?limit=21`,
        `/api/profiles/${id}/sessions?limit=0`,
      ]) {
        expect((await t.app.inject({ url })).statusCode, url).toBe(400);
      }
      for (const path of ['stats/activity', 'stats/weapons', 'sessions']) {
        expect((await t.app.inject({ url: `/api/profiles/999999999/${path}` })).statusCode).toBe(
          404,
        );
        expect((await t.app.inject({ url: `/api/profiles/abc/${path}` })).statusCode).toBe(404);
      }
    });

    it('a Sessão aberta há mais de um dia some da lista', async () => {
      const a = await player();
      const sid = await serverId();
      await db()
        .insert(playSessions)
        .values({
          id: eventId(),
          accountId: a.account.id,
          serverId: sid,
          mode: 'retake',
          startedAt: new Date(NOW.getTime() - 2 * DAY_MS),
        });
      const body = profileSessionsSchema.parse(
        (await a.call('GET', `/api/profiles/${a.account.publicId}/sessions`)).json(),
      );
      expect(body.sessions).toEqual([]);
    });
  });

  it('a anonimização apaga o detalhe da Conta', async () => {
    const a = await player();
    const b = await player();
    const sessionId = eventId();
    await send(
      batch({
        kills: [kill(a.steamId, b.steamId, { killerTeam: 'ct' })],
        sessionStarts: [{ id: eventId(), at: AT, sessionId, steamId: a.steamId }],
      }),
    );
    const mine = (rows: { accountId: string }[]) =>
      rows.filter((r) => r.accountId === a.account.id);
    expect(mine((await snapshot()).daily)).not.toHaveLength(0);

    await new AccountErasure(db(), {
      dropSessions: async () => undefined,
      invalidateEquipped: async () => undefined,
    }).anonymize(a.account.id, { actorSteamId: steamIdFor(9999), reason: 'teste' });

    const after = await snapshot();
    expect(mine(after.daily)).toHaveLength(0);
    expect(mine(after.weapons)).toHaveLength(0);
    expect(mine(after.sessions)).toHaveLength(0);
    expect(mine(after.weekly)).toHaveLength(0);
    // A outra Conta fica como estava.
    expect(after.daily.filter((d) => d.accountId === b.account.id)).not.toHaveLength(0);
  });

  it('a retenção apaga o dado diário (400 dias), as Sessões (90) e as horas (400), em lotes', async () => {
    const a = await player();
    const sid = await serverId();
    const old = (days: number) => new Date(Date.now() - days * DAY_MS);
    await db()
      .insert(accountStatsDaily)
      .values(
        [401, 402, 403, 399].map((days) => ({
          accountId: a.account.id,
          mode: 'retake' as const,
          day: dayOf(old(days)),
          kills: 1,
        })),
      );
    await db()
      .insert(playSessions)
      .values(
        [91, 92, 89].map((days) => ({
          id: eventId(),
          accountId: a.account.id,
          serverId: sid,
          mode: 'retake' as const,
          startedAt: old(days),
          endedAt: old(days),
          seconds: 60,
        })),
      );
    await db()
      .insert(serverHours)
      .values(
        [401, 399].map((days) => ({
          serverId: sid,
          hourStart: old(days),
          map: 'de_retencao',
          firstRoundAt: old(days),
          lastRoundAt: old(days),
        })),
      );

    const swept = await new DataRetention(db(), { batchSize: 2 }).sweep();
    expect(swept.statsDaily).toBeGreaterThanOrEqual(3);
    expect(swept.playSessions).toBeGreaterThanOrEqual(2);
    expect(swept.serverHours).toBeGreaterThanOrEqual(1);

    const days = await db()
      .select({ day: accountStatsDaily.day })
      .from(accountStatsDaily)
      .where(eq(accountStatsDaily.accountId, a.account.id));
    expect(days.map((d) => d.day)).toEqual([dayOf(old(399))]);
    const sessions = await db()
      .select()
      .from(playSessions)
      .where(eq(playSessions.accountId, a.account.id));
    expect(sessions).toHaveLength(1);
    const hours = await db().select().from(serverHours).where(eq(serverHours.map, 'de_retencao'));
    expect(hours).toHaveLength(1);
  });
});
