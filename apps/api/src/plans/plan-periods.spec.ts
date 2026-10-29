import { describe, expect, it } from 'vitest';
import { vipStatusAt } from '../vip/vip-status.js';
import { type PeriodRow, planStatusOfPeriods } from './plan-periods.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0, 123);
const day = (n: number) => new Date(T0 + n * DAY_MS);

const row = (
  from: number,
  to: number,
  plan: PeriodRow['plan'] = 'capo',
  test = false,
): PeriodRow => ({
  startsAt: day(from),
  endsAt: day(to),
  plan,
  test,
});

describe('planStatusOfPeriods · os Períodos guardados viram o plano de agora', () => {
  it('com um plano só dá o mesmo resultado do VIP de antes, em qualquer momento', () => {
    const histories: PeriodRow[][] = [
      [],
      [row(0, 30)],
      [row(0, 30), row(30, 60)],
      [row(0, 30), row(30, 90), row(90, 120)],
      [row(0, 30), row(40, 70)],
      [row(0, 10)],
    ];
    for (const periods of histories) {
      for (let n = -2; n <= 130; n += 0.5) {
        const now = day(n);
        const before = vipStatusAt(periods, now);
        const after = planStatusOfPeriods(periods, now);
        expect(after.active, `ativo no dia ${n}`).toBe(before.active);
        expect(after.endsAt?.getTime() ?? null, `fim no dia ${n}`).toBe(
          before.endsAt?.getTime() ?? null,
        );
        expect(after.endedAt?.getTime() ?? null, `acabou no dia ${n}`).toBe(
          before.endedAt?.getTime() ?? null,
        );
      }
    }
  });

  it('toda linha sem plano escolhido é Capo (as anteriores à S20)', () => {
    expect(planStatusOfPeriods([row(0, 30)], day(5))).toMatchObject({ active: true, plan: 'capo' });
  });

  it('Padrinho sobre Capo: o Padrinho agora, o Capo guardado depois', () => {
    // Capo comprado no dia 0 (30 dias); no dia 10 o Padrinho de 30 dias; o Capo que sobrava (20 dias) volta no 40.
    const periods = [row(0, 10), row(10, 40, 'padrinho'), row(40, 60)];
    const now = planStatusOfPeriods(periods, day(15));
    expect(now).toMatchObject({
      active: true,
      plan: 'padrinho',
      planEndsAt: day(40),
      endsAt: day(60),
    });
    expect(now.next).toMatchObject({ plan: 'capo', startsAt: day(40), endsAt: day(60) });
    expect(planStatusOfPeriods(periods, day(45))).toMatchObject({ plan: 'capo', endsAt: day(60) });
  });

  it('a revogação da Staff zera o plano, a fila e tudo o que viria depois', () => {
    const periods = [row(0, 10), row(10, 40, 'padrinho'), row(40, 60)];
    const status = planStatusOfPeriods(periods, day(20), { revokedAt: [day(15)] });
    expect(status).toMatchObject({ active: false, plan: null, endedAt: day(15) });
  });

  it('um Período de teste vale como o outro até a data em que os testes acabam', () => {
    const periods = [row(0, 30, 'padrinho', true)];
    expect(planStatusOfPeriods(periods, day(5))).toMatchObject({
      plan: 'padrinho',
      test: true,
      endsAt: day(30),
    });
    expect(planStatusOfPeriods(periods, day(5), { testsEndAt: day(20) })).toMatchObject({
      endsAt: day(20),
    });
  });
});
