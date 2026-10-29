import type { Plan } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { type PlanGrant, planStatusAt, planTimeline } from './plan-timeline.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 12);
/** O instante `n` dias depois do começo da história. */
const day = (n: number) => new Date(T0 + n * DAY_MS);

const grant = (plan: Plan, days: number, atDay: number, test = false): PlanGrant => ({
  plan,
  days,
  at: day(atDay),
  test,
});

/** Os segmentos como [plano, de, até], em dias, para ler a história de relance. */
const shape = (grants: PlanGrant[], options = {}) =>
  planTimeline(grants, options).map((s) => [
    s.plan,
    (s.startsAt.getTime() - T0) / DAY_MS,
    (s.endsAt.getTime() - T0) / DAY_MS,
  ]);

describe('planTimeline · uma Conta e seus planos ao longo do tempo', () => {
  it('sem nenhuma concessão não há plano', () => {
    expect(planTimeline([])).toEqual([]);
    expect(planStatusAt([], day(5))).toEqual({
      active: false,
      plan: null,
      test: false,
      planEndsAt: null,
      endsAt: null,
      next: null,
      endedAt: null,
    });
  });

  it('um Capo de 30 dias vale do dia da compra até o 30º, e depois acabou', () => {
    const grants = [grant('capo', 30, 0)];
    expect(shape(grants)).toEqual([['capo', 0, 30]]);
    expect(planStatusAt(grants, day(29.5))).toMatchObject({
      active: true,
      plan: 'capo',
      endsAt: day(30),
    });
    expect(planStatusAt(grants, day(30))).toMatchObject({
      active: false,
      plan: null,
      endedAt: day(30),
    });
    expect(planStatusAt(grants, day(-1))).toMatchObject({ active: false, endedAt: null });
  });

  it('comprar o mesmo plano com ele ativo soma os dias ao fim', () => {
    expect(shape([grant('capo', 30, 0), grant('capo', 30, 10)])).toEqual([['capo', 0, 60]]);
    expect(shape([grant('padrinho', 30, 0), grant('padrinho', 90, 10)])).toEqual([
      ['padrinho', 0, 120],
    ]);
  });

  it('comprar depois de acabar recomeça do dia da compra, e o buraco não conta', () => {
    const grants = [grant('capo', 30, 0), grant('capo', 30, 40)];
    expect(shape(grants)).toEqual([
      ['capo', 0, 30],
      ['capo', 40, 70],
    ]);
    expect(planStatusAt(grants, day(35))).toMatchObject({ active: false, endedAt: day(30) });
    expect(planStatusAt(grants, day(41))).toMatchObject({ active: true, endsAt: day(70) });
  });

  describe('Padrinho sobre Capo: o Padrinho começa na hora e os dias do Capo ficam guardados', () => {
    const grants = [grant('capo', 30, 0), grant('padrinho', 30, 10)];

    it('o Capo corre até a compra, o Padrinho depois, e os 20 dias que sobravam voltam no fim', () => {
      expect(shape(grants)).toEqual([
        ['capo', 0, 10],
        ['padrinho', 10, 40],
        ['capo', 40, 60],
      ]);
    });

    it('durante o Padrinho o plano é Padrinho, o plano acaba no dia 40 e o Capo espera até o 60', () => {
      const status = planStatusAt(grants, day(15));
      expect(status).toMatchObject({
        active: true,
        plan: 'padrinho',
        planEndsAt: day(40),
        endsAt: day(60),
      });
      expect(status.next).toMatchObject({ plan: 'capo', startsAt: day(40), endsAt: day(60) });
    });

    it('quando o Padrinho acaba, o Capo volta a correr e termina no 60', () => {
      expect(planStatusAt(grants, day(45))).toMatchObject({
        plan: 'capo',
        planEndsAt: day(60),
        endsAt: day(60),
        next: null,
      });
      expect(planStatusAt(grants, day(60))).toMatchObject({ active: false, endedAt: day(60) });
    });
  });

  describe('Capo sobre Padrinho: o Capo entra na fila e começa quando o Padrinho acabar', () => {
    it('o Capo espera, depois corre', () => {
      const grants = [grant('padrinho', 30, 0), grant('capo', 30, 5)];
      expect(shape(grants)).toEqual([
        ['padrinho', 0, 30],
        ['capo', 30, 60],
      ]);
      expect(planStatusAt(grants, day(6)).next).toMatchObject({ plan: 'capo', endsAt: day(60) });
    });

    it('outro Capo com o Padrinho ativo soma aos dias de Capo que esperam', () => {
      const grants = [grant('capo', 30, 0), grant('padrinho', 30, 10), grant('capo', 30, 12)];
      // 20 dias de Capo guardados + 30 comprados = 50 depois do Padrinho (10 a 40).
      expect(shape(grants)).toEqual([
        ['capo', 0, 10],
        ['padrinho', 10, 40],
        ['capo', 40, 90],
      ]);
    });

    it('mais Padrinho empurra a fila toda para frente', () => {
      const grants = [grant('padrinho', 30, 0), grant('capo', 30, 5), grant('padrinho', 30, 8)];
      expect(shape(grants)).toEqual([
        ['padrinho', 0, 60],
        ['capo', 60, 90],
      ]);
    });
  });

  it('o resultado não depende da ordem em que as concessões vêm', () => {
    const grants = [grant('capo', 30, 0), grant('padrinho', 30, 10), grant('capo', 30, 12)];
    expect(shape([...grants].reverse())).toEqual(shape(grants));
    expect(shape([grants[1] as PlanGrant, grants[2] as PlanGrant, grants[0] as PlanGrant])).toEqual(
      shape(grants),
    );
  });

  it('tirar uma concessão (reembolso) recua o fim exatamente esses dias', () => {
    const capo = grant('capo', 30, 0);
    const padrinho = grant('padrinho', 30, 10);
    expect(planStatusAt([capo, padrinho], day(15)).endsAt).toEqual(day(60));
    expect(planStatusAt([capo], day(15)).endsAt).toEqual(day(30));
  });

  describe('revogação da Staff', () => {
    it('zera tudo no instante da revogação, inclusive os dias guardados na fila', () => {
      const grants = [grant('capo', 30, 0), grant('padrinho', 30, 10)];
      const options = { revokedAt: [day(15)] };
      expect(shape(grants, options)).toEqual([
        ['capo', 0, 10],
        ['padrinho', 10, 15],
      ]);
      expect(planStatusAt(grants, day(16), options)).toMatchObject({
        active: false,
        endedAt: day(15),
      });
    });

    it('uma concessão depois da revogação vale normalmente', () => {
      const grants = [grant('capo', 30, 0), grant('capo', 30, 20)];
      expect(shape(grants, { revokedAt: [day(15)] })).toEqual([
        ['capo', 0, 15],
        ['capo', 20, 50],
      ]);
    });

    it('revogar no mesmo instante de uma concessão vence a concessão', () => {
      expect(shape([grant('capo', 30, 5)], { revokedAt: [day(5)] })).toEqual([]);
    });
  });

  describe('planos de teste do beta: acabam na data em que a cobrança real liga', () => {
    it('sem data, o plano de teste vale como qualquer outro', () => {
      expect(shape([grant('padrinho', 30, 0, true)])).toEqual([['padrinho', 0, 30]]);
    });

    it('com a data, o plano de teste acaba nela, mesmo com dias sobrando', () => {
      const grants = [grant('padrinho', 30, 0, true)];
      const options = { testsEndAt: day(20) };
      expect(shape(grants, options)).toEqual([['padrinho', 0, 20]]);
      expect(planStatusAt(grants, day(5), options)).toMatchObject({
        active: true,
        plan: 'padrinho',
        test: true,
        endsAt: day(20),
      });
      expect(planStatusAt(grants, day(21), options)).toMatchObject({
        active: false,
        endedAt: day(20),
      });
    });

    it('o teste é gasto primeiro: os dias pagos sobrevivem à data', () => {
      const grants = [grant('capo', 30, 0, true), grant('capo', 30, 5)];
      // Teste de 0 a 20 (10 dias sobram e acabam); os 30 pagos correm depois, de 20 a 50.
      expect(planTimeline(grants, { testsEndAt: day(20) }).map((s) => [s.plan, s.test])).toEqual([
        ['capo', true],
        ['capo', false],
      ]);
      expect(planStatusAt(grants, day(10), { testsEndAt: day(20) })).toMatchObject({
        test: true,
        endsAt: day(50),
      });
      expect(planStatusAt(grants, day(25), { testsEndAt: day(20) })).toMatchObject({
        test: false,
        endsAt: day(50),
      });
    });

    it('um Padrinho de teste passa à frente de um Capo pago e some na data; o Capo pago continua', () => {
      const grants = [grant('capo', 30, 0), grant('padrinho', 30, 5, true)];
      const options = { testsEndAt: day(15) };
      // Capo pago 0 a 5; Padrinho de teste 5 a 15 (acaba); o Capo guardado (25 dias) corre de 15 a 40.
      expect(shape(grants, options)).toEqual([
        ['capo', 0, 5],
        ['padrinho', 5, 15],
        ['capo', 15, 40],
      ]);
    });

    it('uma concessão de teste depois da data não vale (os testes acabaram)', () => {
      expect(shape([grant('capo', 30, 25, true)], { testsEndAt: day(20) })).toEqual([]);
    });

    it('o plano que já vale depois da data não é de teste', () => {
      const grants = [grant('padrinho', 30, 0)];
      expect(planStatusAt(grants, day(5), { testsEndAt: day(20) })).toMatchObject({
        test: false,
        endsAt: day(30),
      });
    });
  });
});
