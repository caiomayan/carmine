import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isSteamId64, vipNoticeAt } from './rules.js';

describe('rules', () => {
  it('não importa o Zod: o web usa este módulo na primeira carga', () => {
    const source = readFileSync(new URL('./rules.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import .*$/gm)].map((match) => match[0]);
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line).toMatch(/^import type /);
  });

  it('reconhece só o SteamID64 de uma conta individual', () => {
    expect(isSteamId64('76561198000000000')).toBe(true);
    expect(isSteamId64('7656119800000000')).toBe(false);
    expect(isSteamId64('76561198000000000a')).toBe(false);
    expect(isSteamId64('99999999999999999')).toBe(false);
  });

  it('avisa o fim do VIP no dia de Brasília', () => {
    const now = new Date('2026-10-17T15:00:00Z');
    const vip = (endsAt: string | null, endedAt: string | null, active: boolean) => ({
      active,
      endsAt,
      endedAt,
    });
    expect(vipNoticeAt(vip('2026-10-17T22:00:00Z', null, true), now)).toBe('ending_today');
    expect(vipNoticeAt(vip('2026-10-19T12:00:00Z', null, true), now)).toBe('ending_soon');
    expect(vipNoticeAt(vip('2026-11-30T12:00:00Z', null, true), now)).toBeNull();
    expect(vipNoticeAt(vip(null, '2026-10-17T10:00:00Z', false), now)).toBe('ended_today');
  });
});
