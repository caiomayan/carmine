import { describe, expect, it } from 'vitest';
import { VIP_PACKAGES } from './payments.js';
import {
  PLAN_PACKAGES,
  PLAN_TEST_NOTICE_DAYS,
  PLANS,
  packagesOf,
  planPackage,
  planPackageIdSchema,
  planSchema,
  presetLimitFor,
} from './plans.js';
import { PRESETS_FREE_LIMIT } from './rules.js';

describe('Planos (S20)', () => {
  it('há dois planos, Capo e Padrinho', () => {
    expect(PLANS).toEqual(['capo', 'padrinho']);
    expect(planSchema.safeParse('capo').success).toBe(true);
    expect(planSchema.safeParse('padrinho').success).toBe(true);
    expect(planSchema.safeParse('vip').success).toBe(false);
  });

  it('Presets: grátis 1, Capo 6 e Padrinho 25; sem plano é o grátis', () => {
    expect(presetLimitFor(null)).toBe(PRESETS_FREE_LIMIT);
    expect(presetLimitFor(null)).toBe(1);
    expect(presetLimitFor('capo')).toBe(6);
    expect(presetLimitFor('padrinho')).toBe(25);
  });

  it('cada plano tem os pacotes de 1, 3 e 6 meses (30 dias por mês)', () => {
    for (const plan of PLANS) {
      expect(packagesOf(plan).map((p) => [p.months, p.days])).toEqual([
        [1, 30],
        [3, 90],
        [6, 180],
      ]);
    }
  });

  it('os preços: Capo R$ 9,90 / 26,90 / 49,90 e Padrinho R$ 19,90 / 53,90 / 99,90', () => {
    expect(packagesOf('capo').map((p) => p.priceCents)).toEqual([990, 2690, 4990]);
    expect(packagesOf('padrinho').map((p) => p.priceCents)).toEqual([1990, 5390, 9990]);
  });

  it('os descontos de 3 e 6 meses são os mesmos nos dois planos (cerca de 10% e 16%)', () => {
    for (const plan of PLANS) {
      const [one, three, six] = packagesOf(plan);
      const off = (months: number, price: number) => 1 - price / ((one?.priceCents ?? 0) * months);
      expect(off(3, three?.priceCents ?? 0)).toBeGreaterThan(0.08);
      expect(off(3, three?.priceCents ?? 0)).toBeLessThan(0.12);
      expect(off(6, six?.priceCents ?? 0)).toBeGreaterThan(0.14);
      expect(off(6, six?.priceCents ?? 0)).toBeLessThan(0.18);
    }
  });

  it('os pacotes do Capo mantêm os IDs e os preços legados do VIP (nomes internos, nunca na tela)', () => {
    const legacy = packagesOf('capo').map(({ id, months, days, priceCents }) => ({
      id,
      months,
      days,
      priceCents,
    }));
    expect(legacy).toEqual(VIP_PACKAGES.map((p) => ({ ...p })));
    expect(packagesOf('padrinho').map((p) => p.id)).toEqual([
      'padrinho-1m',
      'padrinho-3m',
      'padrinho-6m',
    ]);
  });

  it('o ID do pacote diz de qual plano ele é', () => {
    expect(planPackage('vip-3m')).toMatchObject({ plan: 'capo', months: 3 });
    expect(planPackage('padrinho-6m')).toMatchObject({ plan: 'padrinho', months: 6 });
    expect(planPackageIdSchema.safeParse('capo-1m').success).toBe(false);
    expect(PLAN_PACKAGES).toHaveLength(6);
  });

  it('o aviso do fim dos planos de teste é 7 dias antes', () => {
    expect(PLAN_TEST_NOTICE_DAYS).toBe(7);
  });
});
