import { REPORT_DAILY_LIMIT_MESSAGE } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { checkReportLimits, refusalMessage } from './report-limits.js';

const NOW = new Date('2026-10-19T15:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe('checkReportLimits', () => {
  it('libera quem não denunciou ninguém', () => {
    expect(checkReportLimits([], 'alvo', NOW)).toEqual({ allowed: true });
  });

  it('recusa a segunda Denúncia do mesmo alvo em 10 minutos e diz quando tentar de novo', () => {
    const verdict = checkReportLimits(
      [{ targetAccountId: 'alvo', createdAt: minutesAgo(4) }],
      'alvo',
      NOW,
    );
    expect(verdict).toEqual({
      allowed: false,
      refusal: 'same_target_cooldown',
      retryAfterSeconds: 6 * 60,
    });
  });

  it('libera o mesmo alvo passados 10 minutos', () => {
    const past = [{ targetAccountId: 'alvo', createdAt: minutesAgo(10) }];
    expect(checkReportLimits(past, 'alvo', NOW)).toEqual({ allowed: true });
  });

  it('não confunde alvos: denunciar outro jogador logo depois é permitido', () => {
    const past = [{ targetAccountId: 'outro', createdAt: minutesAgo(1) }];
    expect(checkReportLimits(past, 'alvo', NOW)).toEqual({ allowed: true });
  });

  it('recusa a sexta Denúncia na hora e conta até a mais antiga da janela sair', () => {
    const past = [50, 40, 30, 20, 12].map((m, i) => ({
      targetAccountId: `a${i}`,
      createdAt: minutesAgo(m),
    }));
    expect(checkReportLimits(past, 'novo', NOW)).toEqual({
      allowed: false,
      refusal: 'hourly_limit',
      retryAfterSeconds: 10 * 60,
    });
  });

  it('com 5 já fora da janela de uma hora, libera', () => {
    const past = [61, 70, 80, 90, 100].map((m, i) => ({
      targetAccountId: `a${i}`,
      createdAt: minutesAgo(m),
    }));
    expect(checkReportLimits(past, 'novo', NOW)).toEqual({ allowed: true });
  });

  it('com o limite da hora e o mesmo alvo há pouco, vale o prazo mais longo', () => {
    const past = [
      { targetAccountId: 'alvo', createdAt: minutesAgo(2) },
      ...[55, 45, 35, 25].map((m, i) => ({ targetAccountId: `a${i}`, createdAt: minutesAgo(m) })),
    ];
    expect(checkReportLimits(past, 'alvo', NOW)).toEqual({
      allowed: false,
      refusal: 'same_target_cooldown',
      retryAfterSeconds: 8 * 60,
    });
  });

  it('com o limite da hora e o mesmo alvo, vale a hora se ela vence depois', () => {
    const past = [
      { targetAccountId: 'alvo', createdAt: minutesAgo(9) },
      ...[58, 45, 35, 25].map((m, i) => ({ targetAccountId: `a${i}`, createdAt: minutesAgo(m) })),
    ];
    expect(checkReportLimits(past, 'alvo', NOW)).toEqual({
      allowed: false,
      refusal: 'hourly_limit',
      retryAfterSeconds: 120,
    });
  });
});

describe('refusalMessage', () => {
  it('diz quanto falta para tentar de novo', () => {
    expect(refusalMessage('same_target_cooldown', 6 * 60)).toBe(
      'Você já denunciou este jogador há pouco. Tente de novo em 6 min.',
    );
    expect(refusalMessage('hourly_limit', 30)).toBe(
      'Você chegou ao limite de 5 denúncias por hora. Tente de novo em 30 s.',
    );
  });

  it('recusa clara para a própria pessoa e para quem não tem Conta', () => {
    expect(refusalMessage('self', null)).toBe('Você não pode denunciar a si mesmo.');
    expect(refusalMessage('unknown_account', null)).toMatch(/Não foi possível/);
  });
});

describe('o teto por dia (regra única de denúncia)', () => {
  // 15:00 UTC = 12:00 em Brasília; o dia fecha à meia-noite de Brasília = 03:00 UTC do dia seguinte.
  it('libera até a décima Denúncia do dia e recusa a 11ª, dizendo para tentar amanhã', () => {
    expect(checkReportLimits([], 'alvo', NOW, 9)).toEqual({ allowed: true });
    expect(checkReportLimits([], 'alvo', NOW, 10)).toEqual({
      allowed: false,
      refusal: 'daily_limit',
      retryAfterSeconds: 12 * 3600,
    });
  });

  it('quando o limite da hora vale junto, a recusa é a do prazo mais longo (a do dia)', () => {
    const past = [50, 40, 30, 20, 12].map((m, i) => ({
      targetAccountId: `a${i}`,
      createdAt: minutesAgo(m),
    }));
    expect(checkReportLimits(past, 'novo', NOW, 10)).toMatchObject({ refusal: 'daily_limit' });
  });

  it('a mensagem é a mesma do site e vai sem o prefixo da marca (o plugin põe o dele)', () => {
    expect(refusalMessage('daily_limit', 3600)).toBe(
      'Você já enviou 10 denúncias hoje. Tente amanhã.',
    );
    expect(refusalMessage('daily_limit', 3600)).toBe(REPORT_DAILY_LIMIT_MESSAGE);
  });
});
