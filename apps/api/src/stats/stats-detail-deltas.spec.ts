import type { EventBatch, KillEvent, RoundEndEvent } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { collectServerHours } from './server-hours.js';
import { collectStats } from './stats-deltas.js';

const A = '76561198000000001';
const B = '76561198000000002';
const KNOWN = new Set([A, B]);
const AT = '2026-10-14T20:00:00-03:00';

let n = 0;
const id = () => `0199f2a0-7b1c-7000-8000-${String(++n).padStart(12, '0')}`;

const kill = (over: Partial<KillEvent> = {}): KillEvent => ({
  id: id(),
  at: AT,
  warmup: false,
  killerSteamId: A,
  killerIsBot: false,
  victimSteamId: B,
  victimIsBot: false,
  assisterSteamId: null,
  assisterIsBot: false,
  headshot: false,
  weapon: 'ak47',
  teamKill: false,
  ...over,
});

const round = (over: Partial<RoundEndEvent> = {}): RoundEndEvent => ({
  id: id(),
  at: AT,
  warmup: false,
  winner: 'ct',
  players: [],
  ...over,
});

const batch = (events: Partial<EventBatch>): EventBatch => ({
  kills: [],
  damages: [],
  roundEnds: [],
  sessionStarts: [],
  sessionEnds: [],
  ...events,
});

describe('collectStats: dia e arma (S12b)', () => {
  it('a mesma kill soma na semana, no dia e na arma por lado', () => {
    const result = collectStats(
      batch({ kills: [kill({ killerTeam: 'ct', headshot: true, weapon: 'weapon_hkp2000' })] }),
      KNOWN,
    );
    expect(result.deltas.find((d) => d.steamId === A)).toMatchObject({
      weekStart: '2026-10-12',
      kills: 1,
      headshots: 1,
    });
    expect(result.dailyDeltas.find((d) => d.steamId === A)).toMatchObject({
      day: '2026-10-14',
      kills: 1,
      headshots: 1,
    });
    expect(result.weapons).toEqual([
      { steamId: A, weapon: 'p2000', side: 'ct', kills: 1, headshots: 1 },
    ]);
  });

  it('agrupa a mesma arma e lado, e separa os lados', () => {
    const result = collectStats(
      batch({
        kills: [
          kill({ killerTeam: 't', headshot: true }),
          kill({ killerTeam: 't' }),
          kill({ killerTeam: 'ct' }),
        ],
      }),
      KNOWN,
    );
    expect(result.weapons).toEqual([
      { steamId: A, weapon: 'ak47', side: 't', kills: 2, headshots: 1 },
      { steamId: A, weapon: 'ak47', side: 'ct', kills: 1, headshots: 0 },
    ]);
  });

  it('sem o lado (plugin velho) a kill conta, mas não entra no radar', () => {
    const result = collectStats(batch({ kills: [kill(), kill({ killerTeam: null })] }), KNOWN);
    expect(result.deltas.find((d) => d.steamId === A)?.kills).toBe(2);
    expect(result.weapons).toEqual([]);
  });

  it('aquecimento, bot, aliado, suicídio e Conta desconhecida não entram na arma', () => {
    const stranger = '76561198000000099';
    const result = collectStats(
      batch({
        kills: [
          kill({ warmup: true, killerTeam: 'ct' }),
          kill({ victimIsBot: true, killerTeam: 'ct' }),
          kill({ teamKill: true, killerTeam: 'ct' }),
          kill({ victimSteamId: A, killerTeam: 'ct' }),
          kill({ killerSteamId: stranger, killerTeam: 'ct' }),
          kill({ killerSteamId: null, killerTeam: 'ct' }),
        ],
      }),
      KNOWN,
    );
    expect(result.weapons).toEqual([]);
  });

  it('o tempo jogado vai para os dias que a Sessão cruza', () => {
    const result = collectStats(
      batch({
        sessionEnds: [
          {
            id: id(),
            at: '2026-10-15T00:20:00-03:00',
            sessionId: id(),
            steamId: A,
            startedAt: '2026-10-14T23:50:00-03:00',
          },
        ],
      }),
      KNOWN,
    );
    expect(result.dailyDeltas.map((d) => [d.day, d.secondsPlayed]).sort()).toEqual([
      ['2026-10-14', 600],
      ['2026-10-15', 1200],
    ]);
    expect(result.deltas).toHaveLength(1);
  });

  it('os rounds e o dano também entram no dia', () => {
    const result = collectStats(
      batch({
        roundEnds: [
          round({
            winner: 'ct',
            players: [
              { steamId: A, team: 'ct' },
              { steamId: B, team: 't' },
            ],
          }),
        ],
        damages: [
          {
            id: id(),
            at: AT,
            warmup: false,
            attackerSteamId: A,
            victimIsBot: false,
            teamDamage: false,
            amount: 80,
          },
        ],
      }),
      KNOWN,
    );
    expect(result.dailyDeltas.find((d) => d.steamId === A)).toMatchObject({
      roundsPlayed: 1,
      roundsWon: 1,
      damage: 80,
    });
    expect(result.dailyDeltas.find((d) => d.steamId === B)).toMatchObject({
      roundsPlayed: 1,
      roundsWon: 0,
    });
  });
});

describe('collectServerHours', () => {
  it('agrupa por hora cheia e mapa, sem aquecimento nem round sem mapa', () => {
    const at = (time: string) => `2026-10-14T${time}:00Z`;
    const hours = collectServerHours([
      round({
        at: at('20:05'),
        map: 'de_nuke',
        winner: 'ct',
        roundNumber: 1,
        scoreCt: 1,
        scoreT: 0,
      }),
      round({
        at: at('20:40'),
        map: 'de_nuke',
        winner: 't',
        roundNumber: 2,
        scoreCt: 1,
        scoreT: 1,
      }),
      round({ at: at('20:50'), map: 'de_nuke', winner: 'none' }),
      round({ at: at('21:01'), map: 'de_nuke', winner: 'ct' }),
      round({ at: at('20:10'), map: 'de_mirage', winner: 'ct' }),
      round({ at: at('20:11'), map: 'de_nuke', warmup: true }),
      round({ at: at('20:12') }),
    ]);
    const nuke = hours.find(
      (h) => h.map === 'de_nuke' && h.hourStart.toISOString().includes('T20'),
    );
    expect(nuke).toMatchObject({ roundsPlayed: 3, ctWins: 1, tWins: 1 });
    expect(nuke?.firstRoundAt.toISOString()).toBe('2026-10-14T20:05:00.000Z');
    // O placar é o do round mais recente do grupo (o empate do fim, sem placar, vence).
    expect(nuke).toMatchObject({ lastRoundNumber: null, scoreCt: null, scoreT: null });
    expect(hours).toHaveLength(3);
  });

  it('o placar final é o do último round que o trouxe', () => {
    const hours = collectServerHours([
      round({ at: '2026-10-14T20:30:00Z', map: 'de_nuke', roundNumber: 2, scoreCt: 1, scoreT: 1 }),
      round({ at: '2026-10-14T20:10:00Z', map: 'de_nuke', roundNumber: 1, scoreCt: 1, scoreT: 0 }),
    ]);
    expect(hours).toHaveLength(1);
    expect(hours[0]).toMatchObject({ lastRoundNumber: 2, scoreCt: 1, scoreT: 1 });
  });

  it('um lote sem rounds não gera nada', () => {
    expect(collectServerHours([])).toEqual([]);
  });
});
