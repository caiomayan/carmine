import { describe, expect, it } from 'vitest';
import { rankingEntrySchema } from './ranking.js';
import { profileStatsSchema } from './stats.js';

/**
 * S21 P4 (#239): contrato do Rating nas superfícies. Escritos ANTES do código: falham hoje, porque o
 * Zod descarta o campo que ainda não existe. Fonte: spec S21 ("Onde aparece": Perfil com o Rating do
 * Modo e o geral; Ranking pelo Rating da semana) e ADR 0029 ("Estados": o Perfil nunca recebe um
 * número inventado). Os nomes `rating` e `overallRating` são suposição (pergunta no PR).
 */

const counts = {
  kills: 10,
  deaths: 5,
  assists: 1,
  kd: 2,
  headshotPercent: 50,
  secondsPlayed: 600,
};
const retakeMode = { mode: 'retake', ...counts, adr: 80, kpm: null };

describe('Rating no Perfil', () => {
  it('o Modo carrega o Rating nos quatro estados e o geral vem ao lado', () => {
    for (const rating of [
      { status: 'rated', rating: 0.85, rounds: 636 },
      { status: 'calibrating', rounds: 37, required: 100 },
      { status: 'no_rounds' },
      { status: 'no_population' },
    ]) {
      const parsed = profileStatsSchema.parse({
        visible: true,
        total: counts,
        modes: [{ ...retakeMode, rating }],
        overallRating: { rating: 0.85, rounds: 636 },
      });

      expect(parsed.modes[0]).toMatchObject({ rating });
      expect(parsed).toMatchObject({ overallRating: { rating: 0.85, rounds: 636 } });
    }
  });

  it('o geral pode ser nulo (nenhum Modo com Rating visível) e o campo é opcional para o cliente antigo', () => {
    const base = { visible: true, total: counts, modes: [retakeMode] };

    expect(profileStatsSchema.parse({ ...base, overallRating: null })).toMatchObject({
      overallRating: null,
    });
    expect(profileStatsSchema.safeParse(base).success).toBe(true);
  });

  it('rejeita um estado de Rating que o ADR não define', () => {
    const bad = { ...retakeMode, rating: { status: 'rated_soon' } };

    expect(
      profileStatsSchema.safeParse({ visible: true, total: counts, modes: [bad] }).success,
    ).toBe(false);
  });
});

describe('Rating no Ranking', () => {
  const entry = {
    position: 1,
    player: { private: false, publicId: 1, displayName: 'Ana', avatarUrl: null },
    score: 120,
    kd: 1.5,
    headshotPercent: 40,
    roundsPlayed: 200,
    secondsPlayed: 3600,
    self: false,
  };

  it('a linha do Retake carrega o Rating da semana, com 2 casas', () => {
    expect(rankingEntrySchema.parse({ ...entry, rating: 1.16 })).toMatchObject({ rating: 1.16 });
  });

  it('a linha sem Rating (Deathmatch, ou chave desligada) continua válida', () => {
    expect(rankingEntrySchema.safeParse(entry).success).toBe(true);
  });
});
