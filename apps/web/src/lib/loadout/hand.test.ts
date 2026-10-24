import { describe, expect, it } from 'vitest';
import { CARD, focusAt, handLayout, handMode, restX, stepFor } from './hand';

const layout = (over: Partial<Parameters<typeof handLayout>[0]> = {}) =>
  handLayout({ count: 5, width: 900, focused: null, active: null, reduced: false, ...over });

describe('stepFor', () => {
  it('poucas cartas ficam lado a lado, com um respiro', () => {
    expect(stepFor(2, 900)).toBe(CARD.width + 12);
  });

  it('muitas cartas se sobrepõem para caber na largura', () => {
    // 20 cartas em 1000 px: (1000 - 132) / 19.
    expect(stepFor(20, 1000)).toBeCloseTo((1000 - CARD.width) / 19);
    expect(stepFor(20, 1000)).toBeLessThan(CARD.width);
  });

  it('uma carta só não tem passo', () => {
    expect(stepFor(1, 900)).toBe(0);
  });
});

describe('handMode', () => {
  it('cabe com sobreposição: leque', () => {
    expect(handMode(20, 1000)).toBe('fan');
    expect(handMode(1, 300)).toBe('fan');
  });

  it('não cabe nem com a sobreposição mínima: fileira que rola', () => {
    expect(handMode(20, 600)).toBe('row');
    expect(handMode(8, 390)).toBe('row');
  });
});

describe('handLayout', () => {
  it('sem cartas, sem poses', () => {
    expect(layout({ count: 0 })).toEqual([]);
  });

  it('uma carta fica no centro, sem inclinar', () => {
    const [pose] = layout({ count: 1 });
    expect(pose).toMatchObject({ x: 0, rotate: 0 });
  });

  it('as cartas ficam em ordem da esquerda para a direita, simétricas em volta do centro', () => {
    const poses = layout({ count: 5 });
    const xs = poses.map((pose) => pose.x);

    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[2]).toBe(0);
    expect(xs[0]).toBeCloseTo(-(xs[4] as number));
  });

  it('o leque inclina as pontas para fora e as baixa um pouco', () => {
    const poses = layout({ count: 5 });

    expect(poses[0]?.rotate).toBeLessThan(0);
    expect(poses[4]?.rotate).toBeGreaterThan(0);
    expect(poses[2]?.rotate).toBe(0);
    expect(poses[0]?.y).toBeGreaterThan(poses[2]?.y as number);
  });

  describe('folhear (carta em foco)', () => {
    it('a carta em foco sobe, cresce, endireita e fica por cima', () => {
      const poses = layout({ focused: 1 });

      expect(poses[1]?.y).toBeLessThan(poses[0]?.y as number);
      expect(poses[1]?.scale).toBeGreaterThan(1);
      expect(poses[1]?.rotate).toBe(0);
      expect(Math.max(...poses.map((pose) => pose.z))).toBe(poses[1]?.z);
    });

    it('as vizinhas abrem espaço para os lados, sem trocar de ordem', () => {
      const rest = layout({ count: 12, width: 800 });
      const open = layout({ count: 12, width: 800, focused: 5 });

      expect((open[4]?.x as number) < (rest[4]?.x as number)).toBe(true);
      expect((open[6]?.x as number) > (rest[6]?.x as number)).toBe(true);
      const xs = open.map((pose) => pose.x);
      expect(xs).toEqual([...xs].sort((a, b) => a - b));
    });

    it('a abertura diminui com a distância', () => {
      const rest = layout({ count: 12, width: 800 });
      const open = layout({ count: 12, width: 800, focused: 0 });
      const shift = (i: number) => (open[i]?.x as number) - (rest[i]?.x as number);

      expect(shift(1)).toBeGreaterThan(shift(2));
      expect(shift(2)).toBeGreaterThan(shift(8));
    });

    it('sem sobreposição (poucas cartas) não há o que abrir: só a carta sobe', () => {
      const rest = layout({ count: 3, width: 900 });
      const open = layout({ count: 3, width: 900, focused: 1 });

      expect(open.map((pose) => pose.x)).toEqual(rest.map((pose) => pose.x));
    });
  });

  it('a carta ativa descansa um pouco acima das outras', () => {
    const poses = layout({ active: 3 });

    expect(poses[3]?.y).toBeLessThan(poses[2]?.y as number);
    expect(poses[3]?.y).toBeLessThan(poses[4]?.y as number);
  });

  it('em repouso, a carta ativa fica por cima das vizinhas', () => {
    const poses = layout({ active: 3 });

    expect(Math.max(...poses.map((pose) => pose.z))).toBe(poses[3]?.z);
  });

  describe('movimento reduzido', () => {
    it('sem inclinação, sem subir, sem crescer e sem abrir espaço: a mão não se mexe', () => {
      const rest = layout({ count: 12, width: 800, reduced: true });
      const focused = layout({ count: 12, width: 800, reduced: true, focused: 5, active: 2 });

      for (const pose of focused) {
        expect(pose.rotate).toBe(0);
        expect(pose.scale).toBe(1);
        expect(pose.y).toBe(0);
      }
      expect(focused.map((pose) => pose.x)).toEqual(rest.map((pose) => pose.x));
    });

    it('a carta em foco ainda fica por cima, para ser lida', () => {
      const poses = layout({ reduced: true, focused: 1 });

      expect(Math.max(...poses.map((pose) => pose.z))).toBe(poses[1]?.z);
    });
  });
});

describe('focusAt', () => {
  it('a carta cujo centro está mais perto do ponteiro', () => {
    const count = 5;
    const width = 900;

    expect(focusAt(0, count, width)).toBe(2);
    expect(focusAt(restX(0, count, width), count, width)).toBe(0);
    expect(focusAt(restX(4, count, width) + 3, count, width)).toBe(4);
  });

  it('fora da mão, a primeira ou a última', () => {
    expect(focusAt(-5000, 5, 900)).toBe(0);
    expect(focusAt(5000, 5, 900)).toBe(4);
  });

  it('sem cartas, nenhuma', () => {
    expect(focusAt(0, 0, 900)).toBeNull();
  });
});
