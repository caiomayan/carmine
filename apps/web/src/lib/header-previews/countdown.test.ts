import { describe, expect, it } from 'vitest';
import { closesIn } from './countdown';

const CLOSES = '2026-10-26T03:00:00.000Z';
const at = (iso: string) => new Date(iso).getTime();

describe('closesIn', () => {
  it('com dias de sobra, mostra dias e horas', () => {
    expect(closesIn(CLOSES, at('2026-10-22T23:00:00.000Z'))).toEqual({
      unit: 'days',
      days: 3,
      hours: 4,
      minutes: 0,
    });
  });

  it('no último dia, mostra horas e minutos', () => {
    expect(closesIn(CLOSES, at('2026-10-26T00:30:00.000Z'))).toEqual({
      unit: 'hours',
      days: 0,
      hours: 2,
      minutes: 30,
    });
  });

  it('na última hora, só os minutos (e nunca zero antes de fechar)', () => {
    expect(closesIn(CLOSES, at('2026-10-26T02:20:00.000Z'))).toMatchObject({
      unit: 'minutes',
      minutes: 40,
    });
    expect(closesIn(CLOSES, at('2026-10-26T02:59:40.000Z'))).toMatchObject({
      unit: 'minutes',
      minutes: 1,
    });
  });

  it('depois do fechamento, a semana está encerrada', () => {
    expect(closesIn(CLOSES, at('2026-10-26T03:00:00.000Z'))).toEqual({ unit: 'closed' });
    expect(closesIn(CLOSES, at('2026-10-27T12:00:00.000Z'))).toEqual({ unit: 'closed' });
  });

  it('data inválida não quebra: vale como encerrada', () => {
    expect(closesIn('lixo', at('2026-10-22T00:00:00.000Z'))).toEqual({ unit: 'closed' });
  });
});
