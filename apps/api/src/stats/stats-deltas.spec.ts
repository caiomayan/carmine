import type {
  DamageEvent,
  EventBatch,
  KillEvent,
  RoundEndEvent,
  SessionEndEvent,
} from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { collectStats, type StatsDelta } from './stats-deltas.js';

const A = '76561198000000001';
const B = '76561198000000002';
const C = '76561198000000003';
const WEEK = '2026-10-12';
const AT = '2026-10-14T20:00:00-03:00';
const known = new Set([A, B, C]);

let seq = 0;
const id = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;

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

const damage = (over: Partial<DamageEvent> = {}): DamageEvent => ({
  id: id(),
  at: AT,
  warmup: false,
  attackerSteamId: A,
  victimIsBot: false,
  teamDamage: false,
  amount: 27,
  ...over,
});

const roundEnd = (over: Partial<RoundEndEvent> = {}): RoundEndEvent => ({
  id: id(),
  at: AT,
  warmup: false,
  winner: 'ct',
  players: [
    { steamId: A, team: 'ct' },
    { steamId: B, team: 't' },
  ],
  ...over,
});

const sessionEnd = (over: Partial<SessionEndEvent> = {}): SessionEndEvent => ({
  id: id(),
  at: '2026-10-14T21:00:00-03:00',
  sessionId: id(),
  steamId: A,
  startedAt: '2026-10-14T20:00:00-03:00',
  ...over,
});

function collect(events: Partial<EventBatch>, knownIds: ReadonlySet<string> = known) {
  return collectStats(
    { kills: [], damages: [], roundEnds: [], sessionStarts: [], sessionEnds: [], ...events },
    knownIds,
  );
}

const of = (steamId: string, over: Partial<StatsDelta>): StatsDelta => ({
  steamId,
  weekStart: WEEK,
  kills: 0,
  deaths: 0,
  assists: 0,
  headshots: 0,
  damage: 0,
  roundsPlayed: 0,
  roundsWon: 0,
  secondsPlayed: 0,
  ...over,
});

describe('kills', () => {
  it('conta kill (com headshot) para quem matou e morte para a vítima', () => {
    const { deltas, ignored } = collect({ kills: [kill({ headshot: true })] });

    expect(deltas).toHaveLength(2);
    expect(deltas).toEqual(
      expect.arrayContaining([of(A, { kills: 1, headshots: 1 }), of(B, { deaths: 1 })]),
    );
    expect(ignored).toBe(0);
  });

  it('conta a assistência de quem ajudou', () => {
    const { deltas } = collect({ kills: [kill({ assisterSteamId: C })] });

    expect(deltas).toContainEqual(of(C, { assists: 1 }));
  });

  it('o aquecimento não conta', () => {
    const { deltas, ignored } = collect({ kills: [kill({ warmup: true })] });

    expect(deltas).toEqual([]);
    expect(ignored).toBe(1);
  });

  it('bot como assassino ou vítima anula o evento para todos', () => {
    const botKiller = kill({ killerSteamId: null, killerIsBot: true, assisterSteamId: C });
    const botVictim = kill({ victimSteamId: null, victimIsBot: true, assisterSteamId: C });

    const { deltas, ignored } = collect({ kills: [botKiller, botVictim] });

    expect(deltas).toEqual([]);
    expect(ignored).toBe(2);
  });

  it('bot só na assistência tira só a assistência', () => {
    const { deltas } = collect({ kills: [kill({ assisterIsBot: true })] });

    expect(deltas).toHaveLength(2);
    expect(deltas).toEqual(expect.arrayContaining([of(A, { kills: 1 }), of(B, { deaths: 1 })]));
  });

  it('kill em aliado não conta kill nem morte, mas fica para a moderação', () => {
    const teamKill = kill({ teamKill: true, assisterSteamId: C });

    const { deltas, teamKills, ignored } = collect({ kills: [teamKill] });

    expect(deltas).toEqual([]);
    expect(ignored).toBe(1);
    expect(teamKills).toEqual([
      { id: teamKill.id, at: new Date(AT), killerSteamId: A, victimSteamId: B, weapon: 'ak47' },
    ]);
  });

  it('suicídio conta morte, não kill', () => {
    const { deltas, teamKills } = collect({
      kills: [kill({ killerSteamId: A, victimSteamId: A, teamKill: true })],
    });

    expect(deltas).toEqual([of(A, { deaths: 1 })]);
    expect(teamKills).toEqual([]);
  });

  it('o mundo (queda, bomba) conta só a morte', () => {
    const { deltas } = collect({ kills: [kill({ killerSteamId: null })] });

    expect(deltas).toEqual([of(B, { deaths: 1 })]);
  });

  it('Conta desconhecida não conta, e a outra ponta conta normalmente', () => {
    const { deltas } = collect({ kills: [kill()] }, new Set([B]));

    expect(deltas).toEqual([of(B, { deaths: 1 })]);
  });

  it('um evento que não rende nada a ninguém é ignorado', () => {
    const { deltas, ignored } = collect({ kills: [kill()] }, new Set());

    expect(deltas).toEqual([]);
    expect(ignored).toBe(1);
  });

  it('assistência do próprio assassino ou da vítima não vale', () => {
    const { deltas } = collect({
      kills: [kill({ assisterSteamId: A }), kill({ assisterSteamId: B })],
    });

    expect(deltas.every((d) => d.assists === 0)).toBe(true);
  });

  it('soma vários eventos do mesmo jogador na mesma semana', () => {
    const { deltas } = collect({ kills: [kill(), kill({ headshot: true })] });

    expect(deltas).toContainEqual(of(A, { kills: 2, headshots: 1 }));
  });

  it('separa por semana de Brasília', () => {
    const { deltas } = collect({
      kills: [kill({ at: '2026-10-18T23:59:00-03:00' }), kill({ at: '2026-10-19T00:01:00-03:00' })],
    });

    expect(deltas).toContainEqual(of(A, { kills: 1 }));
    expect(deltas).toContainEqual({ ...of(A, { kills: 1 }), weekStart: '2026-10-19' });
  });
});

describe('dano', () => {
  it('conta o dano em inimigo', () => {
    expect(collect({ damages: [damage(), damage({ amount: 100 })] }).deltas).toEqual([
      of(A, { damage: 127 }),
    ]);
  });

  it('bot, aliado e aquecimento ficam de fora', () => {
    const { deltas, ignored } = collect({
      damages: [
        damage({ victimIsBot: true }),
        damage({ teamDamage: true }),
        damage({ warmup: true }),
      ],
    });

    expect(deltas).toEqual([]);
    expect(ignored).toBe(3);
  });
});

describe('fim de round', () => {
  it('todos que jogaram o round jogaram; só o time vencedor venceu', () => {
    const { deltas } = collect({ roundEnds: [roundEnd()] });

    expect(deltas).toHaveLength(2);
    expect(deltas).toEqual(
      expect.arrayContaining([
        of(A, { roundsPlayed: 1, roundsWon: 1 }),
        of(B, { roundsPlayed: 1 }),
      ]),
    );
  });

  it('empate não dá vitória a ninguém', () => {
    const { deltas } = collect({ roundEnds: [roundEnd({ winner: 'none' })] });

    expect(deltas.every((d) => d.roundsWon === 0 && d.roundsPlayed === 1)).toBe(true);
  });

  it('quem aparece duas vezes na lista conta uma vez', () => {
    const { deltas } = collect({
      roundEnds: [
        roundEnd({
          players: [
            { steamId: A, team: 'ct' },
            { steamId: A, team: 'ct' },
          ],
        }),
      ],
    });

    expect(deltas).toEqual([of(A, { roundsPlayed: 1, roundsWon: 1 })]);
  });

  it('aquecimento não conta', () => {
    expect(collect({ roundEnds: [roundEnd({ warmup: true })] }).deltas).toEqual([]);
  });
});

describe('Sessão de jogo', () => {
  it('soma o tempo de início a fim no fim da Sessão', () => {
    expect(collect({ sessionEnds: [sessionEnd()] }).deltas).toEqual([
      of(A, { secondsPlayed: 3600 }),
    ]);
  });

  it('divide a Sessão que cruza a segunda-feira', () => {
    const { deltas } = collect({
      sessionEnds: [
        sessionEnd({ startedAt: '2026-10-18T23:30:00-03:00', at: '2026-10-19T00:30:00-03:00' }),
      ],
    });

    expect(deltas).toContainEqual(of(A, { secondsPlayed: 1800 }));
    expect(deltas).toContainEqual({ ...of(A, { secondsPlayed: 1800 }), weekStart: '2026-10-19' });
  });

  it('Sessão com mais de 24 h ou com fim antes do início é lixo', () => {
    const { deltas, ignored } = collect({
      sessionEnds: [
        sessionEnd({ startedAt: '2026-10-12T20:00:00-03:00', at: '2026-10-14T20:00:00-03:00' }),
        sessionEnd({ startedAt: '2026-10-14T21:00:00-03:00', at: '2026-10-14T20:00:00-03:00' }),
      ],
    });

    expect(deltas).toEqual([]);
    expect(ignored).toBe(2);
  });

  it('o início da Sessão é aceito e não é ignorado', () => {
    const { deltas, ignored } = collect({
      sessionStarts: [{ id: id(), at: AT, sessionId: id(), steamId: A }],
    });

    expect(deltas).toEqual([]);
    expect(ignored).toBe(0);
  });
});
