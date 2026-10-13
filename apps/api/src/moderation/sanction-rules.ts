import {
  isLastingSanction,
  PROFILE_SANCTION_HISTORY_MONTHS,
  type ProfileSanctions,
  type PublicSanction,
  type PublicSanctionCategory,
  RECIDIVISM_WINDOW_DAYS,
  SANCTION_CATEGORY_LABELS,
  type SanctionCategory,
  type SanctionType,
  sanctionCategorySchema,
} from '@carmine/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** O que as regras precisam de uma Punição (`Sanction`). */
export interface SanctionRecord {
  id: string;
  incidentId: string;
  type: SanctionType;
  category: SanctionCategory;
  startsAt: Date;
  /** Nulo: permanente (ban/mute/gag) ou instantânea (kick/aviso). */
  endsAt: Date | null;
  revokedAt: Date | null;
  appealAccepted: boolean;
  /** Link da evidência anexada; sem ele, cheat aparece no Perfil como "Violação das regras". */
  evidenceUrl: string | null;
}

/** Ban, mute ou gag valendo em `now`: não revogada, já começou e não venceu. */
export function isActiveAt(sanction: SanctionRecord, now: Date): boolean {
  return (
    isLastingSanction(sanction.type) &&
    sanction.revokedAt === null &&
    sanction.startsAt <= now &&
    (sanction.endsAt === null || sanction.endsAt > now)
  );
}

/**
 * Ocorrências anteriores de cada Categoria na janela de reincidência (30 dias até `now`): conta
 * incidentes (as medidas aplicadas juntas são uma ocorrência só). Recurso aceito não conta;
 * revogada sem recurso conta (a infração aconteceu).
 */
export function previousOffensesAt(
  sanctions: readonly SanctionRecord[],
  now: Date,
): Record<SanctionCategory, number> {
  const since = now.getTime() - RECIDIVISM_WINDOW_DAYS * DAY_MS;
  const incidents = new Map<SanctionCategory, Set<string>>();
  for (const sanction of sanctions) {
    if (sanction.appealAccepted || sanction.startsAt.getTime() < since || sanction.startsAt > now) {
      continue;
    }
    const set = incidents.get(sanction.category) ?? new Set();
    set.add(sanction.incidentId);
    incidents.set(sanction.category, set);
  }
  return Object.fromEntries(
    sanctionCategorySchema.options.map((category) => [
      category,
      incidents.get(category)?.size ?? 0,
    ]),
  ) as Record<SanctionCategory, number>;
}

/**
 * Punições no Perfil público em `now`: as ativas (para o selo) e o histórico dos últimos 12
 * meses sem avisos, mais o ban permanente por cheat de qualquer época. Recurso aceito some.
 * Nunca leva o motivo livre. O histórico é só para quem está logado no site (`withHistory`); o
 * visitante vê só o selo das ativas. Cheat sem evidência anexada sai como "Violação das regras".
 */
export function toProfileSanctions(
  sanctions: readonly SanctionRecord[],
  now: Date,
  { withHistory }: { withHistory: boolean },
): ProfileSanctions {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - PROFILE_SANCTION_HISTORY_MONTHS);
  const visible = sanctions
    .filter((s) => !s.appealAccepted && s.type !== 'warning' && s.startsAt <= now)
    .filter((s) => s.startsAt >= since || isPermanentCheatBan(s))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return {
    active: visible.filter((s) => isActiveAt(s, now)).map(toPublic),
    history: withHistory ? visible.map(toPublic) : null,
  };
}

function isPermanentCheatBan(s: SanctionRecord): boolean {
  return s.type === 'ban' && s.category === 'cheat' && s.endsAt === null && s.revokedAt === null;
}

function toPublic(s: SanctionRecord): PublicSanction {
  const revoked = s.revokedAt !== null;
  const endsAt =
    revoked &&
    s.revokedAt &&
    (s.endsAt === null || s.revokedAt < s.endsAt) &&
    isLastingSanction(s.type)
      ? s.revokedAt
      : s.endsAt;
  return {
    id: s.id,
    type: s.type,
    category: publicCategory(s),
    startsAt: s.startsAt.toISOString(),
    endsAt: endsAt?.toISOString() ?? null,
    revoked,
  };
}

/** Só com evidência anexada o Perfil público afirma "Cheat" (decisão do dono, 2026-10-13). */
function publicCategory(s: SanctionRecord): PublicSanctionCategory {
  return s.category === 'cheat' && s.evidenceUrl === null ? 'rule_violation' : s.category;
}

const brasilia = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "20/10 às 14:00" no horário de Brasília. */
function untilText(date: Date): string {
  const parts = Object.fromEntries(brasilia.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

const LASTING_TEXT = {
  ban: { what: 'banido', where: ' dos Servidores Carmine' },
  mute: { what: 'sem voz', where: '' },
  gag: { what: 'sem chat', where: '' },
} as const;

/**
 * O texto que o jogador vê no jogo: a Categoria (nunca o motivo livre), a duração em horário de
 * Brasília e onde recorrer (`appeal`, ex.: `stcarmine.com/regras#recurso`).
 */
export function gameSanctionMessage(
  sanction: { type: SanctionType; category: SanctionCategory; endsAt: Date | null },
  appeal: string,
): string {
  const label = SANCTION_CATEGORY_LABELS[sanction.category];
  switch (sanction.type) {
    case 'kick':
      return `Você foi expulso do servidor pela Staff. Motivo: ${label}. Regras: ${appeal}`;
    case 'warning':
      return `Aviso da Staff: ${label}. Reincidir leva a punições maiores. Regras: ${appeal}`;
    default: {
      const { what, where } = LASTING_TEXT[sanction.type];
      const duration =
        sanction.endsAt === null
          ? `permanentemente${where}`
          : `${where} até ${untilText(sanction.endsAt)} (Brasília)`;
      const sentence =
        sanction.endsAt === null ? `Você está ${what} ${duration}` : `Você está ${what}${duration}`;
      return `${sentence}. Motivo: ${label}. Para recorrer: ${appeal}`;
    }
  }
}
