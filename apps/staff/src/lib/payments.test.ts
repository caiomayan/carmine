import { PAYMENT_STATUSES } from '@carmine/contracts/payments';
import { describe, expect, it } from 'vitest';
import {
  formatBrl,
  monthsOf,
  packageLabel,
  refundPreviewCents,
  STATUS_LABEL,
  shortId,
  stampLong,
  statusTone,
  suggestedCompensationKey,
  TAB_LABEL,
} from './payments';

describe('Pagamentos do painel', () => {
  it('todo estado do contrato tem rótulo, aba e tom', () => {
    for (const status of PAYMENT_STATUSES) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(TAB_LABEL[status]).toBeTruthy();
      expect(['ok', 'warn', 'danger', 'none']).toContain(statusTone(status));
    }
  });

  it('só o aprovado é verde e só recusa e contestação são vermelhas', () => {
    expect(statusTone('approved')).toBe('ok');
    expect(statusTone('charged_back')).toBe('danger');
    expect(statusTone('rejected')).toBe('danger');
    expect(statusTone('pending')).toBe('warn');
    expect(statusTone('refunded')).toBe('none');
  });

  it('formata reais em pt-BR e o Pacote em meses de 30 dias', () => {
    expect(formatBrl(990).replace(/\s/g, ' ')).toBe('R$ 9,90');
    expect(monthsOf(30)).toBe(1);
    expect(monthsOf(90)).toBe(3);
    expect(packageLabel(30)).toBe('1 mês');
    expect(packageLabel(180)).toBe('6 meses');
  });

  it('o identificador curto são os 8 primeiros caracteres', () => {
    expect(shortId('0a1b2c3d-1111-2222-3333-444455556666')).toBe('0a1b2c3d');
  });

  it('a data é de Brasília, com o ano', () => {
    expect(stampLong('2026-10-28T22:19:00Z')).toBe('28/10/2026 19:19');
  });

  it('a chave da compensação usa o dia de Brasília, não o UTC', () => {
    expect(suggestedCompensationKey(new Date('2026-10-28T01:30:00Z'))).toBe('queda-2026-10-27');
  });

  it('o aviso do reembolso parcial é proporcional aos dias e não passa do que resta', () => {
    expect(refundPreviewCents(2970, 90, 30, 2970)).toBe(990);
    expect(refundPreviewCents(2970, 90, 90, 1000)).toBe(1000);
  });
});
