import type { Plan } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { planStatusOfPeriods } from './plan-periods.js';
import { applyPurchase, planPurchase, type StoredPeriod } from './plan-purchase.js';
import { type PlanGrant, planStatusAt } from './plan-timeline.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 12);
const day = (n: number) => new Date(T0 + n * DAY_MS);

interface Buy {
  plan: Plan;
  days: number;
  atDay: number;
  test?: boolean;
}

/** Compra em sequência, guardando os Períodos como a API vai guardar. */
function buyAll(buys: Buy[]): { periods: StoredPeriod[]; grants: PlanGrant[] } {
  let periods: StoredPeriod[] = [];
  const grants: PlanGrant[] = [];
  let id = 0;
  for (const { plan, days, atDay, test = false } of buys) {
    const now = day(atDay);
    const writes = planPurchase(periods, now, { plan, days, test });
    periods = applyPurchase(periods, writes, () => `p${++id}`);
    grants.push({ plan, days, at: now, test });
  }
  return { periods, grants };
}

const shape = (periods: StoredPeriod[]) =>
  [...periods]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((p) => [p.plan, (p.startsAt.getTime() - T0) / DAY_MS, (p.endsAt.getTime() - T0) / DAY_MS]);

describe('planPurchase · o que se grava quando a Conta compra um pacote', () => {
  it('sem plano, o pacote começa agora', () => {
    expect(shape(buyAll([{ plan: 'capo', days: 30, atDay: 0 }]).periods)).toEqual([
      ['capo', 0, 30],
    ]);
  });

  it('o mesmo plano com ele ativo soma ao fim', () => {
    const { periods } = buyAll([
      { plan: 'capo', days: 30, atDay: 0 },
      { plan: 'capo', days: 30, atDay: 10 },
    ]);
    expect(shape(periods)).toEqual([
      ['capo', 0, 30],
      ['capo', 30, 60],
    ]);
  });

  it('Padrinho sobre Capo: o Capo é cortado na compra, o Padrinho começa na hora e os 20 dias do Capo voltam depois', () => {
    const { periods } = buyAll([
      { plan: 'capo', days: 30, atDay: 0 },
      { plan: 'padrinho', days: 30, atDay: 10 },
    ]);
    expect(shape(periods)).toEqual([
      ['capo', 0, 10],
      ['padrinho', 10, 40],
      ['capo', 40, 60],
    ]);
  });

  it('Capo sobre Padrinho espera na fila; outro Capo soma aos dias que esperam', () => {
    const { periods } = buyAll([
      { plan: 'padrinho', days: 30, atDay: 0 },
      { plan: 'capo', days: 30, atDay: 5 },
      { plan: 'capo', days: 30, atDay: 8 },
    ]);
    expect(shape(periods)).toEqual([
      ['padrinho', 0, 30],
      ['capo', 30, 60],
      ['capo', 60, 90],
    ]);
  });

  it('mais Padrinho com ele ativo estende o Padrinho e empurra a fila', () => {
    const { periods } = buyAll([
      { plan: 'padrinho', days: 30, atDay: 0 },
      { plan: 'capo', days: 30, atDay: 5 },
      { plan: 'padrinho', days: 30, atDay: 8 },
    ]);
    expect(shape(periods)).toEqual([
      ['padrinho', 0, 30],
      ['padrinho', 30, 60],
      ['capo', 60, 90],
    ]);
  });

  it('o compra de teste leva a marca de teste, também no Capo guardado', () => {
    const { periods } = buyAll([
      { plan: 'capo', days: 30, atDay: 0, test: true },
      { plan: 'padrinho', days: 30, atDay: 10, test: true },
    ]);
    expect(periods.every((p) => p.test)).toBe(true);
  });

  it('o que está guardado dá, em todo momento, o mesmo plano que a agenda das concessões', () => {
    // Sequências de compras (plano, dias, dia da compra) que misturam tudo: trocas, fila, buracos e testes.
    const sequences: Buy[][] = [
      [
        { plan: 'capo', days: 30, atDay: 0 },
        { plan: 'padrinho', days: 30, atDay: 10 },
        { plan: 'capo', days: 90, atDay: 12 },
        { plan: 'padrinho', days: 30, atDay: 20 },
      ],
      [
        { plan: 'padrinho', days: 30, atDay: 0 },
        { plan: 'capo', days: 30, atDay: 40 },
        { plan: 'padrinho', days: 90, atDay: 50 },
        { plan: 'capo', days: 30, atDay: 55 },
      ],
      [
        { plan: 'capo', days: 30, atDay: 0, test: true },
        { plan: 'capo', days: 30, atDay: 5 },
        { plan: 'padrinho', days: 30, atDay: 7, test: true },
      ],
      [
        { plan: 'capo', days: 180, atDay: 0 },
        { plan: 'padrinho', days: 30, atDay: 1 },
        { plan: 'padrinho', days: 30, atDay: 2 },
        { plan: 'capo', days: 30, atDay: 3 },
      ],
    ];
    for (const buys of sequences) {
      const { periods, grants } = buyAll(buys);
      for (let n = 0; n <= 400; n += 0.75) {
        const stored = planStatusOfPeriods(periods, day(n));
        const expected = planStatusAt(grants, day(n));
        const label = `dia ${n} de ${JSON.stringify(buys)}`;
        expect(stored.active, label).toBe(expected.active);
        expect(stored.plan, label).toBe(expected.plan);
        expect(stored.endsAt?.getTime() ?? null, label).toBe(expected.endsAt?.getTime() ?? null);
        expect(stored.planEndsAt?.getTime() ?? null, label).toBe(
          expected.planEndsAt?.getTime() ?? null,
        );
      }
    }
  });
});
