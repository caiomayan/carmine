import { liveServerSchema, serverPlayersSchema, serverTodaySchema } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { brasiliaClock, matchOf, rosterOf, todayOf } from './adapt';

const ID = '5a0e9c3e-1d2b-4c47-9a55-3b7a2f0c8d11';
const AT = '2026-10-26T21:07:00.000-03:00';

/** Fixtures validadas pelos schemas do #123: se o contrato mudar, o teste quebra aqui. */
const server = (over: object = {}) =>
  liveServerSchema.parse({
    id: ID,
    name: 'retake-1',
    showcaseName: null,
    code: null,
    mode: 'retake',
    address: '203.0.113.5:27015',
    region: 'sao-paulo',
    map: 'de_mirage',
    players: 9,
    maxPlayers: 9,
    state: 'full',
    lastHeartbeatAt: AT,
    lastMap: 'de_mirage',
    ...over,
  });

const player = (over: object) => ({
  player: { private: false, publicId: 1042, displayName: 'Rafa Tavares', avatarUrl: null },
  team: 'ct',
  kills: 14,
  deaths: 6,
  score: 31,
  self: false,
  ...over,
});

const players = (rows: object[], over: object = {}) =>
  serverPlayersSchema.parse({
    serverId: ID,
    mode: 'retake',
    state: 'full',
    map: 'de_mirage',
    maxPlayers: 9,
    scoreboard: true,
    updatedAt: AT,
    players: rows,
    ...over,
  });

const hours = (over: (hour: number) => object = () => ({})) =>
  Array.from({ length: 24 }, (_, hour) => ({ hour, rounds: 0, players: 0, ...over(hour) }));

const today = (over: object = {}) =>
  serverTodaySchema.parse({
    serverId: ID,
    mode: 'retake',
    date: '2026-10-26',
    isToday: true,
    since: '2026-10-24',
    rounds: { played: 47, ctWins: 25, tWins: 22 },
    maps: [
      {
        map: 'de_nuke',
        from: '2026-10-26T19:12:00.000-03:00',
        to: '2026-10-26T19:52:00.000-03:00',
        rounds: 33,
        ctWins: 17,
        tWins: 16,
        finalScore: { ct: 17, t: 16 },
      },
      {
        map: 'de_mirage',
        from: '2026-10-26T20:41:00.000-03:00',
        to: '2026-10-26T21:06:30.000-03:00',
        rounds: 14,
        ctWins: 8,
        tWins: 6,
        finalScore: null,
      },
    ],
    hours: hours((hour) => (hour === 20 ? { rounds: 30, players: 8 } : {})),
    peakPlayers: { at: '2026-10-26T20:12:00.000-03:00', count: 9 },
    uniquePlayers: 31,
    generatedAt: AT,
    ...over,
  });

describe('matchOf', () => {
  it('ausente é coletando; nulo é pronto e sem partida; presente é o placar', () => {
    expect(matchOf(server())).toEqual({ status: 'collecting', since: null });
    expect(matchOf(server({ match: null }))).toEqual({ status: 'ready', data: null });
    const match = { round: 15, ctScore: 8, tScore: 6, warmup: false };
    expect(matchOf(server({ match }))).toEqual({ status: 'ready', data: match });
  });
});

describe('rosterOf', () => {
  it('o Perfil privado vira uma linha anônima, com id estável por posição e sem link', () => {
    const result = rosterOf(
      players([
        player({}),
        player({
          player: {
            private: true,
            publicId: null,
            displayName: 'Jogador privado',
            avatarUrl: null,
          },
          team: 't',
        }),
        player({
          player: {
            private: true,
            publicId: null,
            displayName: 'Jogador privado',
            avatarUrl: null,
          },
          team: 't',
        }),
      ]),
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data.scoreboard).toBe(true);
    expect(result.data.players.map((row) => row.id)).toEqual(['1042', 'privado-0', 'privado-1']);
    expect(result.data.players[1]).toMatchObject({ name: null, publicId: null, avatarUrl: null });
    expect(result.data.players[0]).toMatchObject({
      name: 'Rafa Tavares',
      publicId: 1042,
      kills: 14,
    });
  });

  it('sem placar por jogador os números e o time vêm nulos: zeros na linha, scoreboard falso', () => {
    const result = rosterOf(
      players([player({ team: null, kills: null, deaths: null, score: null })], {
        scoreboard: false,
      }),
    );
    if (result.status !== 'ready') throw new Error('esperava pronto');
    expect(result.data.scoreboard).toBe(false);
    expect(result.data.players[0]).toMatchObject({ team: null, kills: 0, deaths: 0, score: 0 });
  });

  it('servidor offline: lista vazia e pronta', () => {
    expect(rosterOf(players([], { state: 'offline', map: null }))).toEqual({
      status: 'ready',
      data: { players: [], scoreboard: true },
    });
  });
});

describe('todayOf', () => {
  it('horários no relógio de Brasília e o mapa de agora é o último com movimento recente', () => {
    const result = todayOf(today(), 'de_mirage');
    if (result.status !== 'ready') throw new Error('esperava pronto');
    expect(result.data.clock).toBe('21:07');
    expect(result.data.maps.map((row) => [row.map, row.from, row.to])).toEqual([
      ['de_nuke', '19:12', '19:52'],
      ['de_mirage', '20:41', null],
    ]);
    expect(result.data.hoursMetric).toBe('rounds');
    expect(result.data.hours).toHaveLength(24);
    expect(result.data.hours[20]).toBe(30);
    expect(result.data.peakPlayers).toEqual({ at: '20:12', count: 9 });
    expect(result.data.since).toBe('2026-10-24');
  });

  it('servidor offline (ou em outro mapa) não tem mapa de agora', () => {
    for (const liveMap of [null, 'de_inferno']) {
      const result = todayOf(today(), liveMap);
      if (result.status !== 'ready') throw new Error('esperava pronto');
      expect(result.data.maps.at(-1)?.to).toBe('21:06');
    }
  });

  it('o último mapa sem movimento há mais de 3 min já acabou', () => {
    const stale = today({ generatedAt: '2026-10-26T21:20:00.000-03:00' });
    const result = todayOf(stale, 'de_mirage');
    if (result.status !== 'ready') throw new Error('esperava pronto');
    expect(result.data.maps.at(-1)?.to).toBe('21:06');
  });

  it('sem rounds (Deathmatch ou plugin antigo) o gráfico mostra os jogadores e nada vira zero', () => {
    const result = todayOf(
      today({
        mode: 'deathmatch',
        rounds: null,
        maps: [
          {
            map: 'de_dust2',
            from: '2026-10-26T20:44:00.000-03:00',
            to: '2026-10-26T21:06:00.000-03:00',
            rounds: null,
            ctWins: null,
            tWins: null,
            finalScore: null,
          },
        ],
        hours: hours((hour) => (hour === 21 ? { players: 12 } : {})),
        peakPlayers: null,
        uniquePlayers: null,
      }),
      'de_dust2',
    );
    if (result.status !== 'ready') throw new Error('esperava pronto');
    expect(result.data.rounds).toBeNull();
    expect(result.data.hoursMetric).toBe('players');
    expect(result.data.hours[21]).toBe(12);
    expect(result.data.peakPlayers).toBeNull();
    expect(result.data.uniquePlayers).toBeNull();
    expect(result.data.maps[0]).toMatchObject({ rounds: null, ctWins: null, to: null });
  });

  it('sem `since` o servidor nunca teve dado detalhado: coletando', () => {
    expect(todayOf(today({ since: null }), null)).toEqual({ status: 'collecting', since: null });
  });
});

describe('brasiliaClock', () => {
  it('converte para Brasília (UTC-3) em 24 h', () => {
    expect(brasiliaClock('2026-10-26T00:05:00.000Z')).toBe('21:05');
    expect(brasiliaClock('2026-10-26T12:00:00.000Z')).toBe('09:00');
  });
});
