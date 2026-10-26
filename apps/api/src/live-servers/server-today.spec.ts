import { describe, expect, it } from 'vitest';
import type { serverHours } from '../database/schema.js';
import {
  dayStart,
  InvalidServerDay,
  mapsFromHours,
  mapsFromSpans,
  parseServerDay,
  peakOf,
  playersPerHour,
  type SessionRow,
  spansOf,
} from './server-today.js';

// Terça-feira 27/10/2026, 15:00 em Brasília.
const NOW = new Date('2026-10-27T18:00:00Z');
const DAY = '2026-10-27';
const START = dayStart(DAY);
const at = (hour: number, minute = 0) => new Date(START.getTime() + (hour * 60 + minute) * 60_000);

const session = (over: Partial<SessionRow> & { startedAt: Date }): SessionRow => ({
  accountId: 'a',
  endedAt: null,
  map: null,
  maps: [],
  ...over,
});

describe('parseServerDay', () => {
  it('sem data é hoje em Brasília, mesmo quando em UTC já é amanhã', () => {
    expect(parseServerDay(undefined, NOW)).toBe('2026-10-27');
    expect(parseServerDay('', NOW)).toBe('2026-10-27');
    expect(parseServerDay(undefined, new Date('2026-10-28T02:30:00Z'))).toBe('2026-10-27');
  });

  it('aceita hoje e até 7 dias atrás', () => {
    expect(parseServerDay('2026-10-27', NOW)).toBe('2026-10-27');
    expect(parseServerDay('2026-10-20', NOW)).toBe('2026-10-20');
  });

  it('recusa data inválida, futura ou mais velha que a janela', () => {
    for (const bad of [
      '2026-10-28',
      '2026-10-19',
      '2026-02-30',
      'ontem',
      '27/10/2026',
      '2026-1-5',
    ]) {
      expect(() => parseServerDay(bad, NOW), bad).toThrow(InvalidServerDay);
    }
  });
});

describe('dayStart', () => {
  it('é a meia-noite de Brasília', () => {
    expect(dayStart('2026-10-27').toISOString()).toBe('2026-10-27T03:00:00.000Z');
  });
});

describe('spansOf', () => {
  it('recorta a Sessão no dia e em agora', () => {
    const spans = spansOf(
      [
        session({ startedAt: at(-2), endedAt: at(1) }),
        session({ accountId: 'b', startedAt: at(10), endedAt: at(11) }),
        session({ accountId: 'c', startedAt: at(14), endedAt: null }),
      ],
      START,
      NOW,
    );

    expect(
      spans.map((s) => [
        s.accountId,
        (s.from - START.getTime()) / 3_600_000,
        (s.to - START.getTime()) / 3_600_000,
      ]),
    ).toEqual([
      ['a', 0, 1],
      ['b', 10, 11],
      ['c', 14, 15],
    ]);
  });

  it('ignora a aberta há mais de 24 h (queda do servidor) e a sem duração', () => {
    const spans = spansOf(
      [
        session({ startedAt: at(-30) }),
        session({ accountId: 'b', startedAt: at(5), endedAt: at(5) }),
        session({ accountId: 'c', startedAt: at(20), endedAt: at(21) }),
      ],
      START,
      NOW,
    );

    expect(spans).toEqual([]);
  });

  it('usa os mapas da Sessão, ou o de entrada quando só ele existe', () => {
    const [both, single, none] = spansOf(
      [
        session({
          startedAt: at(1),
          endedAt: at(2),
          map: 'de_dust2',
          maps: ['de_dust2', 'de_inferno'],
        }),
        session({ accountId: 'b', startedAt: at(1), endedAt: at(2), map: 'de_nuke' }),
        session({ accountId: 'c', startedAt: at(1), endedAt: at(2) }),
      ],
      START,
      NOW,
    );

    expect(both?.maps).toEqual(['de_dust2', 'de_inferno']);
    expect(single?.maps).toEqual(['de_nuke']);
    expect(none?.maps).toEqual([]);
  });
});

describe('playersPerHour e peakOf', () => {
  const spans = spansOf(
    [
      session({ accountId: 'a', startedAt: at(9, 30), endedAt: at(11, 10) }),
      session({ accountId: 'b', startedAt: at(10), endedAt: at(10, 40) }),
      session({ accountId: 'c', startedAt: at(10, 20), endedAt: at(10, 30) }),
      // Mesma Conta, duas Sessões na mesma hora: um jogador só.
      session({ accountId: 'b', startedAt: at(10, 50), endedAt: at(11, 5) }),
    ],
    START,
    NOW,
  );

  it('conta jogadores distintos em cada hora, sempre 24 horas', () => {
    const hours = playersPerHour(spans, START);
    expect(hours).toHaveLength(24);
    expect(hours[8]).toBe(0);
    expect(hours[9]).toBe(1);
    expect(hours[10]).toBe(3);
    expect(hours[11]).toBe(2);
    expect(hours[12]).toBe(0);
  });

  it('o pico é o máximo ao mesmo tempo, no primeiro instante em que aparece', () => {
    expect(peakOf(spans)).toEqual({ at: at(10, 20), count: 3 });
  });

  it('quem sai no mesmo instante em que outro entra não infla o pico', () => {
    const handoff = spansOf(
      [
        session({ accountId: 'a', startedAt: at(1), endedAt: at(2) }),
        session({ accountId: 'b', startedAt: at(2), endedAt: at(3) }),
      ],
      START,
      NOW,
    );
    expect(peakOf(handoff)).toEqual({ at: at(1), count: 1 });
  });

  it('sem Sessões não há pico', () => {
    expect(peakOf([])).toBeNull();
  });
});

describe('mapsFromSpans', () => {
  it('vem das Sessões, do mais cedo ao mais tarde, sem rounds nem placar', () => {
    const maps = mapsFromSpans(
      spansOf(
        [
          session({ startedAt: at(2), endedAt: at(4), maps: ['de_inferno'] }),
          session({
            accountId: 'b',
            startedAt: at(1),
            endedAt: at(3),
            maps: ['de_dust2'],
          }),
        ],
        START,
        NOW,
      ),
    );

    expect(maps.map((m) => m.map)).toEqual(['de_dust2', 'de_inferno']);
    expect(maps[1]).toMatchObject({
      from: at(2).toISOString(),
      to: at(4).toISOString(),
      rounds: null,
      ctWins: null,
      tWins: null,
      finalScore: null,
    });
  });
});

describe('mapsFromHours', () => {
  const row = (
    over: Partial<typeof serverHours.$inferSelect>,
  ): typeof serverHours.$inferSelect => ({
    serverId: 's',
    hourStart: at(10),
    map: 'de_mirage',
    roundsPlayed: 10,
    ctWins: 6,
    tWins: 4,
    firstRoundAt: at(10, 5),
    lastRoundAt: at(10, 55),
    lastRoundNumber: 10,
    scoreCt: 6,
    scoreT: 4,
    ...over,
  });

  it('soma as horas do mapa e usa o placar do round mais recente', () => {
    const maps = mapsFromHours([
      row({}),
      row({
        hourStart: at(11),
        roundsPlayed: 5,
        ctWins: 1,
        tWins: 4,
        firstRoundAt: at(11, 1),
        lastRoundAt: at(11, 20),
        lastRoundNumber: 15,
        scoreCt: 7,
        scoreT: 8,
      }),
      row({
        map: 'de_nuke',
        hourStart: at(12),
        firstRoundAt: at(12, 1),
        lastRoundAt: at(12, 9),
        scoreCt: null,
        scoreT: null,
      }),
    ]);

    expect(maps).toEqual([
      {
        map: 'de_mirage',
        from: at(10, 5).toISOString(),
        to: at(11, 20).toISOString(),
        rounds: 15,
        ctWins: 7,
        tWins: 8,
        finalScore: { ct: 7, t: 8 },
      },
      {
        map: 'de_nuke',
        from: at(12, 1).toISOString(),
        to: at(12, 9).toISOString(),
        rounds: 10,
        ctWins: 6,
        tWins: 4,
        finalScore: null,
      },
    ]);
  });
});
