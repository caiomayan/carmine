import type { EventBatch } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  affectedRounds,
  rebuildRound,
  roundEventMonths,
  toRoundEventRows,
} from './round-events.js';
import { summarizeRound } from './round-summary.js';

const STEAM_A = '76561198000000001';
const STEAM_B = '76561198000000002';
const STEAM_D = '76561198000000004';
const STEAM_STRANGER = '76561198000000009';
const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_D = '44444444-4444-4444-8444-444444444444';
const SERVER = '99999999-9999-4999-8999-999999999999';
const PLAY_ID = '0199f2a0-7b1c-7000-8000-000000000099';
const NOW = new Date('2026-10-29T20:00:00Z');
const T0 = NOW.getTime() - 60_000;
const isoAt = (ms: number) => new Date(T0 + ms).toISOString();

const accountBySteamId = new Map([
  [STEAM_A, ACCOUNT_A],
  [STEAM_B, ACCOUNT_B],
  [STEAM_D, ACCOUNT_D],
]);
const context = { serverId: SERVER, accountBySteamId, now: NOW };

let seq = 0;
const id = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;

const round = { mapPlayId: PLAY_ID, roundNumber: 3 };

const batch = (over: Partial<EventBatch> = {}): EventBatch => ({
  kills: [],
  damages: [],
  roundEnds: [],
  sessionStarts: [],
  sessionEnds: [],
  ...over,
});

const kill = (
  killer: string | null,
  victim: string | null,
  ms: number,
  over: Partial<EventBatch['kills'][number]> = {},
): EventBatch['kills'][number] => ({
  id: id(),
  at: isoAt(ms),
  atMs: T0 + ms,
  warmup: false,
  killerSteamId: killer,
  killerIsBot: false,
  victimSteamId: victim,
  victimIsBot: false,
  assisterSteamId: null,
  assisterIsBot: false,
  headshot: false,
  weapon: 'ak47',
  teamKill: false,
  killerTeam: 'ct',
  victimTeam: 't',
  ...round,
  ...over,
});

const start = (
  players: { steamId: string; team: 'ct' | 't' }[],
  over: Partial<NonNullable<EventBatch['roundStarts']>[number]> = {},
): NonNullable<EventBatch['roundStarts']>[number] => ({
  id: id(),
  at: isoAt(0),
  atMs: T0,
  warmup: false,
  ...round,
  map: 'de_mirage',
  players: players.map((p) => ({ ...p, equipmentValue: 4000 })),
  botsCt: 0,
  botsT: 0,
  ...over,
});

const end = (
  over: Partial<EventBatch['roundEnds'][number]> = {},
): EventBatch['roundEnds'][number] => ({
  id: id(),
  at: isoAt(30_000),
  atMs: T0 + 30_000,
  warmup: false,
  winner: 'ct',
  players: [],
  ...round,
  reason: 'elimination',
  durationMs: 30_000,
  scoreCt: 4,
  scoreT: 2,
  ...over,
});

describe('toRoundEventRows · o que vira linha bruta', () => {
  it('o plugin atual (sem mapPlayId) e o aquecimento não geram nenhuma linha', () => {
    const { mapPlayId: _m, roundNumber: _r, ...legacy } = kill(STEAM_A, STEAM_D, 1000);
    expect(
      toRoundEventRows(
        batch({ kills: [legacy, kill(STEAM_A, STEAM_D, 2000, { warmup: true })] }),
        context,
      ),
    ).toEqual([]);
  });

  it('uma kill vira uma linha com as Contas nas colunas e nenhum SteamID em lugar nenhum', () => {
    const [row, ...rest] = toRoundEventRows(
      batch({
        kills: [kill(STEAM_A, STEAM_D, 1000, { assisterSteamId: STEAM_B, flashAssist: true })],
      }),
      context,
    );
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      seq: 0,
      kind: 'kill',
      serverId: SERVER,
      mapPlayId: PLAY_ID,
      roundNumber: 3,
      atMs: T0 + 1000,
      actorAccountId: ACCOUNT_A,
      targetAccountId: ACCOUNT_D,
      assistAccountId: ACCOUNT_B,
    });
    expect(row?.payload).toMatchObject({ weapon: 'ak47', flashAssist: true, victimTeam: 't' });
    expect(JSON.stringify(row)).not.toMatch(/7656119/);
  });

  it('um SteamID fora do mapa de Contas fica sem referência, sem virar bot', () => {
    // A ingestão cria a Conta de todo humano antes; isto só garante que a linha não inventa nada.
    const [row] = toRoundEventRows(
      batch({ kills: [kill(STEAM_STRANGER, STEAM_D, 1000)] }),
      context,
    );
    expect(row).toMatchObject({ actorAccountId: null, targetAccountId: ACCOUNT_D });
    expect(row?.payload).not.toHaveProperty('killerUnknown');
    expect(row?.payload).toMatchObject({ killerIsBot: false });
  });

  it('o início do round vira o evento e uma linha por jogador com Conta', () => {
    const rows = toRoundEventRows(
      batch({
        roundStarts: [
          start(
            [
              { steamId: STEAM_A, team: 'ct' },
              { steamId: STEAM_B, team: 'ct' },
              { steamId: STEAM_D, team: 't' },
            ],
            { botsCt: 1 },
          ),
        ],
      }),
      context,
    );
    expect(rows.map((r) => [r.kind, r.seq])).toEqual([
      ['round_start', 0],
      ['round_player', 1],
      ['round_player', 2],
      ['round_player', 3],
    ]);
    expect(rows[0]?.payload).toMatchObject({ map: 'de_mirage', botsCt: 1, botsT: 0 });
    expect(rows[1]).toMatchObject({ actorAccountId: ACCOUNT_A });
    expect(rows[1]?.payload).toEqual({ team: 'ct', equipmentValue: 4000 });
  });

  it('o fim do round guarda os vivos como linhas, e lembra se a lista veio', () => {
    const withList = toRoundEventRows(batch({ roundEnds: [end({ alive: [STEAM_A] })] }), context);
    expect(withList.map((r) => r.kind)).toEqual(['round_end', 'round_alive']);
    expect(withList[0]?.payload).toMatchObject({
      aliveKnown: true,
      scoreCt: 4,
      reason: 'elimination',
    });
    const without = toRoundEventRows(batch({ roundEnds: [end()] }), context);
    expect(without).toHaveLength(1);
    expect(without[0]?.payload).toMatchObject({ aliveKnown: false });
  });

  it('a bomba leva quem e o bomb site', () => {
    const [row] = toRoundEventRows(
      batch({
        bombs: [
          {
            id: id(),
            at: isoAt(5000),
            warmup: false,
            ...round,
            kind: 'plant',
            steamId: STEAM_D,
            site: 'b',
          },
        ],
      }),
      context,
    );
    expect(row).toMatchObject({ kind: 'bomb', actorAccountId: ACCOUNT_D });
    expect(row?.payload).toEqual({ kind: 'plant', site: 'b' });
  });

  it('evento mais velho que 12 meses ou de mais de um dia no futuro não é guardado', () => {
    const old = kill(STEAM_A, STEAM_D, 0, { at: '2025-10-01T00:00:00Z' });
    const future = kill(STEAM_A, STEAM_D, 0, { at: '2026-11-05T00:00:00Z' });
    const edge = kill(STEAM_A, STEAM_D, 0, { at: '2025-10-30T00:00:00Z' });
    const events = batch({ kills: [old, future, edge] });
    expect(toRoundEventRows(events, context).map((r) => r.id)).toEqual([edge.id]);
    expect(roundEventMonths(events, NOW)).toHaveLength(1);
  });
});

describe('affectedRounds', () => {
  it('um round por (mapa, número), com a janela de uma hora em volta dos eventos', () => {
    const rows = toRoundEventRows(
      batch({
        kills: [kill(STEAM_A, STEAM_D, 1000), kill(STEAM_A, STEAM_B, 3000)],
        damages: [],
      }),
      context,
    );
    const [only, ...others] = affectedRounds(rows);
    expect(others).toEqual([]);
    expect(only).toMatchObject({ mapPlayId: PLAY_ID, roundNumber: 3 });
    expect(only?.from.getTime()).toBe(T0 + 1000 - 3_600_000);
    expect(only?.to.getTime()).toBe(T0 + 3000 + 3_600_000);
  });
});

describe('rebuildRound · a ida e a volta até a calculadora', () => {
  const full = () =>
    toRoundEventRows(
      batch({
        roundStarts: [
          start([
            { steamId: STEAM_A, team: 'ct' },
            { steamId: STEAM_B, team: 'ct' },
            { steamId: STEAM_D, team: 't' },
          ]),
        ],
        damages: [
          {
            id: id(),
            at: isoAt(900),
            atMs: T0 + 900,
            warmup: false,
            ...round,
            attackerSteamId: STEAM_B,
            victimSteamId: STEAM_D,
            victimIsBot: false,
            teamDamage: false,
            amount: 60,
            healthDamage: 60,
          },
        ],
        kills: [kill(STEAM_A, STEAM_D, 1000, { killerTeam: 'ct', victimTeam: 't' })],
        roundEnds: [end({ alive: [STEAM_A, STEAM_B] })],
      }),
      context,
    );

  it('sem o fim do round não há o que calcular', () => {
    expect(
      rebuildRound(full().filter((r) => r.kind !== 'round_end' && r.kind !== 'round_alive')),
    ).toBeNull();
  });

  it('a calculadora dá o mesmo resumo que daria com os eventos originais', () => {
    const rebuilt = rebuildRound(full());
    expect(rebuilt).not.toBeNull();
    const summary = rebuilt && summarizeRound(rebuilt.input);
    expect(summary).toMatchObject({
      mapPlayId: PLAY_ID,
      roundNumber: 3,
      map: 'de_mirage',
      winner: 'ct',
    });
    const byAccount = Object.fromEntries((summary?.players ?? []).map((p) => [p.steamId, p]));
    expect(byAccount[ACCOUNT_A]).toMatchObject({
      side: 'ct',
      kills: 1,
      openingKill: true,
      survived: true,
    });
    expect(byAccount[ACCOUNT_B]).toMatchObject({ assists: 1, damage: 60, equipmentValue: 4000 });
    expect(byAccount[ACCOUNT_D]).toMatchObject({
      side: 't',
      deaths: 1,
      openingDeath: true,
      survived: false,
    });
    expect(rebuilt?.meta).toMatchObject({ map: 'de_mirage', scoreCt: 4, scoreT: 2 });
  });
});
