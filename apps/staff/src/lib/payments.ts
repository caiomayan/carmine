import type { PaymentMethod, PaymentStatus } from '@carmine/contracts/payments';

/** As regras de tela dos Pagamentos do painel (S25): rótulos, tom do estado e formatação. Puras, sem rede. */

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  created: 'Preparando',
  pending: 'Aguardando',
  in_review: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Recusado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  partially_refunded: 'Reembolso parcial',
  charged_back: 'Contestado',
};

/** O nome de cada aba do filtro (o plural dos estados). */
export const TAB_LABEL: Record<PaymentStatus | 'all', string> = {
  all: 'Todos',
  created: 'Preparando',
  pending: 'Pendentes',
  in_review: 'Em análise',
  approved: 'Aprovados',
  rejected: 'Recusados',
  expired: 'Expirados',
  cancelled: 'Cancelados',
  refunded: 'Reembolsados',
  partially_refunded: 'Reembolso parcial',
  charged_back: 'Contestados',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = { pix: 'Pix', card: 'Cartão' };

export type Tone = 'ok' | 'warn' | 'danger' | 'none';

/** O ponto de cada estado: cor só de contexto, e a palavra vem sempre escrita ao lado. */
export const statusTone = (status: PaymentStatus): Tone => {
  switch (status) {
    case 'approved':
      return 'ok';
    case 'created':
    case 'pending':
    case 'in_review':
      return 'warn';
    case 'rejected':
    case 'charged_back':
      return 'danger';
    default:
      return 'none';
  }
};

/** O que o webhook disse que a API fez; um desfecho novo aparece como veio. */
export const OUTCOME_LABEL: Record<string, string> = {
  applied: 'Aplicado',
  unchanged: 'Sem mudança',
  ignored: 'Ignorado',
  invalid_signature: 'Assinatura recusada',
  mismatch: 'Valor diferente',
  error: 'Erro nosso',
};

/** Só os desfechos que pedem atenção ganham ponto colorido. */
export const outcomeTone = (outcome: string): Tone =>
  outcome === 'applied'
    ? 'ok'
    : outcome === 'invalid_signature' || outcome === 'mismatch' || outcome === 'error'
      ? 'danger'
      : 'none';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** `R$ 9,90`. */
export const formatBrl = (cents: number): string => brl.format(cents / 100);

/** O identificador curto da tela; o inteiro vai no detalhe, para copiar e para o suporte. */
export const shortId = (id: string): string => id.slice(0, 8);

/** Um mês de Pacote são 30 dias. */
export const monthsOf = (days: number): number => Math.max(1, Math.round(days / 30));

export const packageLabel = (days: number): string => {
  const months = monthsOf(days);
  return `${months} ${months === 1 ? 'mês' : 'meses'}`;
};

const LONG = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "28/10/2026 19:19" no horário de Brasília (o mesmo no servidor e no navegador). */
export const stampLong = (iso: string): string => LONG.format(new Date(iso)).replace(',', '');

/** `queda-2026-10-27`: a chave sugerida para a compensação de hoje (data de Brasília). */
export const suggestedCompensationKey = (now: Date): string =>
  `queda-${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)}`;

/**
 * Quanto a confirmação do reembolso anuncia: valor × dias ÷ dias do Pacote, nunca acima do que resta. É só o aviso antes
 * de confirmar; o valor que vale é o que a API calcula.
 */
export const refundPreviewCents = (
  amountCents: number,
  packageDays: number,
  days: number,
  remainingCents: number,
): number => Math.min(remainingCents, Math.floor((amountCents * days) / packageDays));
