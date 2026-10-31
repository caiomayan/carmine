import type { SanctionMeasure, SanctionType, StaffSanction } from '@carmine/contracts';
import { isLastingSanction } from '@carmine/contracts/rules';

/** As Punições no painel: nomes, medidas e durações. Os textos são os do site (`moderation.*`), os mesmos do Perfil. */

export const SANCTION_TYPE_LABEL: Record<SanctionType, string> = {
  ban: 'Ban',
  mute: 'Mute',
  gag: 'Gag',
  kick: 'Kick',
  warning: 'Aviso',
};

/** O que cada tipo faz, em uma frase (o seletor de tipo mostra junto). */
export const SANCTION_TYPE_HINT: Record<SanctionType, string> = {
  ban: 'Não entra nos Servidores Carmine',
  mute: 'Sem voz no jogo',
  gag: 'Sem chat no jogo',
  kick: 'Tirado do servidor uma vez',
  warning: 'Só registra e avisa',
};

/** A Categoria como a Staff a vê (o jogador e o Perfil veem o nome genérico, `PUBLIC_CATEGORY_LABEL`). */
export const STAFF_CATEGORY_LABEL: Record<string, string> = {
  offensive_chat: 'Chat ofensivo pessoal',
  offensive_voice: 'Voz ofensiva',
  griefing: 'Griefing, AFK ou TK proposital',
  exploit: 'Abuso de bug ou exploit',
  discrimination: 'Discriminação',
  cheat: 'Cheat',
  threat: 'Ameaça',
  doxxing: 'Doxxing',
  ban_evasion: 'Conta alternativa para fugir de ban',
};

export const PUBLIC_CATEGORY_LABEL: Record<string, string> = {
  offensive_chat: 'Conduta no chat',
  offensive_voice: 'Conduta na voz',
  griefing: 'Griefing',
  exploit: 'Abuso de bug',
  discrimination: 'Discriminação',
  cheat: 'Cheat',
  threat: 'Ameaça',
  doxxing: 'Exposição de dados pessoais',
  ban_evasion: 'Fuga de ban',
  rule_violation: 'Violação das regras',
};

export const categoryLabel = (category: string) => STAFF_CATEGORY_LABEL[category] ?? category;

/** Unidades de duração da Staff. */
export type DurationUnit = 'minute' | 'hour' | 'day';

const MINUTES: Record<DurationUnit, number> = { minute: 1, hour: 60, day: 24 * 60 };

export const UNIT_LABEL: Record<DurationUnit, string> = {
  minute: 'minutos',
  hour: 'horas',
  day: 'dias',
};

/** Duração para exibir: a maior unidade exata (`permanent` sem duração). */
export type DurationParts = { unit: DurationUnit | 'permanent'; value: number };

export function durationParts(minutes: number | null): DurationParts {
  if (minutes === null) return { unit: 'permanent', value: 0 };
  if (minutes % MINUTES.day === 0) return { unit: 'day', value: minutes / MINUTES.day };
  if (minutes % MINUTES.hour === 0) return { unit: 'hour', value: minutes / MINUTES.hour };
  return { unit: 'minute', value: minutes };
}

export const toMinutes = (value: number, unit: DurationUnit): number => value * MINUTES[unit];

const durationText = ({ unit, value }: DurationParts): string => {
  if (unit === 'permanent') return 'permanente';
  if (unit === 'day') return value === 1 ? '1 dia' : `${value} dias`;
  if (unit === 'hour') return `${value} h`;
  return `${value} min`;
};

/** "Ban de 7 dias", "Gag permanente", "Kick": a medida em uma frase. */
export function measureLabel(measure: SanctionMeasure): string {
  const type = SANCTION_TYPE_LABEL[measure.type];
  if (!isLastingSanction(measure.type)) return type;
  const parts = durationParts(measure.durationMinutes);
  return parts.unit === 'permanent' ? `${type} permanente` : `${type} de ${durationText(parts)}`;
}

/** A duração de uma Punição do histórico: kick e aviso são instantâneos. */
export function sanctionLength(
  sanction: Pick<StaffSanction, 'type' | 'startsAt' | 'endsAt'>,
): DurationParts | { unit: 'instant'; value: 0 } {
  if (!isLastingSanction(sanction.type)) return { unit: 'instant', value: 0 };
  if (sanction.endsAt === null) return { unit: 'permanent', value: 0 };
  const minutes = Math.max(
    1,
    Math.round((Date.parse(sanction.endsAt) - Date.parse(sanction.startsAt)) / 60_000),
  );
  // Arredonda para a unidade mais próxima que represente bem (1 h e 10 s de folga = 1 h).
  if (minutes >= MINUTES.day && minutes % MINUTES.day <= 1) {
    return { unit: 'day', value: Math.round(minutes / MINUTES.day) };
  }
  if (minutes >= MINUTES.hour && minutes % MINUTES.hour <= 1) {
    return { unit: 'hour', value: Math.round(minutes / MINUTES.hour) };
  }
  return durationParts(minutes);
}

/** O histórico em uma frase: "Ban de 7 dias" a partir das datas da Punição. */
export function sanctionMeasureLabel(
  sanction: Pick<StaffSanction, 'type' | 'startsAt' | 'endsAt'>,
): string {
  const length = sanctionLength(sanction);
  const type = SANCTION_TYPE_LABEL[sanction.type];
  if (length.unit === 'instant') return type;
  if (length.unit === 'permanent') return `${type} permanente`;
  return `${type} de ${durationText(length)}`;
}

const measureKey = (m: SanctionMeasure) => `${m.type}:${m.durationMinutes ?? 'perm'}`;

/** As medidas escolhidas são as da sugestão da tabela (em qualquer ordem)? */
export function sameMeasures(a: SanctionMeasure[], b: SanctionMeasure[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(measureKey));
  return b.every((m) => keys.has(measureKey(m)));
}
