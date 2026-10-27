import { describe, expect, it } from 'vitest';
import { makeShards } from './shards';

describe('makeShards', () => {
  it('dois triângulos por célula, sempre a mesma saída para a mesma semente', () => {
    const a = makeShards(6, 8);
    expect(a).toHaveLength(6 * 8 * 2);
    expect(makeShards(6, 8)).toEqual(a);
    expect(makeShards(6, 8, 99)).not.toEqual(a);
  });

  it('cada caco é um triângulo dentro da tela e solta mais cedo quem está perto do canto de onde o papel sai', () => {
    const shards = makeShards(10, 6);
    for (const shard of shards) {
      const points = [...shard.clip.matchAll(/(-?\d+(?:\.\d+)?)% (-?\d+(?:\.\d+)?)%/g)];
      expect(points).toHaveLength(3);
      for (const [, x, y] of points) {
        expect(Number(x)).toBeGreaterThanOrEqual(0);
        expect(Number(x)).toBeLessThanOrEqual(100);
        expect(Number(y)).toBeGreaterThanOrEqual(0);
        expect(Number(y)).toBeLessThanOrEqual(100);
      }
      expect(shard.delay).toBeGreaterThanOrEqual(0);
      expect(shard.delay).toBeLessThanOrEqual(0.9);
    }
    const near = shards.filter((s) => s.cx < 25 && s.cy > 75);
    const far = shards.filter((s) => s.cx > 75 && s.cy < 25);
    const mean = (list: typeof shards) => list.reduce((n, s) => n + s.delay, 0) / list.length;
    expect(mean(near)).toBeLessThan(mean(far));
  });

  it('a área dos triângulos cobre a tela inteira (o papel não deixa buraco)', () => {
    const shards = makeShards(8, 5, 3);
    let area = 0;
    for (const shard of shards) {
      const p = [...shard.clip.matchAll(/(-?\d+(?:\.\d+)?)% (-?\d+(?:\.\d+)?)%/g)].map((m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
      }));
      const [a, b, c] = p;
      if (!a || !b || !c) throw new Error('triângulo incompleto');
      area += Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);
    }
    // 100 × 100 = 10.000, com a tolerância dos arredondamentos.
    expect(area).toBeGreaterThan(9990);
    expect(area).toBeLessThan(10010);
  });
});
