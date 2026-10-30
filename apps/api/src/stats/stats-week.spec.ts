import { describe, expect, it } from 'vitest';
import {
  dayOf,
  dayStartOf,
  hourStartOf,
  nextDayStartOf,
  parseWeekStart,
  splitByDay,
  splitByWeek,
  weekClosesAt,
  weekEndOf,
  weekStartOf,
} from './stats-week.js';

describe('weekStartOf', () => {
  it('a semana começa na segunda-feira às 00:00 de Brasília', () => {
    // 2026-10-19 é segunda; 00:00 BRT = 03:00 UTC.
    expect(weekStartOf(new Date('2026-10-19T03:00:00Z'))).toBe('2026-10-19');
    expect(weekStartOf(new Date('2026-10-19T02:59:59Z'))).toBe('2026-10-12');
  });

  it('o domingo à noite ainda é da semana que acaba', () => {
    expect(weekStartOf(new Date('2026-10-19T01:30:00-03:00'))).toBe('2026-10-19');
    expect(weekStartOf(new Date('2026-10-18T23:59:59-03:00'))).toBe('2026-10-12');
  });

  it('atravessa a virada de mês e de ano', () => {
    expect(weekStartOf(new Date('2027-01-01T12:00:00-03:00'))).toBe('2026-12-28');
  });
});

describe('splitByWeek', () => {
  it('uma sessão dentro de uma semana vira um pedaço só', () => {
    expect(
      splitByWeek(new Date('2026-10-14T20:00:00-03:00'), new Date('2026-10-14T21:30:00-03:00')),
    ).toEqual([{ weekStart: '2026-10-12', seconds: 5400 }]);
  });

  it('uma sessão que cruza a segunda-feira se divide entre as duas semanas', () => {
    expect(
      splitByWeek(new Date('2026-10-18T23:30:00-03:00'), new Date('2026-10-19T00:45:00-03:00')),
    ).toEqual([
      { weekStart: '2026-10-12', seconds: 1800 },
      { weekStart: '2026-10-19', seconds: 2700 },
    ]);
  });

  it('os pedaços somam a duração inteira mesmo com milissegundos na virada', () => {
    const start = new Date('2026-10-19T02:38:08.245Z');
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const pieces = splitByWeek(start, end);
    expect(pieces.map((piece) => piece.weekStart)).toEqual(['2026-10-12', '2026-10-19']);
    expect(pieces.reduce((sum, piece) => sum + piece.seconds, 0)).toBe(1800);
  });

  it('fim antes ou igual ao início não rende pedaço', () => {
    const at = new Date('2026-10-14T20:00:00-03:00');
    expect(splitByWeek(at, at)).toEqual([]);
    expect(splitByWeek(at, new Date(at.getTime() - 1000))).toEqual([]);
  });
});

describe('parseWeekStart', () => {
  it('aceita só a segunda-feira (YYYY-MM-DD)', () => {
    expect(parseWeekStart('2026-10-12')).toBe('2026-10-12');
    expect(parseWeekStart('2026-10-13')).toBeNull();
    expect(parseWeekStart('2026-10-18')).toBeNull();
  });

  it('recusa o que não é uma data', () => {
    expect(parseWeekStart('2026-13-01')).toBeNull();
    expect(parseWeekStart('2026-02-30')).toBeNull();
    expect(parseWeekStart('12/10/2026')).toBeNull();
    expect(parseWeekStart('')).toBeNull();
  });
});

describe('weekEndOf', () => {
  it('o fim é o domingo da mesma semana', () => {
    expect(weekEndOf('2026-10-12')).toBe('2026-10-18');
    expect(weekEndOf('2026-12-28')).toBe('2027-01-03');
  });
});

describe('weekClosesAt', () => {
  it('a semana fecha na segunda-feira seguinte, 00:00 de Brasília (03:00 UTC)', () => {
    expect(weekClosesAt('2026-10-19')).toBe('2026-10-26T03:00:00.000Z');
  });

  it('atravessa a virada de ano', () => {
    expect(weekClosesAt('2026-12-28')).toBe('2027-01-04T03:00:00.000Z');
  });

  it('é o primeiro instante da semana seguinte', () => {
    const closes = new Date(weekClosesAt('2026-10-19'));

    expect(weekStartOf(new Date(closes.getTime() - 1))).toBe('2026-10-19');
    expect(weekStartOf(closes)).toBe('2026-10-26');
  });
});

describe('dayOf', () => {
  it('é o dia de Brasília, não o de UTC', () => {
    expect(dayOf(new Date('2026-10-14T02:59:59Z'))).toBe('2026-10-13');
    expect(dayOf(new Date('2026-10-14T03:00:00Z'))).toBe('2026-10-14');
    expect(dayOf(new Date('2026-10-14T23:59:59-03:00'))).toBe('2026-10-14');
  });
});

describe('splitByDay', () => {
  it('uma Sessão dentro do dia fica inteira nele', () => {
    expect(
      splitByDay(new Date('2026-10-14T20:00:00-03:00'), new Date('2026-10-14T21:30:00-03:00')),
    ).toEqual([{ day: '2026-10-14', seconds: 5400 }]);
  });

  it('divide na meia-noite de Brasília, também na virada da semana', () => {
    expect(
      splitByDay(new Date('2026-10-18T23:30:00-03:00'), new Date('2026-10-19T00:45:00-03:00')),
    ).toEqual([
      { day: '2026-10-18', seconds: 1800 },
      { day: '2026-10-19', seconds: 2700 },
    ]);
  });

  it('os pedaços de uma Sessão de vários dias somam a duração inteira', () => {
    const start = new Date('2026-10-14T22:10:07.400-03:00');
    const end = new Date('2026-10-17T01:05:30.900-03:00');
    const pieces = splitByDay(start, end);
    expect(pieces.map((piece) => piece.day)).toEqual([
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]);
    const total = pieces.reduce((sum, piece) => sum + piece.seconds, 0);
    expect(total).toBe(Math.floor((end.getTime() - start.getTime()) / 1000));
  });

  it('sem duração positiva não há pedaços', () => {
    const at = new Date('2026-10-14T20:00:00Z');
    expect(splitByDay(at, at)).toEqual([]);
    expect(splitByDay(at, new Date(at.getTime() - 1000))).toEqual([]);
  });
});

describe('hourStartOf', () => {
  it('é a hora cheia', () => {
    expect(hourStartOf(new Date('2026-10-14T20:59:59.999Z')).toISOString()).toBe(
      '2026-10-14T20:00:00.000Z',
    );
  });
});

describe('dayStartOf e nextDayStartOf', () => {
  it('o dia de Brasília começa às 03:00 UTC e fecha às 03:00 UTC do dia seguinte', () => {
    const at = new Date('2026-10-19T15:00:00.000Z');
    expect(dayStartOf(at).toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(nextDayStartOf(at).toISOString()).toBe('2026-10-20T03:00:00.000Z');
  });

  it('02:59 UTC ainda é o dia anterior em Brasília', () => {
    const at = new Date('2026-10-19T02:59:59.999Z');
    expect(dayStartOf(at).toISOString()).toBe('2026-10-18T03:00:00.000Z');
    expect(dayStartOf(new Date('2026-10-19T03:00:00.000Z')).toISOString()).toBe(
      '2026-10-19T03:00:00.000Z',
    );
  });
});
