import { describe, expect, it } from 'vitest';
import { vipFeaturesOf, vipNoticeAt } from './vip.js';

describe('vipFeaturesOf', () => {
  it('skin de arma sem StatTrak nem nametag é do plano grátis', () => {
    expect(vipFeaturesOf('weapon', { statTrak: undefined, nameTag: undefined })).toEqual([]);
  });

  it('agentes e music kits são VIP', () => {
    expect(vipFeaturesOf('agent', {})).toEqual(['agent']);
    expect(vipFeaturesOf('musickit', {})).toEqual(['musicKit']);
  });

  it('StatTrak e nametag são VIP em qualquer Item', () => {
    expect(vipFeaturesOf('melee', { statTrak: 0, nameTag: 'faca' })).toEqual([
      'statTrak',
      'nameTag',
    ]);
  });
});

describe('vipNoticeAt', () => {
  // 11/10/2026 às 10h em Brasília (UTC-3).
  const now = new Date('2026-10-11T13:00:00Z');
  const active = (endsAt: string) => ({ active: true, endsAt, endedAt: null });

  it('sem VIP e sem fim recente, não avisa', () => {
    expect(vipNoticeAt({ active: false, endsAt: null, endedAt: null }, now)).toBeNull();
  });

  it('avisa do fim nos 3 dias antes', () => {
    expect(vipNoticeAt(active('2026-10-14T23:00:00Z'), now)).toBe('ending_soon'); // 14/10, 20h
    expect(vipNoticeAt(active('2026-10-15T12:00:00Z'), now)).toBeNull(); // 15/10: 4 dias
  });

  it('o dia do fim é o de Brasília', () => {
    // 12/10 às 01h UTC ainda é 11/10 às 22h em Brasília.
    expect(vipNoticeAt(active('2026-10-12T01:00:00Z'), now)).toBe('ending_today');
    expect(vipNoticeAt(active('2026-10-12T03:30:00Z'), now)).toBe('ending_soon');
  });

  it('no dia em que acabou, avisa que acabou', () => {
    const ended = { active: false, endsAt: null, endedAt: '2026-10-11T12:00:00Z' };
    const endedYesterday = { ...ended, endedAt: '2026-10-11T02:00:00Z' }; // 10/10, 23h

    expect(vipNoticeAt(ended, now)).toBe('ended_today');
    expect(vipNoticeAt(endedYesterday, now)).toBeNull();
  });
});
