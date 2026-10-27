import { PAYMENT_STATUSES, type Purchase } from '@carmine/contracts/payments';
import { describe, expect, it } from 'vitest';
import {
  canRefund,
  formatBrl,
  formatDate,
  formatDateTime,
  hasReceipt,
  isOpen,
  monthsOf,
  msUntilExpiry,
  pixIsLive,
  shortId,
  statusTone,
  supportDue,
} from './purchases';

const NOW = new Date('2026-10-27T15:00:00.000Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();
const minutesAhead = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString();

describe('estados', () => {
  it('todo estado do contrato tem um tom, e só os em aberto atualizam sozinhos', () => {
    for (const status of PAYMENT_STATUSES) expect(statusTone(status)).toBeTruthy();
    expect(PAYMENT_STATUSES.filter(isOpen)).toEqual(['created', 'pending', 'in_review']);
  });

  it('aprovado é verde, recusado e contestado são vermelhos, o resto é neutro ou de espera', () => {
    expect(statusTone('approved')).toBe('online');
    expect(statusTone('rejected')).toBe('danger');
    expect(statusTone('charged_back')).toBe('danger');
    expect(statusTone('pending')).toBe('warn');
    expect(statusTone('expired')).toBe('offline');
    expect(statusTone('refunded')).toBe('offline');
  });

  it('o recibo existe depois de aprovado, mesmo devolvido ou contestado', () => {
    const approvedAt = minutesAgo(5);

    expect(hasReceipt({ status: 'approved', approvedAt })).toBe(true);
    expect(hasReceipt({ status: 'refunded', approvedAt })).toBe(true);
    expect(hasReceipt({ status: 'charged_back', approvedAt })).toBe(true);
    expect(hasReceipt({ status: 'pending', approvedAt: null })).toBe(false);
    expect(hasReceipt({ status: 'rejected', approvedAt: null })).toBe(false);
  });
});

describe('formatos', () => {
  it('o identificador curto são os 8 primeiros caracteres do UUID', () => {
    expect(shortId('3f9c8b1e-7a52-4c1e-9d3a-2f6a8e0b4c11')).toBe('3f9c8b1e');
  });

  it('o Pacote vira meses de 30 dias', () => {
    expect(monthsOf({ days: 30 })).toBe(1);
    expect(monthsOf({ days: 90 })).toBe(3);
    expect(monthsOf({ days: 180 })).toBe(6);
  });

  it('o valor sai em reais, com o espaço sem quebra de linha entre o símbolo e o número', () => {
    expect(formatBrl(990)).toBe('R$\u00a09,90');
    expect(formatBrl(4990)).toBe('R$\u00a049,90');
  });

  it('as datas vão em horário de Brasília', () => {
    // 27/10 01:30 UTC ainda é 26/10 em Brasília (UTC−3).
    expect(formatDate('2026-10-27T01:30:00.000Z')).toBe('26 de outubro de 2026');
    expect(formatDateTime('2026-10-27T01:30:00.000Z')).toContain('22:30');
  });
});

describe('regras de tela', () => {
  it('passados 10 minutos sem mudar, a compra em aberto pede o suporte', () => {
    expect(supportDue({ status: 'pending', createdAt: minutesAgo(9) }, NOW)).toBe(false);
    expect(supportDue({ status: 'pending', createdAt: minutesAgo(10) }, NOW)).toBe(true);
    expect(supportDue({ status: 'in_review', createdAt: minutesAgo(25) }, NOW)).toBe(true);
    // Já aprovada (ou vencida) não é "processando".
    expect(supportDue({ status: 'approved', createdAt: minutesAgo(25) }, NOW)).toBe(false);
    expect(supportDue({ status: 'expired', createdAt: minutesAgo(40) }, NOW)).toBe(false);
  });

  it('o prazo do QR conta até o fim e não passa de zero', () => {
    expect(msUntilExpiry({ expiresAt: minutesAhead(20) }, NOW)).toBe(20 * 60_000);
    expect(msUntilExpiry({ expiresAt: minutesAgo(1) }, NOW)).toBe(0);
    expect(msUntilExpiry({ expiresAt: null }, NOW)).toBeNull();
  });

  it('o Pix só está vivo pendente, com código e prazo', () => {
    const pix: NonNullable<Purchase['pix']> = { copyPaste: '000201...', qrCodeBase64: null };

    expect(pixIsLive({ status: 'pending', pix, expiresAt: minutesAhead(5) }, NOW)).toBe(true);
    expect(pixIsLive({ status: 'pending', pix, expiresAt: minutesAgo(1) }, NOW)).toBe(false);
    expect(pixIsLive({ status: 'pending', pix: null, expiresAt: minutesAhead(5) }, NOW)).toBe(
      false,
    );
    expect(pixIsLive({ status: 'expired', pix, expiresAt: minutesAhead(5) }, NOW)).toBe(false);
  });

  it('o reembolso vale aprovado e até o prazo que a API calculou', () => {
    expect(canRefund({ status: 'approved', refundableUntil: minutesAhead(60) }, NOW)).toBe(true);
    expect(canRefund({ status: 'approved', refundableUntil: minutesAgo(1) }, NOW)).toBe(false);
    expect(canRefund({ status: 'approved', refundableUntil: null }, NOW)).toBe(false);
    expect(canRefund({ status: 'refunded', refundableUntil: minutesAhead(60) }, NOW)).toBe(false);
  });
});
