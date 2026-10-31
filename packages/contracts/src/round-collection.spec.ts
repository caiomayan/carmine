import { describe, expect, it } from 'vitest';
import {
  bombEventSchema,
  countEvents,
  damageEventSchema,
  eventBatchSchema,
  killEventSchema,
  roundEndEventSchema,
  roundStartEventSchema,
} from './stats.js';

const STEAM_ID = '76561198000000001';
const OTHER_STEAM_ID = '76561198000000002';
const UUID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';
const PLAY_ID = '0199f2a0-7b1c-7000-8000-000000000099';
const AT = '2026-10-28T20:00:00.250-03:00';

const kill = {
  id: UUID,
  at: AT,
  warmup: false,
  killerSteamId: STEAM_ID,
  killerIsBot: false,
  victimSteamId: OTHER_STEAM_ID,
  victimIsBot: false,
  assisterSteamId: null,
  assisterIsBot: false,
  headshot: false,
  weapon: 'ak47',
  teamKill: false,
};

const damage = {
  id: UUID,
  at: AT,
  warmup: false,
  attackerSteamId: STEAM_ID,
  victimIsBot: false,
  teamDamage: false,
  amount: 120,
};

const roundEnd = { id: UUID, at: AT, warmup: false, winner: 'ct', players: [] };

describe('S17 · contratos v2 (campos novos opcionais, o plugin atual segue valendo)', () => {
  it('a kill, o dano e o fim de round de hoje continuam sem nenhum campo novo', () => {
    expect(killEventSchema.parse(kill)).toEqual({ ...kill });
    expect(damageEventSchema.parse(damage)).toEqual(damage);
    expect(roundEndEventSchema.parse(roundEnd)).toEqual(roundEnd);
  });

  it('todo evento pode levar o mapa jogado, o round e o horário do servidor em ms', () => {
    const context = { mapPlayId: PLAY_ID, roundNumber: 7, atMs: 1_792_000_000_250 };
    expect(killEventSchema.parse({ ...kill, ...context })).toMatchObject(context);
    expect(damageEventSchema.parse({ ...damage, ...context })).toMatchObject(context);
    expect(roundEndEventSchema.parse({ ...roundEnd, ...context })).toMatchObject(context);
    expect(killEventSchema.safeParse({ ...kill, mapPlayId: 'nao-e-uuid' }).success).toBe(false);
    expect(killEventSchema.safeParse({ ...kill, roundNumber: 0 }).success).toBe(false);
    expect(killEventSchema.safeParse({ ...kill, atMs: -1 }).success).toBe(false);
  });

  it('a kill v2 leva o lado da vítima, o flash assist, os detalhes do tiro e as posições', () => {
    const v2 = {
      victimTeam: 'ct',
      flashAssist: true,
      penetrated: 1,
      throughSmoke: false,
      attackerBlind: true,
      noScope: false,
      distance: 812.5,
      killerPosition: { x: 10, y: -20.5, z: 64 },
      victimPosition: { x: 400, y: 300, z: 0 },
    };
    expect(killEventSchema.parse({ ...kill, ...v2 })).toMatchObject(v2);
    expect(killEventSchema.parse({ ...kill, victimTeam: null }).victimTeam).toBeNull();
    expect(killEventSchema.safeParse({ ...kill, victimTeam: 'spectator' }).success).toBe(false);
    expect(killEventSchema.safeParse({ ...kill, distance: -1 }).success).toBe(false);
    expect(killEventSchema.safeParse({ ...kill, penetrated: -1 }).success).toBe(false);
    expect(killEventSchema.safeParse({ ...kill, killerPosition: { x: 1, y: 2 } }).success).toBe(
      false,
    );
  });

  it('o dano v2 leva a vítima, a arma, o hitgroup, a armadura e o dano limitado à vida', () => {
    const v2 = {
      victimSteamId: OTHER_STEAM_ID,
      weapon: 'awp',
      hitgroup: 1,
      armorDamage: 4,
      healthDamage: 33,
    };
    expect(damageEventSchema.parse({ ...damage, ...v2 })).toMatchObject(v2);
    expect(damageEventSchema.parse({ ...damage, victimSteamId: null }).victimSteamId).toBeNull();
    expect(damageEventSchema.safeParse({ ...damage, hitgroup: 11 }).success).toBe(false);
    expect(damageEventSchema.safeParse({ ...damage, healthDamage: -1 }).success).toBe(false);
    expect(damageEventSchema.safeParse({ ...damage, healthDamage: 501 }).success).toBe(false);
  });

  it('o fim de round v2 leva o motivo, a duração e quem estava vivo', () => {
    const v2 = { reason: 'bomb_defused', durationMs: 41_250, alive: [STEAM_ID] };
    expect(roundEndEventSchema.parse({ ...roundEnd, ...v2 })).toMatchObject(v2);
    expect(roundEndEventSchema.safeParse({ ...roundEnd, reason: 'rage_quit' }).success).toBe(false);
    expect(roundEndEventSchema.safeParse({ ...roundEnd, durationMs: -5 }).success).toBe(false);
    expect(roundEndEventSchema.safeParse({ ...roundEnd, alive: ['x'] }).success).toBe(false);
  });
});

describe('S17 · round_start e bomb', () => {
  const start = {
    id: UUID,
    at: AT,
    warmup: false,
    mapPlayId: PLAY_ID,
    roundNumber: 1,
    players: [
      { steamId: STEAM_ID, team: 'ct', equipmentValue: 4750 },
      { steamId: OTHER_STEAM_ID, team: 't', equipmentValue: 800 },
    ],
  };

  it('o início do round leva o lado e o valor do equipamento de cada jogador', () => {
    const parsed = roundStartEventSchema.parse(start);
    expect(parsed.players).toHaveLength(2);
    expect(parsed.botsCt).toBe(0);
    expect(parsed.botsT).toBe(0);
    expect(roundStartEventSchema.parse({ ...start, botsCt: 2, botsT: 1 })).toMatchObject({
      botsCt: 2,
      botsT: 1,
    });
    expect(
      roundStartEventSchema.safeParse({
        ...start,
        players: [{ steamId: STEAM_ID, team: 'ct', equipmentValue: -1 }],
      }).success,
    ).toBe(false);
    expect(roundStartEventSchema.safeParse({ ...start, mapPlayId: undefined }).success).toBe(false);
  });

  it('a bomba é plantada, desarmada ou explode, com quem e em qual bomb site', () => {
    const plant = {
      id: UUID,
      at: AT,
      warmup: false,
      mapPlayId: PLAY_ID,
      roundNumber: 3,
      kind: 'plant',
      steamId: STEAM_ID,
      site: 'a',
    };
    expect(bombEventSchema.parse(plant)).toMatchObject({ kind: 'plant', site: 'a' });
    expect(bombEventSchema.parse({ ...plant, kind: 'explode', steamId: null })).toMatchObject({
      kind: 'explode',
      steamId: null,
    });
    expect(bombEventSchema.parse({ ...plant, site: null }).site).toBeNull();
    expect(bombEventSchema.safeParse({ ...plant, kind: 'drop' }).success).toBe(false);
    expect(bombEventSchema.safeParse({ ...plant, site: 'c' }).success).toBe(false);
  });

  it('o lote aceita os eventos novos, ausentes valem como vazios e todos contam no limite', () => {
    const base = { kills: [], damages: [], roundEnds: [], sessionStarts: [], sessionEnds: [] };
    expect(eventBatchSchema.parse(base)).toEqual(base);
    const bomb = {
      id: UUID,
      at: AT,
      warmup: false,
      mapPlayId: PLAY_ID,
      roundNumber: 1,
      kind: 'explode',
    };
    const batch = eventBatchSchema.parse({ ...base, roundStarts: [start], bombs: [bomb] });
    expect(countEvents(batch)).toBe(2);
    const tooMany = Array.from({ length: 250 }, () => bomb);
    expect(
      eventBatchSchema.safeParse({
        ...base,
        roundStarts: Array.from({ length: 251 }, () => start),
        bombs: tooMany,
      }).success,
    ).toBe(false);
  });
});
