import { FAKE_PAYMENT_ACTIONS, PAYMENT_STATUSES } from '@carmine/contracts/payments';
import { describe, expect, it } from 'vitest';
import {
  ACTION_HINT,
  ACTION_LABEL,
  availableActions,
  backToPurchase,
  PROVIDER_ID,
  STATUS_LABEL,
} from './simulation';

describe('availableActions', () => {
  it('esperando o pagamento: pagar, recusar ou expirar', () => {
    expect(availableActions('pending')).toEqual(['pay', 'reject', 'expire']);
    expect(availableActions('created')).toEqual(['pay', 'reject', 'expire']);
  });

  it('depois de aprovada: reembolsar ou contestar', () => {
    expect(availableActions('approved')).toEqual(['refund', 'chargeback']);
    expect(availableActions('partially_refunded')).toEqual(['refund', 'chargeback']);
  });

  it('nos demais status, nada a fazer', () => {
    for (const status of [
      'rejected',
      'expired',
      'cancelled',
      'refunded',
      'charged_back',
      'in_review',
    ] as const) {
      expect(availableActions(status)).toEqual([]);
    }
  });

  it('só oferece ações que o contrato conhece', () => {
    for (const status of PAYMENT_STATUSES) {
      for (const action of availableActions(status)) expect(FAKE_PAYMENT_ACTIONS).toContain(action);
    }
  });
});

describe('rótulos', () => {
  it('toda ação e todo status do contrato tem texto', () => {
    for (const action of FAKE_PAYMENT_ACTIONS) {
      expect(ACTION_LABEL[action]).toBeTruthy();
      expect(ACTION_HINT[action]).toBeTruthy();
    }
    for (const status of PAYMENT_STATUSES) expect(STATUS_LABEL[status]).toBeTruthy();
  });
});

describe('backToPurchase', () => {
  const id = '3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10';
  it('o Pix volta à compra; o cartão volta com o retorno do checkout', () => {
    expect(backToPurchase(id, 'pix')).toBe(`/vip/compra/${id}`);
    expect(backToPurchase(id, 'card')).toBe(`/vip/compra/${id}?retorno=cartao`);
  });
});

describe('PROVIDER_ID', () => {
  it('aceita ids simples e recusa o que mudaria o caminho da API', () => {
    expect(PROVIDER_ID.test('fake_9f3c-12')).toBe(true);
    for (const bad of ['', '../x', 'a/b', 'a b', 'a?b', 'x'.repeat(81)]) {
      expect(PROVIDER_ID.test(bad)).toBe(false);
    }
  });
});
