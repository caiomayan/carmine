import type { PaymentStatus, Purchase } from '@carmine/contracts/payments';
import { PURCHASE_PROCESSING_MINUTES } from '@carmine/contracts/payments';

/**
 * "Minhas compras" e o recibo (S14b): as regras de tela das compras, puras e de servidor (os
 * componentes de cliente recebem o que precisam já pronto, sem importar o contrato por valor).
 */

const MINUTE_MS = 60_000;
const BRT = 'America/Sao_Paulo';

/** O pontinho de estado de cada situação (as cores de contexto do site; a palavra vem sempre escrita ao lado). */
export type PurchaseTone = 'online' | 'warn' | 'danger' | 'offline';

const TONES: Record<PaymentStatus, PurchaseTone> = {
  created: 'warn',
  pending: 'warn',
  in_review: 'warn',
  approved: 'online',
  rejected: 'danger',
  charged_back: 'danger',
  expired: 'offline',
  cancelled: 'offline',
  refunded: 'offline',
  partially_refunded: 'offline',
};

export const statusTone = (status: PaymentStatus): PurchaseTone => TONES[status];

/** Esperando o pagamento (ou a análise do cartão): a tela atualiza sozinha e mostra o que falta. */
export const isOpen = (status: PaymentStatus): boolean =>
  status === 'created' || status === 'pending' || status === 'in_review';

/** O recibo existe depois de o pagamento ter sido aprovado (mesmo que depois tenha sido devolvido ou contestado). */
export const hasReceipt = (purchase: Pick<Purchase, 'status' | 'approvedAt'>): boolean =>
  purchase.approvedAt !== null &&
  ['approved', 'refunded', 'partially_refunded', 'charged_back'].includes(purchase.status);

/** O identificador curto da tela (o inteiro vai no "copiar" e no suporte). */
export const shortId = (id: string): string => id.slice(0, 8);

/** Quantos meses de Pacote: um "mês" são 30 dias. */
export const monthsOf = (purchase: Pick<Purchase, 'days'>): number =>
  Math.max(1, Math.round(purchase.days / 30));

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** `R$ 9,90`, com o espaço sem quebra de linha que o `Intl` já põe entre o símbolo e o valor. */
export const formatBrl = (cents: number): string => brl.format(cents / 100);

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: BRT,
});
const DATE = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: BRT,
});

/** "26 de out. de 2026 às 14:30" (horário de Brasília). */
export const formatDateTime = (iso: string): string =>
  DATE_TIME.format(new Date(iso)).replace(',', '');

/** "26 de outubro de 2026". */
export const formatDate = (iso: string): string => DATE.format(new Date(iso));

/**
 * Passou o prazo de "processando" sem a compra mudar: a tela mostra o suporte com o identificador.
 * A API só diz o estado e a data; o prazo é regra de tela (`PURCHASE_PROCESSING_MINUTES`).
 */
export function supportDue(purchase: Pick<Purchase, 'status' | 'createdAt'>, now: Date): boolean {
  return (
    isOpen(purchase.status) &&
    now.getTime() - new Date(purchase.createdAt).getTime() >=
      PURCHASE_PROCESSING_MINUTES * MINUTE_MS
  );
}

/** Quanto falta para o QR (ou o checkout) vencer; `null` se não há prazo, 0 se já passou. */
export function msUntilExpiry(purchase: Pick<Purchase, 'expiresAt'>, now: Date): number | null {
  if (purchase.expiresAt === null) return null;
  return Math.max(0, new Date(purchase.expiresAt).getTime() - now.getTime());
}

/** O Pix pendente ainda pode ser pago: tem código e o prazo não passou. */
export function pixIsLive(purchase: Pick<Purchase, 'status' | 'pix' | 'expiresAt'>, now: Date) {
  return (
    purchase.status === 'pending' && purchase.pix !== null && msUntilExpiry(purchase, now) !== 0
  );
}

/** O reembolso pelo site ainda vale: aprovada e dentro do prazo que a API calculou. */
export function canRefund(purchase: Pick<Purchase, 'status' | 'refundableUntil'>, now: Date) {
  return (
    purchase.status === 'approved' &&
    purchase.refundableUntil !== null &&
    new Date(purchase.refundableUntil).getTime() > now.getTime()
  );
}
