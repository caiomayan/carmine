import { createHash } from 'node:crypto';

/** Sorteio em [0, 1) que, com a mesma semente, repete a mesma sequência. */
export type Random = () => number;

/** mulberry32, semeado por um texto: a demonstração é a mesma a cada deploy. */
export function seeded(seed: string): Random {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Um número em [min, max). */
export function between(random: Random, min: number, max: number): number {
  return min + random() * (max - min);
}

export function pick<T>(random: Random, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)] as T;
}

/** UUID estável para um texto (o mesmo texto, o mesmo ID): a chave da idempotência dos eventos. */
export function uuidFor(label: string): string {
  const bytes = createHash('sha256').update(label).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
