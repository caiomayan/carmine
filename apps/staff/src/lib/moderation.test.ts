import { describe, expect, it } from 'vitest';
import {
  durationParts,
  measureLabel,
  sameMeasures,
  sanctionLength,
  sanctionMeasureLabel,
  toMinutes,
} from './moderation';

describe('duração', () => {
  it('usa a maior unidade exata', () => {
    expect(durationParts(7 * 24 * 60)).toEqual({ unit: 'day', value: 7 });
    expect(durationParts(90)).toEqual({ unit: 'minute', value: 90 });
    expect(durationParts(120)).toEqual({ unit: 'hour', value: 2 });
    expect(durationParts(null)).toEqual({ unit: 'permanent', value: 0 });
  });

  it('converte de volta para minutos', () => {
    expect(toMinutes(2, 'hour')).toBe(120);
    expect(toMinutes(3, 'day')).toBe(4320);
  });
});

describe('a medida em uma frase', () => {
  it('tipo que dura leva a duração; kick e aviso não', () => {
    expect(measureLabel({ type: 'ban', durationMinutes: 7 * 24 * 60 })).toBe('Ban de 7 dias');
    expect(measureLabel({ type: 'gag', durationMinutes: 60 })).toBe('Gag de 1 h');
    expect(measureLabel({ type: 'mute', durationMinutes: 30 })).toBe('Mute de 30 min');
    expect(measureLabel({ type: 'ban', durationMinutes: null })).toBe('Ban permanente');
    expect(measureLabel({ type: 'kick', durationMinutes: null })).toBe('Kick');
    expect(measureLabel({ type: 'warning', durationMinutes: null })).toBe('Aviso');
    expect(measureLabel({ type: 'ban', durationMinutes: 24 * 60 })).toBe('Ban de 1 dia');
  });
});

describe('o histórico a partir das datas', () => {
  const at = (iso: string) => iso;
  it('arredonda a folga de segundos para a unidade que representa bem', () => {
    const s = (endsAt: string | null) => ({
      type: 'ban' as const,
      startsAt: at('2026-10-01T10:00:00.000Z'),
      endsAt,
    });
    expect(sanctionLength(s('2026-10-08T10:00:10.000Z'))).toEqual({ unit: 'day', value: 7 });
    expect(sanctionLength(s('2026-10-01T12:00:00.000Z'))).toEqual({ unit: 'hour', value: 2 });
    expect(sanctionLength(s(null))).toEqual({ unit: 'permanent', value: 0 });
    expect(sanctionMeasureLabel(s('2026-10-08T10:00:00.000Z'))).toBe('Ban de 7 dias');
    expect(
      sanctionMeasureLabel({
        type: 'warning',
        startsAt: at('2026-10-01T10:00:00.000Z'),
        endsAt: null,
      }),
    ).toBe('Aviso');
  });
});

describe('as medidas escolhidas contra a sugestão', () => {
  const a = { type: 'gag' as const, durationMinutes: 60 };
  const b = { type: 'ban' as const, durationMinutes: 1440 };
  it('em qualquer ordem, e só se forem as mesmas', () => {
    expect(sameMeasures([a, b], [b, a])).toBe(true);
    expect(sameMeasures([a], [a, b])).toBe(false);
    expect(sameMeasures([a, b], [a, { ...b, durationMinutes: 2880 }])).toBe(false);
    expect(sameMeasures([{ ...b, durationMinutes: null }], [{ ...b, durationMinutes: null }])).toBe(
      true,
    );
  });
});
