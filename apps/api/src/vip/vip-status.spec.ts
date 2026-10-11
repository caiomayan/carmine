import { describe, expect, it } from 'vitest';
import { vipStatusAt } from './vip-status.js';

const at = (iso: string) => new Date(iso);
const period = (startsAt: string, endsAt: string) => ({
  startsAt: at(startsAt),
  endsAt: at(endsAt),
});
const now = at('2026-10-11T12:00:00Z');

describe('vipStatusAt', () => {
  it('sem Períodos, não há VIP', () => {
    expect(vipStatusAt([], now)).toEqual({ active: false, endsAt: null, endedAt: null });
  });

  it('com um Período em curso, o VIP vai até o fim dele', () => {
    const periods = [period('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z')];

    expect(vipStatusAt(periods, now)).toEqual({
      active: true,
      endsAt: at('2026-10-31T00:00:00Z'),
      endedAt: null,
    });
  });

  it('Períodos encerrados ou futuros não ativam o VIP', () => {
    const periods = [
      period('2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'),
      period('2026-10-12T00:00:00Z', '2026-11-11T00:00:00Z'),
    ];

    expect(vipStatusAt(periods, now)).toMatchObject({ active: false, endsAt: null });
  });

  it('sem VIP ativo, endedAt é o fim do último Período encerrado', () => {
    const periods = [
      period('2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z'),
      period('2026-09-15T00:00:00Z', '2026-10-01T00:00:00Z'),
      period('2026-10-12T00:00:00Z', '2026-11-11T00:00:00Z'), // futuro: não encerrou
    ];

    expect(vipStatusAt(periods, now)).toEqual({
      active: false,
      endsAt: null,
      endedAt: at('2026-10-01T00:00:00Z'),
    });
  });

  it('o fim é exclusivo: no instante do fim, o VIP já acabou', () => {
    const periods = [period('2026-10-01T00:00:00Z', '2026-10-11T12:00:00Z')];

    expect(vipStatusAt(periods, now).active).toBe(false);
  });

  it('Períodos encadeados ou sobrepostos somam: o fim é o do último da cadeia', () => {
    const periods = [
      period('2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z'), // começa quando o 2º acaba
      period('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z'),
      period('2026-10-20T00:00:00Z', '2026-11-10T00:00:00Z'), // sobrepõe o 1º
      period('2026-12-20T00:00:00Z', '2027-01-20T00:00:00Z'), // depois de um buraco: não conta
    ];

    expect(vipStatusAt(periods, now)).toEqual({
      active: true,
      endsAt: at('2026-12-10T00:00:00Z'),
      endedAt: null,
    });
  });
});
