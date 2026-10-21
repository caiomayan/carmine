import { describe, expect, it } from 'vitest';
import { vipDaysLeft } from './account-menu';

const now = new Date('2026-10-20T15:00:00-03:00');
const inDays = (days: number, extraHours = 0) =>
  new Date(now.getTime() + days * 86_400_000 + extraHours * 3_600_000).toISOString();

describe('vipDaysLeft', () => {
  it('conta os dias que faltam, arredondando para cima (hoje ainda é VIP)', () => {
    expect(vipDaysLeft({ active: true, endsAt: inDays(12) }, now)).toBe(12);
    expect(vipDaysLeft({ active: true, endsAt: inDays(11, 1) }, now)).toBe(12);
    expect(vipDaysLeft({ active: true, endsAt: inDays(0, 3) }, now)).toBe(1);
  });

  it('sem VIP ativo, não há contagem', () => {
    expect(vipDaysLeft({ active: false, endsAt: null }, now)).toBeNull();
    expect(vipDaysLeft({ active: false, endsAt: inDays(5) }, now)).toBeNull();
  });

  it('ativo sem data de fim (dado incompleto) não inventa número', () => {
    expect(vipDaysLeft({ active: true, endsAt: null }, now)).toBeNull();
  });

  it('um fim que já passou (sessão velha na aba) não mostra dias negativos', () => {
    expect(vipDaysLeft({ active: true, endsAt: inDays(0, -2) }, now)).toBeNull();
  });
});
