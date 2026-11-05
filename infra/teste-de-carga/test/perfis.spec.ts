import { rankingSchema } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { idsDoRanking } from '../lib/perfis.mjs';

const entrada = (position: number, publicId: number | null) => ({
  position,
  player: {
    private: publicId === null,
    publicId,
    displayName: publicId === null ? 'Jogador privado' : `Jogador ${publicId}`,
    avatarUrl: null,
  },
  score: 10,
  kd: 1,
  headshotPercent: 50,
  roundsPlayed: 60,
  secondsPlayed: 3600,
  self: false,
});

describe('Perfis para visitar', () => {
  it('lê o id em entry.player.publicId, no formato do contrato do Ranking, e pula Perfil privado', () => {
    const ranking = rankingSchema.parse({
      mode: 'retake',
      weekStart: '2026-11-02',
      weekEnd: '2026-11-08',
      current: true,
      minimum: { unit: 'rounds', value: 50 },
      entries: [entrada(1, 7), entrada(2, null), entrada(3, 12)],
      weeks: ['2026-11-02'],
      viewer: null,
    });
    expect(idsDoRanking(ranking)).toEqual([7, 12]);
  });

  it('devolve lista vazia, sem quebrar, para Ranking vazio ou resposta torta', () => {
    expect(idsDoRanking({ entries: [] })).toEqual([]);
    expect(idsDoRanking(null)).toEqual([]);
    expect(idsDoRanking({ entries: [{ publicId: 5 }] })).toEqual([]);
  });
});
