import { describe, expect, it } from 'vitest';
import {
  EVENT_BATCH_MAX_EVENTS,
  eventBatchSchema,
  killEventSchema,
  profileSeriesSchema,
  profileStatsSchema,
} from './stats.js';

const STEAM_ID = '76561198000000001';
const AT = '2026-10-18T15:00:00.000-03:00';

const kill = {
  id: '0199f2a0-7b1c-7000-8000-000000000001',
  at: AT,
  warmup: false,
  killerSteamId: STEAM_ID,
  killerIsBot: false,
  victimSteamId: '76561198000000002',
  victimIsBot: false,
  assisterSteamId: null,
  assisterIsBot: false,
  headshot: true,
  weapon: 'ak47',
  teamKill: false,
};

const empty = { kills: [], damages: [], roundEnds: [], sessionStarts: [], sessionEnds: [] };

describe('eventBatchSchema', () => {
  it('aceita um lote com uma kill e um lote vazio', () => {
    expect(eventBatchSchema.parse({ ...empty, kills: [kill] }).kills).toHaveLength(1);
    expect(eventBatchSchema.safeParse(empty).success).toBe(true);
  });

  it('rejeita ID que não é UUID, horário sem fuso e SteamID inválido', () => {
    expect(killEventSchema.safeParse({ ...kill, id: 'abc' }).success).toBe(false);
    expect(killEventSchema.safeParse({ ...kill, at: '2026-10-18 15:00' }).success).toBe(false);
    expect(killEventSchema.safeParse({ ...kill, killerSteamId: '123' }).success).toBe(false);
  });

  it('rejeita lote com mais eventos que o limite, somando os tipos', () => {
    const many = Array.from({ length: EVENT_BATCH_MAX_EVENTS }, () => kill);
    const damage = {
      id: kill.id,
      at: AT,
      warmup: false,
      attackerSteamId: STEAM_ID,
      victimIsBot: false,
      teamDamage: false,
      amount: 20,
    };

    expect(eventBatchSchema.safeParse({ ...empty, kills: many }).success).toBe(true);
    expect(eventBatchSchema.safeParse({ ...empty, kills: many, damages: [damage] }).success).toBe(
      false,
    );
  });
});

describe('profileStatsSchema', () => {
  it('aceita o Perfil privado visto por outra pessoa, sem números', () => {
    expect(profileStatsSchema.parse({ visible: false, total: null, modes: [] }).visible).toBe(
      false,
    );
  });
});

describe('profileSeriesSchema', () => {
  const counts = {
    rounds: 0,
    kills: 0,
    deaths: 0,
    kd: 0,
    headshotPercent: null,
    secondsPlayed: 0,
  };
  const hours = [
    { mode: 'retake', secondsPlayed: 0 },
    { mode: 'deathmatch', secondsPlayed: 0 },
  ];

  it('aceita o Perfil privado visto por outra pessoa: sem semanas, horas nem primeira semana', () => {
    const series = { visible: false, weeks: [], hours: null, firstWeek: null };

    expect(profileSeriesSchema.parse(series)).toEqual(series);
  });

  it('aceita uma semana com os dois Modos e HS% nulo', () => {
    const week = {
      weekStart: '2026-10-19',
      ...counts,
      modes: [
        { mode: 'retake', ...counts },
        { mode: 'deathmatch', ...counts },
      ],
    };

    expect(
      profileSeriesSchema.safeParse({
        visible: true,
        weeks: [week],
        hours: { week: hours, total: hours },
        firstWeek: null,
      }).success,
    ).toBe(true);
  });

  it('recusa primeira semana que não é uma data e segundos negativos', () => {
    expect(
      profileSeriesSchema.safeParse({ visible: true, weeks: [], hours: null, firstWeek: 'ontem' })
        .success,
    ).toBe(false);
    expect(
      profileSeriesSchema.safeParse({
        visible: true,
        weeks: [],
        hours: { week: [{ mode: 'retake', secondsPlayed: -1 }], total: [] },
        firstWeek: null,
      }).success,
    ).toBe(false);
  });
});
