import { describe, expect, it } from 'vitest';
import {
  brasiliaDay,
  deadlineAtOf,
  deadlineOf,
  greeting,
  PHOTO_DEADLINE_HOURS,
  REPORT_DEADLINE_HOURS,
  soonest,
} from './time';

const NOW = Date.parse('2026-10-29T15:00:00-03:00');
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

describe('prazo de cada fila', () => {
  it('a foto tem 24 h e a Denúncia 72 h (ADR 0022 e ADR 0019)', () => {
    expect(PHOTO_DEADLINE_HOURS).toBe(24);
    expect(REPORT_DEADLINE_HOURS).toBe(72);
  });

  it('a mesma idade pesa diferente em cada fila', () => {
    const photo = deadlineOf(hoursAgo(20), PHOTO_DEADLINE_HOURS, NOW);
    const report = deadlineOf(hoursAgo(20), REPORT_DEADLINE_HOURS, NOW);
    expect(photo.leftMin).toBe(4 * 60);
    expect(report.leftMin).toBe(52 * 60);
    expect(photo.tone).toBe('warn');
    expect(report.tone).toBe('ok');
  });

  it('a barra esvazia com o tempo e vencida fica em zero e vermelha', () => {
    const half = deadlineOf(hoursAgo(12), PHOTO_DEADLINE_HOURS, NOW);
    expect(half.remaining).toBeCloseTo(0.5, 5);
    const late = deadlineOf(hoursAgo(26), PHOTO_DEADLINE_HOURS, NOW);
    expect(late.remaining).toBe(0);
    expect(late.tone).toBe('danger');
    expect(late.label).toBe('venceu há 2 h 00 min');
  });

  it('diz quanto falta em horas e minutos', () => {
    expect(deadlineOf(hoursAgo(23.5), PHOTO_DEADLINE_HOURS, NOW).label).toBe('30 min restantes');
    expect(deadlineOf(hoursAgo(1), PHOTO_DEADLINE_HOURS, NOW).label).toBe('23 h 00 min restantes');
  });
});

describe('horário de Brasília', () => {
  it('o dia vira à meia-noite de Brasília, não à do UTC', () => {
    expect(brasiliaDay(Date.parse('2026-10-30T02:30:00Z'))).toBe('2026-10-29');
    expect(brasiliaDay(Date.parse('2026-10-30T03:30:00Z'))).toBe('2026-10-30');
  });

  it('a saudação segue a hora de Brasília', () => {
    expect(greeting(Date.parse('2026-10-29T09:00:00-03:00'))).toBe('Bom dia');
    expect(greeting(Date.parse('2026-10-29T15:00:00-03:00'))).toBe('Boa tarde');
    expect(greeting(Date.parse('2026-10-29T21:00:00-03:00'))).toBe('Boa noite');
    expect(greeting(Date.parse('2026-10-29T03:00:00-03:00'))).toBe('Boa noite');
  });
});

describe('prazo que vem da API (deadlineAt, regra única de denúncia)', () => {
  const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

  it('sem deadlineAt (caso decidido ou denunciante de peso baixo) não há prazo correndo', () => {
    expect(deadlineAtOf(null, REPORT_DEADLINE_HOURS, NOW)).toBeNull();
  });

  it('mede o que falta até o deadlineAt, no total da fila', () => {
    const photo = deadlineAtOf(at(6), PHOTO_DEADLINE_HOURS, NOW);
    expect(photo?.leftMin).toBe(6 * 60);
    expect(photo?.remaining).toBeCloseTo(0.25, 5);
    const report = deadlineAtOf(at(-2), REPORT_DEADLINE_HOURS, NOW);
    expect(report?.leftMin).toBe(-2 * 60);
    expect(report?.tone).toBe('danger');
  });

  it('o cartão mostra o prazo mais perto de vencer e ignora quem não tem prazo', () => {
    const soon = deadlineAtOf(at(3), REPORT_DEADLINE_HOURS, NOW);
    const late = deadlineAtOf(at(40), REPORT_DEADLINE_HOURS, NOW);
    expect(soonest([null, late, soon])?.leftMin).toBe(3 * 60);
    expect(soonest([null, null])).toBeNull();
    expect(soonest([])).toBeNull();
  });
});
