import { describe, expect, it } from 'vitest';
import {
  hiddenOnPath,
  isDismissed,
  isEndingNotice,
  VIP_ENDING_ID,
  VIP_ENDING_STORAGE_KEY,
  vipEndingInitScript,
  vipEndingKey,
} from './ending';

// 27/10/2026 15:00 em Brasília (UTC-3).
const NOW = new Date('2026-10-27T18:00:00.000Z');

describe('vipEndingKey', () => {
  it('é o dia de Brasília e o aviso', () => {
    expect(vipEndingKey('ending_soon', NOW)).toBe('2026-10-27|ending_soon');
  });

  it('perto da meia-noite UTC ainda é o dia de Brasília', () => {
    // 28/10 01:30 UTC = 27/10 22:30 em Brasília.
    expect(vipEndingKey('ending_soon', new Date('2026-10-28T01:30:00.000Z'))).toBe(
      '2026-10-27|ending_soon',
    );
    expect(vipEndingKey('ending_soon', new Date('2026-10-28T03:30:00.000Z'))).toBe(
      '2026-10-28|ending_soon',
    );
  });
});

describe('isDismissed', () => {
  it('dispensada hoje, para o mesmo aviso', () => {
    expect(isDismissed('2026-10-27|ending_soon', 'ending_soon', NOW)).toBe(true);
  });

  it('volta no dia seguinte', () => {
    expect(isDismissed('2026-10-26|ending_soon', 'ending_soon', NOW)).toBe(false);
  });

  it('volta no dia do fim: o aviso é outro', () => {
    expect(isDismissed('2026-10-27|ending_soon', 'ending_today', NOW)).toBe(false);
  });

  it('sem nada guardado, não está dispensada', () => {
    expect(isDismissed(null, 'ending_soon', NOW)).toBe(false);
  });
});

describe('avisos e páginas', () => {
  it('só os 3 dias antes e o dia do fim viram faixa', () => {
    expect(isEndingNotice('ending_soon')).toBe(true);
    expect(isEndingNotice('ending_today')).toBe(true);
    expect(isEndingNotice('ended_today')).toBe(false);
    expect(isEndingNotice(null)).toBe(false);
  });

  it('não repete a faixa onde o VIP já é o assunto', () => {
    for (const path of ['/plans', '/plans/checkout', '/plans/purchase/abc', '/loadout']) {
      expect(hiddenOnPath(path)).toBe(true);
    }
    for (const path of ['/', '/ranking', '/inventory', '/vipx', '/settings/purchases']) {
      expect(hiddenOnPath(path)).toBe(false);
    }
  });
});

describe('vipEndingInitScript', () => {
  /** Roda o script com um documento e um localStorage de mentira. */
  function run(stored: string | null, notice: string, throwing = false) {
    const element = { hidden: false, getAttribute: () => notice };
    const document = { getElementById: (id: string) => (id === VIP_ENDING_ID ? element : null) };
    const localStorage = {
      getItem: (key: string) => {
        if (throwing) throw new Error('bloqueado');
        return key === VIP_ENDING_STORAGE_KEY ? stored : null;
      },
    };
    new Function('document', 'localStorage', vipEndingInitScript)(document, localStorage);
    return element.hidden;
  }

  const today = vipEndingKey('ending_soon');

  it('esconde a faixa dispensada hoje', () => {
    expect(run(today, 'ending_soon')).toBe(true);
  });

  it('deixa a faixa quando a dispensa é de outro dia ou de outro aviso', () => {
    expect(run('2000-01-01|ending_soon', 'ending_soon')).toBe(false);
    expect(run(today, 'ending_today')).toBe(false);
    expect(run(null, 'ending_soon')).toBe(false);
  });

  it('com o localStorage bloqueado, não quebra e deixa a faixa', () => {
    expect(run(today, 'ending_soon', true)).toBe(false);
  });
});
