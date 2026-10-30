import {
  type PaymentStatus,
  PURCHASE_ERROR_CODES,
  PURCHASE_PROCESSING_MINUTES,
  type PurchaseError,
  VIP_MAX_HORIZON_DAYS,
} from '@carmine/contracts/payments';
import { PLAN_PACKAGES, type PlanPackageItem } from '@carmine/contracts/plans';

/**
 * A lógica da confirmação e da página da compra, sem React: o Pacote escolhido na URL, o novo fim do VIP, o limite à
 * frente, o relógio do Pix, o que a tela mostra para cada status da compra e a mensagem de cada erro da API. Os
 * limites e os textos legais vêm do contrato (`@carmine/contracts/payments`), nunca escritos aqui.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** O Pacote do `?pacote=` da confirmação; nulo se faltar ou for desconhecido (a página volta ao `/plans`). */
export function packageFromParam(value: string | string[] | undefined): PlanPackageItem | null {
  const id = Array.isArray(value) ? value[0] : value;
  const found = PLAN_PACKAGES.find((pack) => pack.id === id);
  return found ? { ...found } : null;
}

/**
 * O fim do VIP depois da compra: os Pacotes se somam, então os dias entram depois do fim atual (se o VIP está ativo)
 * ou a partir de agora (se acabou ou nunca houve). Mesma conta da API, para a tela mostrar antes de pagar.
 */
export function projectedVipEnd(vipEndsAt: string | null, days: number, now: Date): Date {
  const current = vipEndsAt ? new Date(vipEndsAt) : null;
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * DAY_MS);
}

/** O VIP passaria do limite à frente ({@link VIP_MAX_HORIZON_DAYS})? A API recusa com `vip_horizon`; a tela avisa antes. */
export function exceedsHorizon(projectedEnd: Date, now: Date): boolean {
  return projectedEnd.getTime() - now.getTime() > VIP_MAX_HORIZON_DAYS * DAY_MS;
}

/** Quanto falta (em ms, nunca negativo) para o QR ou o checkout vencer; nulo se a compra não tem prazo. */
export function msUntilExpiry(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  return Math.max(0, new Date(expiresAt).getTime() - now.getTime());
}

/** "29:41": o relógio do Pix. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** O que a página da compra mostra. */
export type PurchaseView =
  /** Pix para pagar (QR e copia e cola) ou checkout do cartão para continuar. */
  | 'waiting'
  /** O pagamento passou do prazo de resposta ({@link PURCHASE_PROCESSING_MINUTES}) sem confirmação: pode fechar a página. */
  | 'processing'
  /** Em análise pelo provedor. */
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'charged_back';

/** Status em que a compra ainda pode mudar sozinha: a página continua perguntando à API. */
export const OPEN_STATUSES: readonly PaymentStatus[] = ['created', 'pending', 'in_review'];

export const isOpen = (status: PaymentStatus) => OPEN_STATUSES.includes(status);

/**
 * Qual tela a compra pede. `pending` vira `processing` quando o cliente voltou do cartão (`returned`) ou a compra já
 * passou do tempo esperado de resposta e o Pix/cartão ainda não confirmou; assim a pessoa sabe que não precisa ficar.
 */
export function purchaseView(
  purchase: { status: PaymentStatus; createdAt: string },
  returnedFromCard: boolean,
  now: Date,
): PurchaseView {
  switch (purchase.status) {
    case 'created':
    case 'pending': {
      const age = now.getTime() - new Date(purchase.createdAt).getTime();
      return returnedFromCard && age > PURCHASE_PROCESSING_MINUTES * MINUTE_MS
        ? 'processing'
        : 'waiting';
    }
    case 'in_review':
      return 'in_review';
    default:
      return purchase.status;
  }
}

/** O código de erro da API, ou `unknown` para o que não veio no formato do contrato. */
export type PurchaseErrorCode = PurchaseError['code'] | 'unknown';

export function purchaseErrorCode(body: unknown): PurchaseErrorCode {
  const code =
    typeof body === 'object' && body !== null && 'code' in body
      ? (body as { code: unknown }).code
      : null;
  return (PURCHASE_ERROR_CODES as readonly unknown[]).includes(code)
    ? (code as PurchaseError['code'])
    : 'unknown';
}
