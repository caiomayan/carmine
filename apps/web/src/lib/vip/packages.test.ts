import { VIP_PACKAGES } from '@carmine/contracts/payments';
import { PLAN_PACKAGES } from '@carmine/contracts/plans';
import { describe, expect, it } from 'vitest';
import {
  bestValueId,
  buyState,
  formatBrl,
  packagesByPlan,
  perMonthCents,
  purchaseHref,
  savingsPercent,
} from './packages';

const packages = [...VIP_PACKAGES];
const [one, three, six] = packages;

describe('preços', () => {
  it('formata em reais, como se lê no Brasil', () => {
    expect(formatBrl(990).replace(/\s/g, ' ')).toBe('R$ 9,90');
    expect(formatBrl(4990).replace(/\s/g, ' ')).toBe('R$ 49,90');
  });

  it('o preço por mês divide o Pacote, arredondado ao centavo', () => {
    expect(perMonthCents(one as never)).toBe(990);
    expect(perMonthCents(three as never)).toBe(897);
    expect(perMonthCents(six as never)).toBe(832);
  });
});

describe('economia e melhor preço', () => {
  it('compara cada Pacote com pagar o mês avulso pelo mesmo tempo', () => {
    expect(savingsPercent(one as never, packages as never)).toBe(0);
    expect(savingsPercent(three as never, packages as never)).toBe(9);
    expect(savingsPercent(six as never, packages as never)).toBe(16);
  });

  it('sem Pacote de 1 mês para comparar, não há economia a dizer', () => {
    expect(savingsPercent(six as never, [three, six] as never)).toBe(0);
  });

  it('um Pacote que não sai mais barato que o mês avulso não anuncia economia', () => {
    const odd = { id: 'vip-3m', months: 3, days: 90, priceCents: 3000 };
    expect(savingsPercent(odd as never, [one, odd] as never)).toBe(0);
  });

  it('o melhor preço é o menor por mês; com um Pacote só, nenhum', () => {
    expect(bestValueId(packages as never)).toBe('vip-6m');
    expect(bestValueId([one] as never)).toBeNull();
    expect(bestValueId([])).toBeNull();
  });
});

describe('buyState', () => {
  it('cobrança desligada é "Em breve", mesmo para quem não pode comprar', () => {
    expect(buyState({ enabled: false, eligibility: 'ok' })).toEqual({ kind: 'soon' });
    expect(buyState({ enabled: false, eligibility: null })).toEqual({ kind: 'soon' });
  });

  it('visitante entra com a Steam; quem pode comprar compra', () => {
    expect(buyState({ enabled: true, eligibility: null })).toEqual({ kind: 'signin' });
    expect(buyState({ enabled: true, eligibility: 'ok' })).toEqual({ kind: 'buy' });
  });

  it('cada motivo de bloqueio chega ao botão', () => {
    for (const reason of [
      'banned',
      'purchases_blocked',
      'purchase_in_progress',
      'daily_limit',
    ] as const) {
      expect(buyState({ enabled: true, eligibility: reason })).toEqual({ kind: 'blocked', reason });
    }
  });
});

describe('purchaseHref', () => {
  it('é a confirmação do Pacote', () => {
    expect(purchaseHref('vip-3m')).toBe('/plans/checkout?pacote=vip-3m');
  });
});

describe('packagesByPlan', () => {
  it('agrupa os Pacotes por plano, Capo primeiro, com os 3 de cada', () => {
    const groups = packagesByPlan({
      packages: [...VIP_PACKAGES],
      planPackages: [...PLAN_PACKAGES],
    });
    expect(groups.map((group) => [group.plan, group.packages.map((pack) => pack.id)])).toEqual([
      ['capo', ['vip-1m', 'vip-3m', 'vip-6m']],
      ['padrinho', ['padrinho-1m', 'padrinho-3m', 'padrinho-6m']],
    ]);
  });

  it('uma API sem planPackages (de antes da S20) só tem o Capo, com os Pacotes de sempre', () => {
    const groups = packagesByPlan({ packages: [...VIP_PACKAGES] });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.plan).toBe('capo');
    expect(groups[0]?.packages.map((pack) => pack.priceCents)).toEqual([990, 2690, 4990]);
  });

  it('a economia e o melhor preço se calculam dentro de cada plano, nunca entre eles', () => {
    for (const { packages } of packagesByPlan({
      packages: [...VIP_PACKAGES],
      planPackages: [...PLAN_PACKAGES],
    })) {
      const [one, three, six] = packages;
      expect(savingsPercent(one as never, packages)).toBe(0);
      expect(savingsPercent(three as never, packages)).toBeGreaterThanOrEqual(9);
      expect(savingsPercent(six as never, packages)).toBeGreaterThanOrEqual(16);
      expect(bestValueId(packages)).toBe(six?.id);
    }
  });

  it('o endereço da confirmação aceita os Pacotes dos dois planos', () => {
    expect(purchaseHref('padrinho-6m')).toBe('/plans/checkout?pacote=padrinho-6m');
  });
});
