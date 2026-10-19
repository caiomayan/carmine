import {
  formatRetryAfter,
  REPORT_HOURLY_LIMIT,
  REPORT_SAME_TARGET_COOLDOWN_MINUTES,
  type ReportRefusal,
} from '@carmine/contracts';

/** Uma Denúncia que o denunciante já fez (só o que os limites precisam). */
export interface PastReport {
  targetAccountId: string;
  createdAt: Date;
}

export type LimitVerdict =
  | { allowed: true }
  | {
      allowed: false;
      refusal: 'same_target_cooldown' | 'hourly_limit';
      retryAfterSeconds: number;
    };

const COOLDOWN_MS = REPORT_SAME_TARGET_COOLDOWN_MINUTES * 60_000;
const HOUR_MS = 60 * 60_000;

/**
 * Os limites da Denúncia (S13): 1 por alvo a cada 10 minutos e 5 por hora, por denunciante.
 * `past` são as Denúncias do denunciante na última hora (as mais antigas são ignoradas). Quando
 * dois limites valem, a recusa é a do prazo mais longo, para a mensagem nunca prometer um horário
 * em que a próxima tentativa ainda seria recusada.
 */
export function checkReportLimits(
  past: readonly PastReport[],
  targetAccountId: string,
  now: Date,
): LimitVerdict {
  const refusals: { refusal: 'same_target_cooldown' | 'hourly_limit'; waitMs: number }[] = [];

  const lastAtTarget = Math.max(
    ...past.filter((r) => r.targetAccountId === targetAccountId).map((r) => r.createdAt.getTime()),
  );
  if (Number.isFinite(lastAtTarget) && lastAtTarget + COOLDOWN_MS > now.getTime()) {
    refusals.push({
      refusal: 'same_target_cooldown',
      waitMs: lastAtTarget + COOLDOWN_MS - now.getTime(),
    });
  }

  const inLastHour = past
    .map((r) => r.createdAt.getTime())
    .filter((at) => at + HOUR_MS > now.getTime())
    .sort((a, b) => a - b);
  if (inLastHour.length >= REPORT_HOURLY_LIMIT) {
    // Volta a caber quando a (n - 4)ª mais antiga sair da janela.
    const blocking = inLastHour[inLastHour.length - REPORT_HOURLY_LIMIT] as number;
    refusals.push({ refusal: 'hourly_limit', waitMs: blocking + HOUR_MS - now.getTime() });
  }

  const longest = refusals.sort((a, b) => b.waitMs - a.waitMs)[0];
  if (!longest) return { allowed: true };
  return {
    allowed: false,
    refusal: longest.refusal,
    retryAfterSeconds: Math.ceil(longest.waitMs / 1000),
  };
}

/** O texto que o jogador lê no jogo quando a Denúncia é recusada. */
export function refusalMessage(refusal: ReportRefusal, retryAfterSeconds: number | null): string {
  const when =
    retryAfterSeconds === null ? '' : ` Tente de novo em ${formatRetryAfter(retryAfterSeconds)}.`;
  switch (refusal) {
    case 'self':
      return 'Você não pode denunciar a si mesmo.';
    case 'unknown_account':
      return 'Não foi possível identificar o jogador. Tente de novo em instantes.';
    case 'same_target_cooldown':
      return `Você já denunciou este jogador há pouco.${when}`;
    case 'hourly_limit':
      return `Você chegou ao limite de ${REPORT_HOURLY_LIMIT} denúncias por hora.${when}`;
  }
}
