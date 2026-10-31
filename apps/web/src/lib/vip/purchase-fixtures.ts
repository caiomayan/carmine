import type { Purchase } from '@carmine/contracts/payments';
import type { ConfirmAccount, ConfirmBlock } from '@/components/vip/confirm-view';

/**
 * Compras e confirmações de exemplo, no formato do contrato, para as vitrines `/dev/vip/comprar` e
 * `/dev/vip/compra` (só com CARMINE_UI_GALLERY=1) e para os testes. O QR é um desenho de exemplo (não lê).
 */

const SAMPLE_QR =
  'iVBORw0KGgoAAAANSUhEUgAAAOgAAADoCAIAAABqyz8vAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAEOElEQVR42u3dwZEDIQwEQPJPWheDq5ZDI7UCwF7o9QPh4ZyQqh+r2zhffe7t+TwKXHAVuOCCCy644IKrwAUXXHDBBRfcsVBuL1i38W+D2PaifvYigQsuuOCCCy644IILLrjgggsuuOCCCy64n21Q3waRsuF/+3t2eyGvjw8uuOCCCy644IILLrjgggsuuOCCCy644K6Dm9JYeTWf4IILLrjgggsuuOCCCy644IILLrjgggsuuP/VUHjVsKhmBS644IILLrjgggsuuOCCCy644IILLrjg5sOdumGeEgiSMj+SbMAFF1xwwQUXXHDBBRdccMEFF1xwwQW33X1v54Rc0HdCApZfNVyOAhdcBS644IILLrjgKnDBBRdccMEFNx5Eem3bYB+7juCCCy644IILLrjgggsuuOCCCy644IIL7tiDwDW0Y9Qt4OP6uoALLrjgggsuuOCCCy644IILLrjgggsuuO0udpt6UV564Paz+QQXXHDBBRdccMEFF1xwwQUXXHDBBRdccGtb0km3YI70g+ftOmfgggsuuOCCCy644IILLrjgggsuuOCCuwhuSkOhWyPDgfelvzTgggsuuOCCCy644IILLrjgggsuuOCCG3zxXcpB9VffP/2CvqplB8nBBRdccMEFF1xwwQUXXHDBBRdccMEF90FORYUHO3cDVEMDR9o1dMAFF1xwwQUXXHDBBRdccMEFF1xwwQV3EdyUjehusKYGjqQ3RMAFF1xwwQUXXHDBBRdccMEFF1xwwQUX3Hcb2mODi0PyNFIaK+CCCy644IILLrjgggsuuOCCCy644IIL7rugjQoJZJ7aiBkbTA0uuOCCCy644IILLrjgggsuuOCCCy64wXkI2w6kn/Ag6LPs4kdwwQUXXHDBBRdccMEFF1xwwQUXXHDBnQg3ZcM55eBzSiMj/o8C4IILLrjgggsuuOCCCy644IILLrjgggtuDIiUhUxpNKT8kIELLrjgggsuuOCCCy644IILLrjgggsuuP2CHrY1GrpBjGlAgAsuuOCCCy644IILLrjgggsuuOCCC+4iuKpnYHL6Pv1n84wauOAqcMEFF1xwwQVXgQsuuOCCC+4iuGfoRX/pgc9nWTAKuOCCCy644IILLrjgggsuuOCCCy644IKbc06320Z6CtyUcdol3IALLrjgggsuuOCCCy644IILLrjgggvuQLhnWS6v5+0ZLAIuuOCCCy644IILLrjgWkhwwQUXXHDBBTcH7u2Jm3pwO6UxUbeTysEFF1xwwQUXXHDBBRdccMEFF1xwwQUX3LGBw93GP+GBIw6SgwsuuOCCCy644IILLrjgggsuuOCCC+7cQJBusKrZRXwpDY7aFuwMLrjgggsuuOCCCy644IILLrjgggsuuIsu6EtvHFRIUMi25wUXXHDBBRdccMEFF1xwwQUXXHDBBRfcRs/7B+AT2itXLAF0AAAAAElFTkSuQmCC';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const PURCHASE_STATES = [
  'pix',
  'pix-sem-qr',
  'pix-vencido',
  'cartao',
  'cartao-volta',
  'processando',
  'em-analise',
  'aprovada',
  'recusada',
  'expirada',
  'cancelada',
  'reembolsada',
  'parcial',
  'contestada',
] as const;

export type PurchaseState = (typeof PURCHASE_STATES)[number];

export const PURCHASE_STATE_LABEL: Record<PurchaseState, string> = {
  pix: 'Pix para pagar',
  'pix-sem-qr': 'Pix sem QR',
  'pix-vencido': 'Pix vencido',
  cartao: 'Cartão: continuar',
  'cartao-volta': 'Voltou do cartão',
  processando: 'Processando',
  'em-analise': 'Em análise',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  cancelada: 'Cancelada',
  reembolsada: 'Reembolsada',
  parcial: 'Reembolso parcial',
  contestada: 'Contestada',
};

export function isPurchaseState(value: string | undefined): value is PurchaseState {
  return value !== undefined && (PURCHASE_STATES as readonly string[]).includes(value);
}

const iso = (ms: number) => new Date(ms).toISOString();

export function purchaseFixture(
  state: PurchaseState,
  now = Date.now(),
): { purchase: Purchase; returnedFromCard: boolean } {
  const base: Purchase = {
    id: '3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10',
    status: 'pending',
    package: 'vip-3m',
    days: 90,
    amountCents: 2690,
    method: 'pix',
    createdAt: iso(now - 3 * MINUTE),
    expiresAt: iso(now + 27 * MINUTE),
    approvedAt: null,
    refundedCents: 0,
    pix: {
      copyPaste:
        '00020126580014br.gov.bcb.pix0136carmine-exemplo-0000-0000-0000-000000005204000053039865406526905802BR5909CARMINE6009SAO PAULO62070503***6304ABCD',
      qrCodeBase64: SAMPLE_QR,
    },
    redirectUrl: null,
    simulationUrl: 'http://localhost:3000/dev/pagamento/exemplo-000000',
    payerDocumentMasked: null,
    payerName: null,
    periodEndsAt: null,
    refundableUntil: null,
  };
  const approved: Purchase = {
    ...base,
    status: 'approved',
    approvedAt: iso(now - MINUTE),
    expiresAt: null,
    pix: null,
    payerDocumentMasked: '***.***.**1-23',
    payerName: 'Maria Souza',
    periodEndsAt: iso(now + 90 * DAY),
    refundableUntil: iso(now + 7 * DAY),
  };
  const card: Purchase = {
    ...base,
    method: 'card',
    pix: null,
    redirectUrl: 'http://localhost:3000/dev/pagamento/exemplo-000000',
  };
  const closed = (status: Purchase['status']): Purchase => ({
    ...base,
    status,
    pix: null,
    expiresAt: null,
  });

  switch (state) {
    case 'pix':
      return { purchase: base, returnedFromCard: false };
    case 'pix-sem-qr':
      return {
        purchase: { ...base, pix: base.pix && { ...base.pix, qrCodeBase64: null } },
        returnedFromCard: false,
      };
    case 'pix-vencido':
      return { purchase: { ...base, expiresAt: iso(now - 20 * 1000) }, returnedFromCard: false };
    case 'cartao':
      return { purchase: card, returnedFromCard: false };
    case 'cartao-volta':
      return { purchase: card, returnedFromCard: true };
    case 'processando':
      return {
        purchase: { ...card, createdAt: iso(now - 12 * MINUTE) },
        returnedFromCard: true,
      };
    case 'em-analise':
      return { purchase: { ...card, status: 'in_review' }, returnedFromCard: true };
    case 'aprovada':
      return { purchase: approved, returnedFromCard: false };
    case 'recusada':
      return { purchase: closed('rejected'), returnedFromCard: true };
    case 'expirada':
      return { purchase: closed('expired'), returnedFromCard: false };
    case 'cancelada':
      return { purchase: closed('cancelled'), returnedFromCard: false };
    case 'reembolsada':
      return {
        purchase: {
          ...approved,
          status: 'refunded',
          refundedCents: 2690,
          periodEndsAt: null,
          refundableUntil: null,
        },
        returnedFromCard: false,
      };
    case 'parcial':
      return {
        purchase: {
          ...approved,
          status: 'partially_refunded',
          refundedCents: 1000,
          refundableUntil: null,
        },
        returnedFromCard: false,
      };
    case 'contestada':
      return {
        purchase: {
          ...approved,
          status: 'charged_back',
          periodEndsAt: null,
          refundableUntil: null,
        },
        returnedFromCard: false,
      };
  }
}

export const CONFIRM_STATES = [
  'padrao',
  'vip-ativo',
  'horizonte',
  'banido',
  'bloqueado',
  'em-analise',
  'limite',
] as const;

export type ConfirmState = (typeof CONFIRM_STATES)[number];

export const CONFIRM_STATE_LABEL: Record<ConfirmState, string> = {
  padrao: 'Sem VIP',
  'vip-ativo': 'Soma ao VIP ativo',
  horizonte: 'Passa do limite',
  banido: 'Ban permanente',
  bloqueado: 'Compras bloqueadas',
  'em-analise': 'Pagamento em análise',
  limite: 'Limite do dia',
};

export function isConfirmState(value: string | undefined): value is ConfirmState {
  return value !== undefined && (CONFIRM_STATES as readonly string[]).includes(value);
}

export const FIXTURE_ACCOUNT: ConfirmAccount = {
  displayName: 'F00L1SH_N1NJ4',
  avatarUrl: null,
  publicId: 1042,
};

export function confirmFixture(
  state: ConfirmState,
  now = Date.now(),
): { vipEndsAt: string | null; block: ConfirmBlock | null } {
  switch (state) {
    case 'padrao':
      return { vipEndsAt: null, block: null };
    case 'vip-ativo':
      return { vipEndsAt: iso(now + 41 * DAY), block: null };
    case 'horizonte':
      return { vipEndsAt: iso(now + 700 * DAY), block: null };
    case 'banido':
      return { vipEndsAt: null, block: 'banned' };
    case 'bloqueado':
      return { vipEndsAt: null, block: 'purchases_blocked' };
    case 'em-analise':
      return { vipEndsAt: null, block: 'purchase_in_progress' };
    case 'limite':
      return { vipEndsAt: null, block: 'daily_limit' };
  }
}
