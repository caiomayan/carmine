import type { PublicSanction, SanctionMeasure } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  activeBadges,
  durationParts,
  sameMeasures,
  sanctionLength,
  toMinutes,
  untilKind,
} from './moderation';

const HOUR = 60;
const DAY = 24 * HOUR;

describe('duração de uma Punição', () => {
  it('usa a maior unidade exata', () => {
    expect(durationParts(30)).toEqual({ unit: 'minute', value: 30 });
    expect(durationParts(HOUR)).toEqual({ unit: 'hour', value: 1 });
    expect(durationParts(24 * HOUR)).toEqual({ unit: 'day', value: 1 });
    expect(durationParts(7 * DAY)).toEqual({ unit: 'day', value: 7 });
    expect(durationParts(90)).toEqual({ unit: 'minute', value: 90 });
    expect(durationParts(36 * HOUR)).toEqual({ unit: 'hour', value: 36 });
  });

  it('sem duração é permanente', () => {
    expect(durationParts(null)).toEqual({ unit: 'permanent', value: 0 });
  });

  it('volta para minutos a partir do formulário da Staff', () => {
    expect(toMinutes(2, 'hour')).toBe(120);
    expect(toMinutes(7, 'day')).toBe(7 * DAY);
    expect(toMinutes(15, 'minute')).toBe(15);
  });
});

const sanction = (over: Partial<PublicSanction> = {}): PublicSanction => ({
  id: '00000000-0000-4000-8000-000000000001',
  type: 'ban',
  category: 'griefing',
  startsAt: '2026-10-12T15:00:00Z',
  endsAt: '2026-10-13T15:00:00Z',
  revoked: false,
  ...over,
});

describe('selo da Punição ativa no Perfil', () => {
  it('ban vem antes de gag e mute', () => {
    const gag = sanction({ id: '00000000-0000-4000-8000-00000000000a', type: 'gag' });
    const ban = sanction({ id: '00000000-0000-4000-8000-00000000000b', type: 'ban' });
    const mute = sanction({ id: '00000000-0000-4000-8000-00000000000c', type: 'mute' });
    expect(activeBadges([mute, gag, ban]).map((s) => s.type)).toEqual(['ban', 'gag', 'mute']);
  });

  it('um selo por tipo: vale o que acaba por último (permanente ganha)', () => {
    const short = sanction({
      id: '00000000-0000-4000-8000-00000000000a',
      endsAt: '2026-10-13T15:00:00Z',
    });
    const long = sanction({
      id: '00000000-0000-4000-8000-00000000000b',
      endsAt: '2026-10-20T15:00:00Z',
    });
    const forever = sanction({ id: '00000000-0000-4000-8000-00000000000c', endsAt: null });
    expect(activeBadges([short, long]).map((s) => s.id)).toEqual([long.id]);
    expect(activeBadges([long, forever, short]).map((s) => s.id)).toEqual([forever.id]);
  });

  it('kick e aviso nunca viram selo', () => {
    expect(activeBadges([sanction({ type: 'kick', endsAt: null })])).toEqual([]);
    expect(activeBadges([sanction({ type: 'warning', endsAt: null })])).toEqual([]);
  });

  it('acaba hoje (em Brasília): mostra a hora; senão, a data', () => {
    const now = new Date('2026-10-12T13:00:00-03:00');
    expect(untilKind(null, now)).toBe('permanent');
    expect(untilKind('2026-10-12T14:00:00-03:00', now)).toBe('time');
    expect(untilKind('2026-10-12T23:59:00-03:00', now)).toBe('time');
    // 01:00 UTC do dia 13 ainda é dia 12 em Brasília.
    expect(untilKind('2026-10-13T01:00:00Z', now)).toBe('time');
    expect(untilKind('2026-10-13T00:30:00-03:00', now)).toBe('date');
    expect(untilKind('2026-10-20T15:00:00-03:00', now)).toBe('date');
  });
});

describe('duração no histórico público', () => {
  it('ban, mute e gag mostram a duração; permanente; kick é instantâneo', () => {
    expect(sanctionLength(sanction())).toEqual({ unit: 'day', value: 1 });
    expect(sanctionLength(sanction({ endsAt: null }))).toEqual({ unit: 'permanent', value: 0 });
    expect(sanctionLength(sanction({ type: 'kick', endsAt: null }))).toEqual({
      unit: 'instant',
      value: 0,
    });
  });

  it('a duração é arredondada para a unidade mais próxima', () => {
    expect(
      sanctionLength(
        sanction({ startsAt: '2026-10-12T15:00:10Z', endsAt: '2026-10-12T16:00:00Z' }),
      ),
    ).toEqual({ unit: 'hour', value: 1 });
  });
});

describe('sugestão da tabela no painel da Staff', () => {
  const m = (type: SanctionMeasure['type'], durationMinutes: number | null = null) => ({
    type,
    durationMinutes,
  });

  it('é a mesma sugestão em qualquer ordem', () => {
    expect(
      sameMeasures([m('gag', 7 * DAY), m('ban', DAY)], [m('ban', DAY), m('gag', 7 * DAY)]),
    ).toBe(true);
  });

  it('uma duração ou um tipo diferente é ajuste da Staff', () => {
    expect(sameMeasures([m('gag', HOUR)], [m('gag', DAY)])).toBe(false);
    expect(sameMeasures([m('gag', HOUR)], [m('mute', HOUR)])).toBe(false);
    expect(sameMeasures([m('gag', HOUR)], [m('gag', HOUR), m('ban', DAY)])).toBe(false);
  });
});
