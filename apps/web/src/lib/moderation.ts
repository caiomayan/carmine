import {
  isLastingSanction,
  type PublicSanction,
  type SanctionMeasure,
  type SanctionType,
} from '@carmine/contracts';

/** Unidades de duração da Staff e do Perfil. */
export type DurationUnit = 'minute' | 'hour' | 'day';

const MINUTES: Record<DurationUnit, number> = { minute: 1, hour: 60, day: 24 * 60 };

/** Duração para exibir: a maior unidade exata (`permanent` sem duração). */
export type DurationParts = { unit: DurationUnit | 'permanent'; value: number };

export function durationParts(minutes: number | null): DurationParts {
  if (minutes === null) return { unit: 'permanent', value: 0 };
  if (minutes % MINUTES.day === 0) return { unit: 'day', value: minutes / MINUTES.day };
  if (minutes % MINUTES.hour === 0) return { unit: 'hour', value: minutes / MINUTES.hour };
  return { unit: 'minute', value: minutes };
}

export function toMinutes(value: number, unit: DurationUnit): number {
  return value * MINUTES[unit];
}

/** Ordem dos selos: ban é o que mais pesa; depois chat e voz. */
const BADGE_ORDER: SanctionType[] = ['ban', 'gag', 'mute'];

const endsAtMs = (s: Pick<PublicSanction, 'endsAt'>) =>
  s.endsAt === null ? Number.POSITIVE_INFINITY : Date.parse(s.endsAt);

/**
 * Os selos do Perfil: um por tipo que dura (ban, gag, mute), o que acaba por último, do mais
 * pesado para o mais leve.
 */
export function activeBadges<T extends Pick<PublicSanction, 'type' | 'endsAt'>>(active: T[]): T[] {
  return BADGE_ORDER.flatMap((type) => {
    const ofType = active.filter((s) => s.type === type);
    if (ofType.length === 0) return [];
    return [ofType.reduce((a, b) => (endsAtMs(b) > endsAtMs(a) ? b : a))];
  });
}

const BRT_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Como dizer até quando: `time` se acaba hoje em Brasília ("até 14h"), `date` se acaba noutro
 * dia ("até 20/10"), `permanent` sem fim.
 */
export function untilKind(endsAt: string | null, now: Date): 'permanent' | 'time' | 'date' {
  if (endsAt === null) return 'permanent';
  return BRT_DAY.format(new Date(endsAt)) === BRT_DAY.format(now) ? 'time' : 'date';
}

/** Duração de uma Punição do histórico: kick e aviso são instantâneos. */
export function sanctionLength(
  s: Pick<PublicSanction, 'type' | 'startsAt' | 'endsAt'>,
): DurationParts | { unit: 'instant'; value: 0 } {
  if (!isLastingSanction(s.type)) return { unit: 'instant', value: 0 };
  if (s.endsAt === null) return { unit: 'permanent', value: 0 };
  const minutes = Math.max(1, Math.round((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60_000));
  // Arredonda para a unidade mais próxima que represente bem (1 h e 10 s de folga = 1 h).
  if (minutes >= MINUTES.day && minutes % MINUTES.day <= 1) {
    return { unit: 'day', value: Math.round(minutes / MINUTES.day) };
  }
  if (minutes >= MINUTES.hour && minutes % MINUTES.hour <= 1) {
    return { unit: 'hour', value: Math.round(minutes / MINUTES.hour) };
  }
  return durationParts(minutes);
}

const measureKey = (m: SanctionMeasure) => `${m.type}:${m.durationMinutes ?? 'perm'}`;

/** As medidas escolhidas são as da sugestão da tabela (em qualquer ordem)? */
export function sameMeasures(a: SanctionMeasure[], b: SanctionMeasure[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(measureKey));
  return b.every((m) => keys.has(measureKey(m)));
}
