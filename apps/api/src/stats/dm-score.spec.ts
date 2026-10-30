import { DM_SCORE_MIN_POPULATION } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { type DmPart, type DmPopulation, type DmSums, dmParts, dmScore } from './dm-score.js';

const MINUTE = 60;

/** Uma Conta de DM com 2 h jogadas, variando com `i` para a população ter desvio. */
function account(i: number, seconds = 120 * MINUTE): DmSums {
  const kills = 300 + 17 * i;
  return {
    kills,
    deaths: 280 + ((i * 7) % 40),
    headshots: Math.round(kills * (0.2 + (i % 9) * 0.03)),
    damage: kills * (95 + (i % 5) * 6),
    secondsPlayed: seconds,
  };
}

/** Média e desvio de cada parte, como a consulta da população calcula. */
function populationOf(accounts: readonly DmSums[]): DmPopulation {
  const parts = accounts.map((sums) => {
    const p = dmParts(sums);
    if (!p) throw new Error('conta sem tempo');
    return p;
  });
  const stat = (pick: (p: (typeof parts)[number]) => number): DmPart => {
    const values = parts.map(pick);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return { mean, sd: Math.sqrt(variance) };
  };
  return {
    accounts: accounts.length,
    killsPerMinute: stat((p) => p.killsPerMinute),
    kd: stat((p) => p.kd),
    damagePerMinute: stat((p) => p.damagePerMinute),
    headshotPercent: stat((p) => p.headshotPercent),
  };
}

const POPULATION_SIZE = DM_SCORE_MIN_POPULATION + 10;
const accounts = Array.from({ length: POPULATION_SIZE }, (_, i) => account(i));
const population = populationOf(accounts);

describe('dmParts', () => {
  it('calcula as quatro taxas pelas definições da S12 (K/D com max(mortes, 1), HS% sobre kills)', () => {
    expect(
      dmParts({
        kills: 120,
        deaths: 60,
        headshots: 30,
        damage: 12_000,
        secondsPlayed: 30 * MINUTE,
      }),
    ).toEqual({ killsPerMinute: 4, kd: 2, damagePerMinute: 400, headshotPercent: 25 });
    expect(
      dmParts({ kills: 10, deaths: 0, headshots: 0, damage: 900, secondsPlayed: 10 * MINUTE })?.kd,
    ).toBe(10);
  });

  it('sem kills o HS% é 0 e sem tempo não há partes', () => {
    expect(
      dmParts({ kills: 0, deaths: 5, headshots: 0, damage: 0, secondsPlayed: 40 * MINUTE })
        ?.headshotPercent,
    ).toBe(0);
    expect(dmParts({ kills: 0, deaths: 0, headshots: 0, damage: 0, secondsPlayed: 0 })).toBeNull();
  });
});

describe('dmScore (S21, ADR 0030)', () => {
  it('a média da população fica em 100 (± 1), com 100 de média por construção antes do puxão', () => {
    const scores = accounts.map((sums) => dmScore(sums, population));
    expect(scores.every((score) => score !== null)).toBe(true);
    const mean = (scores as number[]).reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThan(99);
    expect(mean).toBeLessThan(101);
  });

  it('quem joga acima da média pontua acima de 100 e abaixo, abaixo', () => {
    const best = accounts.reduce((a, b) => (b.kills / b.deaths > a.kills / a.deaths ? b : a));
    const worst = accounts.reduce((a, b) => (b.kills / b.deaths < a.kills / a.deaths ? b : a));
    const high = dmScore(
      { ...best, damage: best.damage * 1.5, headshots: best.headshots * 2 },
      population,
    );
    const low = dmScore({ ...worst, damage: worst.damage * 0.6, headshots: 0 }, population);
    expect(high).toBeGreaterThan(100);
    expect(low).toBeLessThan(100);
  });

  it('uma Conta exatamente na média de todas as partes tem 100', () => {
    // 2 h jogadas: kills/min, K/D, dano/min e HS% iguais às médias da população.
    const minutes = 120;
    const kills = Math.round(population.killsPerMinute.mean * minutes);
    const sums: DmSums = {
      kills,
      deaths: Math.round(kills / population.kd.mean),
      headshots: Math.round((kills * population.headshotPercent.mean) / 100),
      damage: Math.round(population.damagePerMinute.mean * minutes),
      secondsPlayed: minutes * MINUTE,
    };
    expect(dmScore(sums, population)).toBeCloseTo(100, 0);
  });

  it('amostra pequena é puxada para 100: as mesmas taxas, com menos minutos, chegam menos longe', () => {
    const strong = account(POPULATION_SIZE - 1);
    // As mesmas taxas (kills, mortes, HS e dano por minuto) em tempos diferentes.
    const sameRates = (minutes: number): DmSums => {
      const scale = minutes / 120;
      return {
        kills: strong.kills * scale,
        deaths: strong.deaths * scale,
        headshots: strong.headshots * scale,
        damage: strong.damage * scale,
        secondsPlayed: minutes * MINUTE,
      };
    };
    const raw = (dmScore(sameRates(1_000_000), population) as number) - 100;
    const at30 = (dmScore(sameRates(30), population) as number) - 100;
    const at600 = (dmScore(sameRates(600), population) as number) - 100;
    // O puxão é minutos ÷ (minutos + 15): 30 min ficam a 2/3 do bruto, 600 min a 97,6%.
    expect(at30 / raw).toBeCloseTo(30 / 45, 1);
    expect(at600 / raw).toBeCloseTo(600 / 615, 1);
    expect(Math.abs(at30)).toBeLessThan(Math.abs(at600));
  });

  it('abaixo do mínimo de minutos do Ranking do DM, não há pontuação', () => {
    const sums = { ...account(3), secondsPlayed: 29 * MINUTE + 59 };
    expect(dmScore(sums, population)).toBeNull();
    expect(dmScore({ ...sums, secondsPlayed: 30 * MINUTE }, population)).not.toBeNull();
  });

  it('sem população, ou com poucas Contas, não há pontuação', () => {
    expect(dmScore(account(1), null)).toBeNull();
    expect(
      dmScore(account(1), { ...population, accounts: DM_SCORE_MIN_POPULATION - 1 }),
    ).toBeNull();
    expect(
      dmScore(account(1), { ...population, accounts: DM_SCORE_MIN_POPULATION }),
    ).not.toBeNull();
  });

  it('desvio zero numa parte: ela não separa ninguém (z = 0)', () => {
    const flat: DmPopulation = {
      accounts: POPULATION_SIZE,
      killsPerMinute: { mean: 2, sd: 0 },
      kd: { mean: 1, sd: 0 },
      damagePerMinute: { mean: 200, sd: 0 },
      headshotPercent: { mean: 30, sd: 0 },
    };
    expect(dmScore(account(5), flat)).toBe(100);
    // Só o K/D varia: a pontuação anda um quarto do que andaria com as quatro partes.
    const onlyKd: DmPopulation = { ...flat, kd: { mean: 1, sd: 0.5 } };
    const sums: DmSums = {
      kills: 240,
      deaths: 120,
      headshots: 0,
      damage: 0,
      secondsPlayed: 120 * MINUTE,
    };
    // K/D 2 → z = 2; as outras três partes valem 0 (sd 0): média 0,5 → 107,5, puxado por 120/135.
    expect(dmScore(sums, onlyKd)).toBeCloseTo(100 + 7.5 * (120 / 135), 1);
  });

  it('arredonda para 1 casa', () => {
    const score = dmScore(account(7), population) as number;
    expect(Math.round(score * 10) / 10).toBe(score);
  });
});
