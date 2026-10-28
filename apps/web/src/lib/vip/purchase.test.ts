import { VIP_MAX_HORIZON_DAYS } from '@carmine/contracts/payments';
import { describe, expect, it } from 'vitest';
import {
  exceedsHorizon,
  formatClock,
  isOpen,
  msUntilExpiry,
  packageFromParam,
  projectedVipEnd,
  purchaseErrorCode,
  purchaseView,
} from './purchase';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('packageFromParam', () => {
  it('acha o Pacote pelo id; ausente ou desconhecido, nulo', () => {
    expect(packageFromParam('vip-3m')?.days).toBe(90);
    expect(packageFromParam(['vip-1m', 'vip-6m'])?.id).toBe('vip-1m');
    expect(packageFromParam('vip-9m')).toBeNull();
    expect(packageFromParam(undefined)).toBeNull();
  });
});

describe('projectedVipEnd', () => {
  it('sem VIP (ou VIP acabado), conta a partir de agora', () => {
    expect(projectedVipEnd(null, 30, NOW).getTime()).toBe(NOW.getTime() + 30 * DAY);
    const ended = new Date(NOW.getTime() - 5 * DAY).toISOString();
    expect(projectedVipEnd(ended, 30, NOW).getTime()).toBe(NOW.getTime() + 30 * DAY);
  });

  it('com VIP ativo, os dias entram depois do fim atual (os Pacotes se somam)', () => {
    const ends = new Date(NOW.getTime() + 10 * DAY).toISOString();
    expect(projectedVipEnd(ends, 30, NOW).getTime()).toBe(NOW.getTime() + 40 * DAY);
  });
});

describe('exceedsHorizon', () => {
  it('passa do limite só quando o fim fica além dos dias à frente permitidos', () => {
    const edge = new Date(NOW.getTime() + VIP_MAX_HORIZON_DAYS * DAY);
    expect(exceedsHorizon(edge, NOW)).toBe(false);
    expect(exceedsHorizon(new Date(edge.getTime() + 1), NOW)).toBe(true);
  });
});

describe('relógio do Pix', () => {
  it('quanto falta nunca é negativo; sem prazo, nulo', () => {
    expect(msUntilExpiry(null, NOW)).toBeNull();
    expect(msUntilExpiry(new Date(NOW.getTime() + 90_000).toISOString(), NOW)).toBe(90_000);
    expect(msUntilExpiry(new Date(NOW.getTime() - 5_000).toISOString(), NOW)).toBe(0);
  });

  it('formata minutos e segundos, arredondando para cima', () => {
    expect(formatClock(30 * 60 * 1000)).toBe('30:00');
    expect(formatClock(59_100)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
  });
});

describe('purchaseView', () => {
  const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

  it('pendente espera o pagamento; quem voltou do cartão há pouco ainda espera', () => {
    expect(purchaseView({ status: 'pending', createdAt: at(2) }, false, NOW)).toBe('waiting');
    expect(purchaseView({ status: 'pending', createdAt: at(2) }, true, NOW)).toBe('waiting');
  });

  it('quem voltou do cartão e segue sem confirmação depois do prazo vê "processando"', () => {
    expect(purchaseView({ status: 'pending', createdAt: at(11) }, true, NOW)).toBe('processing');
    // Quem só abriu a página de um Pix velho continua vendo o Pix.
    expect(purchaseView({ status: 'pending', createdAt: at(11) }, false, NOW)).toBe('waiting');
  });

  it('os demais status viram a própria tela', () => {
    for (const status of [
      'in_review',
      'approved',
      'rejected',
      'expired',
      'cancelled',
      'refunded',
      'partially_refunded',
      'charged_back',
    ] as const) {
      expect(purchaseView({ status, createdAt: at(1) }, false, NOW)).toBe(status);
    }
  });

  it('só created, pending e in_review continuam abertos', () => {
    expect(
      ['created', 'pending', 'in_review', 'approved', 'expired'].map((s) => isOpen(s as never)),
    ).toEqual([true, true, true, false, false]);
  });
});

describe('purchaseErrorCode', () => {
  it('lê o código estável da API; o resto é "unknown"', () => {
    expect(purchaseErrorCode({ code: 'vip_horizon', message: 'x' })).toBe('vip_horizon');
    expect(purchaseErrorCode({ code: 'nada' })).toBe('unknown');
    expect(purchaseErrorCode(null)).toBe('unknown');
    expect(purchaseErrorCode('texto')).toBe('unknown');
  });
});
