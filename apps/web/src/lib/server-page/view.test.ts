import { describe, expect, it } from 'vitest';
import type { RosterPlayer, Today } from './types';
import {
  alphabeticalBySide,
  busiestHour,
  ctShare,
  currentMap,
  firstActiveHour,
  killDeathRatio,
  minutesBetween,
  minutesOnMap,
  namesOnly,
  rankedAll,
  rankedBySide,
  serverHref,
  serverPhase,
} from './view';

const player = (over: Partial<RosterPlayer> & Pick<RosterPlayer, 'id'>): RosterPlayer => ({
  name: over.id,
  avatarUrl: null,
  publicId: 1,
  team: 'ct',
  kills: 0,
  deaths: 0,
  score: 0,
  ...over,
});

describe('serverPhase', () => {
  const match = { round: 3, ctScore: 1, tScore: 1, warmup: false };
  it('offline vence tudo; aquecimento só no ar; lotado é a lotação', () => {
    expect(serverPhase({ state: 'offline' }, { ...match, warmup: true })).toBe('offline');
    expect(serverPhase({ state: 'online' }, { ...match, warmup: true })).toBe('warmup');
    expect(serverPhase({ state: 'full' }, match)).toBe('full');
    expect(serverPhase({ state: 'online' }, null)).toBe('live');
  });
});

describe('ordem dos jogadores', () => {
  const roster = [
    player({ id: 'b', score: 10, kills: 5 }),
    player({ id: 'a', score: 10, kills: 5 }),
    player({ id: 'privado', name: null, publicId: null, score: 10, kills: 5 }),
    player({ id: 'c', score: 20 }),
    player({ id: 'x', team: 't', score: 99 }),
  ];

  it('por pontos, depois abates, depois nome, com o privado por último no empate', () => {
    expect(rankedBySide(roster, 'ct').map((p) => p.id)).toEqual(['c', 'a', 'b', 'privado']);
    expect(rankedBySide(roster, 't').map((p) => p.id)).toEqual(['x']);
  });

  it('todos juntos (Deathmatch) respeitam a mesma regra e não mexem na lista original', () => {
    const before = roster.map((p) => p.id);
    expect(rankedAll(roster).map((p) => p.id)).toEqual(['x', 'c', 'a', 'b', 'privado']);
    expect(roster.map((p) => p.id)).toEqual(before);
  });

  it('no aquecimento, em ordem alfabética com o privado no fim', () => {
    expect(alphabeticalBySide(roster, 'ct').map((p) => p.id)).toEqual(['a', 'b', 'c', 'privado']);
  });

  it('sem placar por jogador, todos juntos por nome com o privado no fim', () => {
    expect(namesOnly(roster).map((p) => p.id)).toEqual(['a', 'b', 'c', 'x', 'privado']);
  });
});

describe('números', () => {
  it('K/D: morrer zero vezes conta como um', () => {
    expect(killDeathRatio({ kills: 7, deaths: 0 })).toBe('7.00');
    expect(killDeathRatio({ kills: 7, deaths: 3 })).toBe('2.33');
    expect(killDeathRatio({ kills: 0, deaths: 0 })).toBe('0.00');
  });

  it('a fatia do CT é 50 sem nenhum round', () => {
    expect(ctShare(0, 0)).toBe(50);
    expect(ctShare(3, 1)).toBe(75);
  });

  it('minutos entre horários do mesmo dia, nunca negativos', () => {
    expect(minutesBetween('20:44', '21:07')).toBe(23);
    expect(minutesBetween('21:10', '21:07')).toBe(0);
  });
});

describe('histórico do dia', () => {
  const today = (maps: Today['maps']): Today => ({
    date: '2026-10-26',
    clock: '21:07',
    rounds: { played: 0, ctWins: 0, tWins: 0 },
    maps,
    hours: [],
    hoursMetric: 'rounds',
    peakPlayers: { at: '20:12', count: 9 },
    uniquePlayers: 3,
    since: null,
  });
  const ended = { map: 'de_nuke', from: '19:12', to: '19:52', rounds: 27, ctWins: 14, tWins: 13 };
  const now = { map: 'de_mirage', from: '20:41', to: null, rounds: 14, ctWins: 8, tWins: 6 };

  it('o mapa de agora é o último sem horário de fim', () => {
    expect(currentMap(today([ended, now]))).toBe(now);
    expect(currentMap(today([ended]))).toBeNull();
    expect(minutesOnMap(today([ended, now]))).toBe(26);
    expect(minutesOnMap(today([ended]))).toBeNull();
  });

  it('a hora mais cheia é a primeira no empate; sem round, nenhuma', () => {
    const hours = Array.from({ length: 24 }, (_, h) => (h === 18 || h === 19 ? 38 : 0));
    expect(busiestHour(hours)).toEqual({ hour: 18, rounds: 38 });
    expect(firstActiveHour(hours)).toBe(18);
    expect(busiestHour(Array(24).fill(0))).toBeNull();
    expect(firstActiveHour(Array(24).fill(0))).toBeNull();
  });
});

describe('serverHref', () => {
  it('é /servidores/<id>', () => {
    expect(serverHref('abc')).toBe('/servidores/abc');
  });
});
