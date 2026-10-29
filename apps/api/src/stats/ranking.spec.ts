import { describe, expect, it } from 'vitest';
import {
  DEATHMATCH_MIN_SECONDS,
  progressToMinimum,
  RANKING_SIZE,
  type RankingRow,
  RETAKE_MIN_ROUNDS,
  rankWeek,
} from './ranking.js';

let seq = 0;
const row = (over: Partial<RankingRow> = {}): RankingRow => ({
  accountId: `conta-${++seq}`,
  publicId: 10_000 + seq,
  createdAt: new Date(Date.UTC(2026, 0, 1) + seq * 60_000),
  kills: 0,
  deaths: 0,
  assists: 0,
  headshots: 0,
  damage: 0,
  roundsPlayed: RETAKE_MIN_ROUNDS,
  roundsWon: 0,
  secondsPlayed: DEATHMATCH_MIN_SECONDS,
  ...over,
});

describe('Ranking do Retake', () => {
  it('ordena por rounds vencidos', () => {
    const ranked = rankWeek('retake', [
      row({ accountId: 'a', roundsWon: 20 }),
      row({ accountId: 'b', roundsWon: 35 }),
    ]);

    expect(ranked.map((entry) => [entry.position, entry.accountId])).toEqual([
      [1, 'b'],
      [2, 'a'],
    ]);
  });

  it('um empate em rounds vencidos é resolvido pelo K/D', () => {
    const ranked = rankWeek('retake', [
      row({ accountId: 'baixo', roundsWon: 30, kills: 10, deaths: 10 }),
      row({ accountId: 'alto', roundsWon: 30, kills: 30, deaths: 10 }),
    ]);

    expect(ranked.map((entry) => entry.accountId)).toEqual(['alto', 'baixo']);
  });

  it('o K/D que empata na tela (2 casas) cai para mais kills, depois para a Conta mais antiga', () => {
    const ranked = rankWeek('retake', [
      row({
        accountId: 'novo',
        createdAt: new Date('2026-03-01Z'),
        roundsWon: 30,
        kills: 20,
        deaths: 10,
      }),
      row({
        accountId: 'antigo',
        createdAt: new Date('2026-01-10Z'),
        roundsWon: 30,
        kills: 20,
        deaths: 10,
      }),
      row({
        accountId: 'mais-kills',
        createdAt: new Date('2026-05-01Z'),
        roundsWon: 30,
        kills: 40,
        deaths: 20,
      }),
    ]);

    expect(ranked.map((entry) => entry.accountId)).toEqual(['mais-kills', 'antigo', 'novo']);
    expect(ranked.map((entry) => entry.position)).toEqual([1, 2, 3]);
  });

  it('a Conta mais antiga é a de data de criação menor, não a de ID público menor (ID reservado vem depois)', () => {
    // O ID reservado (1 a 9.999) é dado pela Staff a uma Conta que pode ter nascido depois.
    const ranked = rankWeek('retake', [
      row({
        accountId: 'reservado-novo',
        publicId: 7,
        createdAt: new Date('2026-06-01Z'),
        roundsWon: 30,
      }),
      row({
        accountId: 'comum-antiga',
        publicId: 15_000,
        createdAt: new Date('2026-01-01Z'),
        roundsWon: 30,
      }),
    ]);

    expect(ranked.map((entry) => entry.accountId)).toEqual(['comum-antiga', 'reservado-novo']);
  });

  it('na mesma data de criação, o menor ID público fecha a ordem, em qualquer ordem de entrada', () => {
    const createdAt = new Date('2026-02-02T10:00:00Z');
    const rows = [
      row({ accountId: 'b', publicId: 12_000, createdAt, roundsWon: 30 }),
      row({ accountId: 'a', publicId: 11_000, createdAt, roundsWon: 30 }),
    ];

    expect(rankWeek('retake', rows).map((entry) => entry.accountId)).toEqual(['a', 'b']);
    expect(rankWeek('retake', [...rows].reverse()).map((entry) => entry.accountId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('exige o mínimo de rounds jogados na semana', () => {
    const ranked = rankWeek('retake', [
      row({ accountId: 'curto', roundsPlayed: RETAKE_MIN_ROUNDS - 1, roundsWon: 49 }),
      row({ accountId: 'justo', roundsPlayed: RETAKE_MIN_ROUNDS, roundsWon: 1 }),
    ]);

    expect(ranked.map((entry) => entry.accountId)).toEqual(['justo']);
  });

  it('a pontuação são os rounds vencidos', () => {
    const [entry] = rankWeek('retake', [row({ roundsWon: 33, kills: 9, deaths: 4 })]);

    expect(entry).toMatchObject({ score: 33, kd: 2.25, roundsPlayed: RETAKE_MIN_ROUNDS });
  });
});

describe('Ranking do Deathmatch', () => {
  it('ordena por KPM e desempata por HS%', () => {
    const ranked = rankWeek('deathmatch', [
      row({ accountId: 'lento', kills: 30, secondsPlayed: 3600 }),
      row({ accountId: 'rapido', kills: 90, secondsPlayed: 3600, headshots: 10 }),
      row({ accountId: 'rapido-hs', kills: 90, secondsPlayed: 3600, headshots: 45 }),
    ]);

    expect(ranked.map((entry) => entry.accountId)).toEqual(['rapido-hs', 'rapido', 'lento']);
    expect(ranked[0]).toMatchObject({ score: 1.5, headshotPercent: 50 });
  });

  it('exige o mínimo de 30 minutos na semana', () => {
    const ranked = rankWeek('deathmatch', [
      row({ accountId: 'curto', kills: 99, secondsPlayed: DEATHMATCH_MIN_SECONDS - 1 }),
      row({ accountId: 'justo', kills: 1, secondsPlayed: DEATHMATCH_MIN_SECONDS }),
    ]);

    expect(ranked.map((entry) => entry.accountId)).toEqual(['justo']);
  });

  it('é determinístico: o mesmo conjunto em qualquer ordem dá o mesmo Ranking', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ accountId: `c${i}`, publicId: 11_000 + i, kills: 60, secondsPlayed: 1800 }),
    );

    const forward = rankWeek('deathmatch', rows).map((entry) => entry.accountId);
    const backward = rankWeek('deathmatch', [...rows].reverse()).map((entry) => entry.accountId);

    expect(backward).toEqual(forward);
    expect(forward).toEqual(rows.map((r) => r.accountId));
  });
});

describe('tamanho do Ranking', () => {
  it('cada entrada leva a sua posição, mesmo além do top (quem corta é quem lê)', () => {
    const rows = Array.from({ length: RANKING_SIZE + 5 }, (_, i) =>
      row({ roundsWon: 200 - i, publicId: 10_000 + i }),
    );

    const ranked = rankWeek('retake', rows);

    expect(ranked).toHaveLength(RANKING_SIZE + 5);
    expect(ranked.at(-1)?.position).toBe(RANKING_SIZE + 5);
  });
});

describe('progresso até o mínimo', () => {
  it('Retake: faltam rounds', () => {
    expect(progressToMinimum('retake', row({ roundsPlayed: 38 }))).toEqual({
      unit: 'rounds',
      missing: 12,
    });
  });

  it('Deathmatch: faltam minutos, arredondando para cima', () => {
    expect(progressToMinimum('deathmatch', row({ secondsPlayed: 22 * 60 + 5 }))).toEqual({
      unit: 'minutes',
      missing: 8,
    });
  });

  it('sem nenhuma linha na semana, falta o mínimo inteiro', () => {
    expect(progressToMinimum('retake', null)).toEqual({ unit: 'rounds', missing: 50 });
    expect(progressToMinimum('deathmatch', null)).toEqual({ unit: 'minutes', missing: 30 });
  });

  it('é nulo quando o mínimo já foi cumprido', () => {
    expect(progressToMinimum('retake', row({ roundsPlayed: 80 }))).toBeNull();
    expect(progressToMinimum('deathmatch', row({ secondsPlayed: 7200 }))).toBeNull();
  });
});
