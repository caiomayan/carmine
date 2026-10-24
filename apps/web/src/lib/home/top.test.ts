import type { Ranking } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { topRows } from './top';

const entry = (
  position: number,
  over: Partial<Ranking['entries'][number]['player']> = {},
  score = 90,
) => ({
  position,
  player: {
    private: false,
    publicId: 10_000 + position,
    displayName: `Jogador ${position}`,
    avatarUrl: `https://cdn.example/${position}.jpg`,
    ...over,
  },
  score,
  kd: 1,
  headshotPercent: 40,
  roundsPlayed: 100,
  secondsPlayed: 3600,
  self: false,
});

const ranking = (mode: Ranking['mode'], entries: Ranking['entries']) => ({ mode, entries });

describe('topRows', () => {
  it('leva as três primeiras linhas, na ordem do Ranking, com link para o Perfil', () => {
    const rows = topRows(ranking('retake', [entry(1), entry(2), entry(3), entry(4)]));
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ name: 'Jogador 1', href: '/10001', private: false });
    expect(rows[0]?.avatarUrl).toBe('https://cdn.example/1.jpg');
  });

  it('Perfil privado é "Jogador privado", sem link e sem avatar, e continua contando no top', () => {
    const rows = topRows(
      ranking('retake', [
        entry(1, {
          private: true,
          publicId: null,
          displayName: 'Jogador privado',
          avatarUrl: null,
        }),
        entry(2),
      ]),
    );
    expect(rows[0]).toMatchObject({
      name: 'Jogador privado',
      private: true,
      href: null,
      avatarUrl: null,
    });
    expect(rows).toHaveLength(2);
  });

  it('Retake mostra rounds inteiros; Deathmatch, abates por minuto com 2 casas', () => {
    expect(topRows(ranking('retake', [entry(1, {}, 120)]))[0]).toMatchObject({
      value: 120,
      decimals: 0,
    });
    expect(topRows(ranking('deathmatch', [entry(1, {}, 1.37)]))[0]).toMatchObject({
      value: 1.37,
      decimals: 2,
    });
  });

  it('sem ninguém no Ranking, nenhuma linha', () => {
    expect(topRows(ranking('retake', []))).toEqual([]);
  });
});
