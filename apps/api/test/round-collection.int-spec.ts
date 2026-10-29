import { type EventBatch, eventBatchResultSchema } from '@carmine/contracts';
import { and, eq, isNull, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountErasure } from '../src/accounts/account-erasure.js';
import {
  accountStatsWeekly,
  mapPlayPlayers,
  mapPlays,
  roundEvents,
  roundPlayerSummaries,
  roundSummaries,
} from '../src/database/schema.js';
import { DataRetention } from '../src/reports/data-retention.js';
import { RoundEventPartitions } from '../src/stats/round-event-partitions.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';
import { installStableClock } from './support/stable-clock.js';

installStableClock();

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;
/** O round começa 5 minutos atrás; os eventos andam em ms a partir daí. */
const T0 = Date.now() - 5 * 60_000;
const isoAt = (ms: number) => new Date(T0 + ms).toISOString();

let seq = 0;
const eventId = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;
const playId = () => `0199f2a0-7b1c-7000-9000-${String(++seq).padStart(12, '0')}`;

const batch = (events: Partial<EventBatch>): EventBatch => ({
  kills: [],
  damages: [],
  roundEnds: [],
  sessionStarts: [],
  sessionEnds: [],
  ...events,
});

type Kill = EventBatch['kills'][number];
type Hit = EventBatch['damages'][number];
type Start = NonNullable<EventBatch['roundStarts']>[number];
type End = EventBatch['roundEnds'][number];

describe('Coleta por round (S17): ingestão, resumo e retenção', () => {
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

  /** Um round de dois humanos (A, CT; B, TR): A mata B, B tinha levado 60 de dano do A. */
  const roundOf = (
    a: { steamId: string },
    b: { steamId: string },
    mapPlayId: string,
    roundNumber = 1,
  ) => {
    const round = { mapPlayId, roundNumber };
    const start: Start = {
      id: eventId(),
      at: isoAt(0),
      atMs: T0,
      warmup: false,
      ...round,
      map: 'de_mirage',
      players: [
        { steamId: a.steamId, team: 'ct', equipmentValue: 4750 },
        { steamId: b.steamId, team: 't', equipmentValue: 3900 },
      ],
      botsCt: 0,
      botsT: 0,
    };
    const hit: Hit = {
      id: eventId(),
      at: isoAt(5000),
      atMs: T0 + 5000,
      warmup: false,
      ...round,
      attackerSteamId: a.steamId,
      victimSteamId: b.steamId,
      victimIsBot: false,
      teamDamage: false,
      amount: 60,
      healthDamage: 60,
      weapon: 'ak47',
      hitgroup: 2,
    };
    const kill: Kill = {
      id: eventId(),
      at: isoAt(6000),
      atMs: T0 + 6000,
      warmup: false,
      ...round,
      killerSteamId: a.steamId,
      killerIsBot: false,
      victimSteamId: b.steamId,
      victimIsBot: false,
      assisterSteamId: null,
      assisterIsBot: false,
      headshot: true,
      weapon: 'ak47',
      teamKill: false,
      killerTeam: 'ct',
      victimTeam: 't',
      distance: 812,
    };
    const end: End = {
      id: eventId(),
      at: isoAt(7000),
      atMs: T0 + 7000,
      warmup: false,
      winner: 'ct',
      players: [
        { steamId: a.steamId, team: 'ct' },
        { steamId: b.steamId, team: 't' },
      ],
      ...round,
      map: 'de_mirage',
      scoreCt: 1,
      scoreT: 0,
      reason: 'elimination',
      durationMs: 7000,
      alive: [a.steamId],
    };
    return { start, hit, kill, end };
  };

  const counts = async () => ({
    events: (await db().select().from(roundEvents)).length,
    rounds: (await db().select().from(roundSummaries)).length,
    players: (await db().select().from(roundPlayerSummaries)).length,
    maps: (await db().select().from(mapPlays)).length,
    mapPlayers: (await db().select().from(mapPlayPlayers)).length,
  });

  it('um round completo vira eventos brutos, resumo do round, dos jogadores e do mapa jogado', async () => {
    const a = await player();
    const b = await player();
    const id = playId();
    const r = roundOf(a, b, id);
    const result = await send(
      batch({ roundStarts: [r.start], damages: [r.hit], kills: [r.kill], roundEnds: [r.end] }),
    );
    expect(result).toEqual({ accepted: 4, duplicates: 0, ignored: 0 });

    const [round] = await db()
      .select()
      .from(roundSummaries)
      .where(eq(roundSummaries.mapPlayId, id));
    expect(round).toMatchObject({
      roundNumber: 1,
      winner: 'ct',
      reason: 'elimination',
      durationMs: 7000,
      scoreCt: 1,
      scoreT: 0,
      map: 'de_mirage',
    });

    const players = await db()
      .select()
      .from(roundPlayerSummaries)
      .where(eq(roundPlayerSummaries.mapPlayId, id));
    const mine = players.find((p) => p.accountId === a.account.id);
    const theirs = players.find((p) => p.accountId === b.account.id);
    expect(mine).toMatchObject({
      side: 'ct',
      equipmentValue: 4750,
      kills: 1,
      headshots: 1,
      deaths: 0,
      damage: 60,
      survived: true,
      openingKill: true,
      kast: true,
      multiKill: null,
      clutchAgainst: null,
    });
    expect(theirs).toMatchObject({ side: 't', deaths: 1, survived: false, openingDeath: true });

    const [map] = await db().select().from(mapPlays).where(eq(mapPlays.id, id));
    expect(map).toMatchObject({
      map: 'de_mirage',
      rounds: 1,
      scoreCt: 1,
      scoreT: 0,
      mode: 'retake',
    });
    expect(map?.endedAt.getTime()).toBeGreaterThanOrEqual(map?.startedAt.getTime() as number);
    const mapPlayers = await db()
      .select()
      .from(mapPlayPlayers)
      .where(eq(mapPlayPlayers.mapPlayId, id));
    expect(mapPlayers.find((p) => p.accountId === a.account.id)).toMatchObject({
      rounds: 1,
      kills: 1,
      kastRounds: 1,
      openingKills: 1,
    });

    // Nenhuma linha bruta guarda o SteamID.
    const raw = JSON.stringify(
      await db().select().from(roundEvents).where(eq(roundEvents.mapPlayId, id)),
    );
    expect(raw).not.toContain(a.steamId);
    expect(raw).not.toContain(b.steamId);
  });

  it('as somas da semana seguem iguais: o lote conta como sempre nas Estatísticas', async () => {
    const a = await player();
    const b = await player();
    const r = roundOf(a, b, playId());
    await send(
      batch({ roundStarts: [r.start], damages: [r.hit], kills: [r.kill], roundEnds: [r.end] }),
    );
    const [weekly] = await db()
      .select()
      .from(accountStatsWeekly)
      .where(eq(accountStatsWeekly.accountId, a.account.id));
    expect(weekly).toMatchObject({ kills: 1, damage: 60, roundsPlayed: 1, roundsWon: 1 });
  });

  it('reenviar o lote, ou parte dele, não duplica evento nem resumo', async () => {
    const a = await player();
    const b = await player();
    const r = roundOf(a, b, playId());
    const events = batch({
      roundStarts: [r.start],
      damages: [r.hit],
      kills: [r.kill],
      roundEnds: [r.end],
    });
    await send(events);
    const before = await counts();
    const players = await db().select().from(roundPlayerSummaries);

    const again = await send(events);
    expect(again).toEqual({ accepted: 0, duplicates: 4, ignored: 0 });
    await send(batch({ kills: [r.kill], roundEnds: [r.end] }));

    expect(await counts()).toEqual(before);
    expect(await db().select().from(roundPlayerSummaries)).toEqual(players);
  });

  it('o resumo sai quando o round_end chega, mesmo em lote separado dos outros eventos', async () => {
    const a = await player();
    const b = await player();
    const id = playId();
    const r = roundOf(a, b, id);
    await send(batch({ roundStarts: [r.start], damages: [r.hit], kills: [r.kill] }));
    expect(
      await db().select().from(roundSummaries).where(eq(roundSummaries.mapPlayId, id)),
    ).toHaveLength(0);

    await send(batch({ roundEnds: [r.end] }));
    expect(
      await db().select().from(roundSummaries).where(eq(roundSummaries.mapPlayId, id)),
    ).toHaveLength(1);
    const players = await db()
      .select()
      .from(roundPlayerSummaries)
      .where(eq(roundPlayerSummaries.mapPlayId, id));
    expect(players.find((p) => p.accountId === a.account.id)).toMatchObject({
      kills: 1,
      damage: 60,
    });
  });

  it('um evento atrasado, depois do round_end, refaz o resumo por cima', async () => {
    const a = await player();
    const b = await player();
    const id = playId();
    const r = roundOf(a, b, id);
    // O fim do round chega antes da kill (um lote que se atrasou na fila).
    const { alive: _alive, ...endWithoutAlive } = r.end;
    await send(batch({ roundStarts: [r.start], roundEnds: [endWithoutAlive] }));
    let mine = (
      await db().select().from(roundPlayerSummaries).where(eq(roundPlayerSummaries.mapPlayId, id))
    ).find((p) => p.accountId === a.account.id);
    expect(mine).toMatchObject({ kills: 0 });

    await send(batch({ damages: [r.hit], kills: [r.kill] }));
    const all = await db()
      .select()
      .from(roundPlayerSummaries)
      .where(eq(roundPlayerSummaries.mapPlayId, id));
    expect(all).toHaveLength(2);
    mine = all.find((p) => p.accountId === a.account.id);
    expect(mine).toMatchObject({ kills: 1, damage: 60, openingKill: true });
    expect(
      await db().select().from(roundSummaries).where(eq(roundSummaries.mapPlayId, id)),
    ).toHaveLength(1);
  });

  it('dois mapas jogados (um reinício) são dois resumos de mapa, e rounds somam no mesmo mapa', async () => {
    const a = await player();
    const b = await player();
    const first = playId();
    const second = playId();
    const one = roundOf(a, b, first, 1);
    const two = roundOf(a, b, first, 2);
    const restarted = roundOf(a, b, second, 1);
    await send(
      batch({
        roundStarts: [one.start, two.start],
        kills: [one.kill, two.kill],
        roundEnds: [one.end, two.end],
      }),
    );
    await send(
      batch({
        roundStarts: [restarted.start],
        kills: [restarted.kill],
        roundEnds: [restarted.end],
      }),
    );

    const [m1] = await db().select().from(mapPlays).where(eq(mapPlays.id, first));
    const [m2] = await db().select().from(mapPlays).where(eq(mapPlays.id, second));
    expect(m1).toMatchObject({ rounds: 2 });
    expect(m2).toMatchObject({ rounds: 1 });
    const total = await db()
      .select()
      .from(mapPlayPlayers)
      .where(and(eq(mapPlayPlayers.mapPlayId, first), eq(mapPlayPlayers.accountId, a.account.id)));
    expect(total[0]).toMatchObject({ rounds: 2, kills: 2 });
  });

  it('aquecimento e round sem humanos nos dois lados não geram resumo (e o aquecimento nem evento bruto)', async () => {
    const a = await player();
    const b = await player();
    const warm = playId();
    const w = roundOf(a, b, warm);
    await send(
      batch({
        roundStarts: [{ ...w.start, warmup: true }],
        kills: [{ ...w.kill, warmup: true }],
        roundEnds: [{ ...w.end, warmup: true }],
      }),
    );
    expect(
      await db().select().from(roundEvents).where(eq(roundEvents.mapPlayId, warm)),
    ).toHaveLength(0);
    expect(
      await db().select().from(roundSummaries).where(eq(roundSummaries.mapPlayId, warm)),
    ).toHaveLength(0);

    // Sintético: só CT tem humanos (o cs2-retakes simula o outro lado).
    const synthetic = playId();
    const s = roundOf(a, b, synthetic);
    await send(
      batch({
        roundStarts: [
          {
            ...s.start,
            players: [{ steamId: a.steamId, team: 'ct', equipmentValue: 4750 }],
            botsT: 4,
          },
        ],
        roundEnds: [s.end],
      }),
    );
    expect(
      await db().select().from(roundEvents).where(eq(roundEvents.mapPlayId, synthetic)),
    ).not.toHaveLength(0);
    expect(
      await db().select().from(roundSummaries).where(eq(roundSummaries.mapPlayId, synthetic)),
    ).toHaveLength(0);
    expect(await db().select().from(mapPlays).where(eq(mapPlays.id, synthetic))).toHaveLength(0);
  });

  it('o plugin atual, sem mapPlayId, segue sendo aceito e não grava nada bruto', async () => {
    const a = await player();
    const b = await player();
    const r = roundOf(a, b, playId());
    const { mapPlayId: _m, roundNumber: _n, ...kill } = r.kill;
    const { mapPlayId: _m2, roundNumber: _n2, ...hit } = r.hit;
    const before = await counts();
    const result = await send(batch({ kills: [kill], damages: [hit] }));
    expect(result).toEqual({ accepted: 2, duplicates: 0, ignored: 0 });
    expect(await counts()).toEqual(before);
    const [weekly] = await db()
      .select()
      .from(accountStatsWeekly)
      .where(eq(accountStatsWeekly.accountId, a.account.id));
    expect(weekly).toMatchObject({ kills: 1, damage: 60 });
  });

  it('um evento de um mês sem partição cria a partição do mês', async () => {
    const a = await player();
    const b = await player();
    const r = roundOf(a, b, playId());
    const oldAt = new Date(Date.now() - 4 * MONTH_MS);
    await send(batch({ kills: [{ ...r.kill, at: oldAt.toISOString(), atMs: oldAt.getTime() }] }));
    const stored = await db().select().from(roundEvents).where(eq(roundEvents.id, r.kill.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.occurredAt.toISOString()).toBe(oldAt.toISOString());
  });

  it('a retenção solta a partição com mais de 12 meses e apaga as linhas do mês do corte; os resumos ficam', async () => {
    const a = await player();
    const b = await player();
    const id = playId();
    const r = roundOf(a, b, id);
    await send(batch({ roundStarts: [r.start], kills: [r.kill], roundEnds: [r.end] }));

    const now = new Date();
    const cutoff = new Date(
      Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()),
    );
    const longAgo = new Date(cutoff.getTime() - 40 * 24 * 60 * 60 * 1000);
    const justBefore = new Date(cutoff.getTime() - 60 * 60 * 1000);
    const justAfter = new Date(cutoff.getTime() + 60 * 60 * 1000);
    await new RoundEventPartitions(db()).ensureFor([longAgo, justBefore, justAfter]);
    const row = (at: Date) => ({
      id: eventId(),
      occurredAt: at,
      serverId: '00000000-0000-4000-8000-000000000000',
      mapPlayId: playId(),
      roundNumber: 1,
      kind: 'kill' as const,
    });
    // `server_id` não tem chave estrangeira: a linha de teste basta com um UUID qualquer.
    const old = row(longAgo);
    const boundary = row(justBefore);
    const kept = row(justAfter);
    await db().insert(roundEvents).values([old, boundary, kept]);

    const swept = await new DataRetention(db(), { batchSize: 1 }).sweep(now);
    expect(swept.roundEventPartitions).toBeGreaterThanOrEqual(1);

    const left = (await db().select({ id: roundEvents.id }).from(roundEvents)).map((e) => e.id);
    expect(left).not.toContain(old.id);
    expect(left).not.toContain(boundary.id);
    expect(left).toContain(kept.id);
    // O round de agora e o resumo dele seguem.
    expect(left).toContain(r.kill.id);
    expect(
      await db().select().from(roundSummaries).where(eq(roundSummaries.mapPlayId, id)),
    ).toHaveLength(1);

    // Rodar de novo não faz mal, e o mês seguinte já está criado.
    const again = await new DataRetention(db()).sweep(now);
    expect(again.roundEventPartitions).toBe(0);
    expect(again.roundEvents).toBe(0);
  });

  it('apagar a Conta tira os resumos dela e anonimiza os brutos, sem tocar nos da outra', async () => {
    const a = await player();
    const b = await player();
    const id = playId();
    const r = roundOf(a, b, id);
    await send(
      batch({ roundStarts: [r.start], damages: [r.hit], kills: [r.kill], roundEnds: [r.end] }),
    );

    await new AccountErasure(db(), {
      dropSessions: async () => undefined,
      invalidateEquipped: async () => undefined,
    }).anonymize(a.account.id, { actorSteamId: steamIdFor(9999), reason: 'teste' });

    const players = await db()
      .select()
      .from(roundPlayerSummaries)
      .where(eq(roundPlayerSummaries.mapPlayId, id));
    expect(players.map((p) => p.accountId)).toEqual([b.account.id]);
    expect(
      await db().select().from(mapPlayPlayers).where(eq(mapPlayPlayers.accountId, a.account.id)),
    ).toHaveLength(0);

    const mentions = await db()
      .select()
      .from(roundEvents)
      .where(
        or(
          eq(roundEvents.actorAccountId, a.account.id),
          eq(roundEvents.targetAccountId, a.account.id),
          eq(roundEvents.assistAccountId, a.account.id),
        ),
      );
    expect(mentions).toHaveLength(0);
    // A kill continua lá, agora sem o assassino; a vítima segue ligada à outra Conta.
    const [killRow] = await db().select().from(roundEvents).where(eq(roundEvents.id, r.kill.id));
    expect(killRow).toMatchObject({ actorAccountId: null, targetAccountId: b.account.id });
    const stillThere = await db()
      .select()
      .from(roundEvents)
      .where(and(eq(roundEvents.mapPlayId, id), isNull(roundEvents.actorAccountId)));
    expect(stillThere.length).toBeGreaterThan(0);
  });
});
