import type { DamageEvent, KillEvent, RoundEndEvent, RoundStartEvent } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  type PlayerRoundSummary,
  type RoundSummary,
  summarizeRound,
  TRADE_WINDOW_MS,
} from './round-summary.js';

// Três contra três: A, B e C são CT; D, E e F são T.
const A = '76561198000000001';
const B = '76561198000000002';
const C = '76561198000000003';
const D = '76561198000000004';
const E = '76561198000000005';
const F = '76561198000000006';
const LATE = '76561198000000009';
const PLAY_ID = '0199f2a0-7b1c-7000-8000-000000000099';

const T0 = Date.parse('2026-10-28T20:00:00-03:00');
const isoAt = (ms: number) => new Date(T0 + ms).toISOString();

let seq = 0;
const id = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;

const side = (steamId: string) => ([A, B, C].includes(steamId) ? 'ct' : 't');

/** Uma kill de `killer` em `victim`, `ms` depois da abertura do round. */
const kill = (
  killer: string | null,
  victim: string | null,
  ms: number,
  over: Partial<KillEvent> = {},
): KillEvent => ({
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
  killerTeam: killer === null ? null : side(killer),
  victimTeam: victim === null ? null : side(victim),
  ...over,
});

const hit = (
  attacker: string,
  victim: string,
  amount: number,
  ms: number,
  over: Partial<DamageEvent> = {},
): DamageEvent => ({
  id: id(),
  at: isoAt(ms),
  atMs: T0 + ms,
  warmup: false,
  attackerSteamId: attacker,
  victimSteamId: victim,
  victimIsBot: false,
  teamDamage: false,
  amount,
  ...over,
});

const start = (over: Partial<RoundStartEvent> = {}): RoundStartEvent => ({
  id: id(),
  at: isoAt(0),
  atMs: T0,
  warmup: false,
  mapPlayId: PLAY_ID,
  roundNumber: 5,
  map: 'de_mirage',
  players: [A, B, C, D, E, F].map((steamId) => ({
    steamId,
    team: side(steamId) as 'ct' | 't',
    equipmentValue: side(steamId) === 'ct' ? 4750 : 3900,
  })),
  botsCt: 0,
  botsT: 0,
  ...over,
});

const end = (over: Partial<RoundEndEvent> = {}): RoundEndEvent => ({
  id: id(),
  at: isoAt(30_000),
  atMs: T0 + 30_000,
  warmup: false,
  winner: 'ct',
  players: [],
  mapPlayId: PLAY_ID,
  roundNumber: 5,
  reason: 'elimination',
  durationMs: 30_000,
  ...over,
});

interface Scenario {
  kills?: KillEvent[];
  damages?: DamageEvent[];
  start?: RoundStartEvent | null;
  end?: RoundEndEvent;
}

const run = (scenario: Scenario): RoundSummary => {
  const summary = summarizeRound({
    start: scenario.start === undefined ? start() : scenario.start,
    kills: scenario.kills ?? [],
    damages: scenario.damages ?? [],
    end: scenario.end ?? end(),
  });
  if (summary === null) throw new Error('o round deveria ter resumo');
  return summary;
};

const player = (summary: RoundSummary, steamId: string): PlayerRoundSummary => {
  const found = summary.players.find((p) => p.steamId === steamId);
  if (!found) throw new Error(`sem resumo para ${steamId}`);
  return found;
};

describe('summarizeRound · o round todo', () => {
  it('leva o mapa jogado, o número, o mapa, o vencedor, o motivo e a duração', () => {
    expect(run({})).toMatchObject({
      mapPlayId: PLAY_ID,
      roundNumber: 5,
      map: 'de_mirage',
      winner: 'ct',
      reason: 'elimination',
      durationMs: 30_000,
    });
  });

  it('um resumo por humano do round, com o lado e o valor do equipamento da abertura', () => {
    const summary = run({});
    expect(summary.players.map((p) => p.steamId)).toEqual([A, B, C, D, E, F]);
    expect(player(summary, A)).toMatchObject({ side: 'ct', equipmentValue: 4750 });
    expect(player(summary, D)).toMatchObject({ side: 't', equipmentValue: 3900 });
  });

  it('sem round_start (plugin antigo) usa os jogadores do fim do round, sem equipamento', () => {
    const summary = run({
      start: null,
      end: end({
        players: [
          { steamId: A, team: 'ct' },
          { steamId: D, team: 't' },
        ],
      }),
    });
    expect(summary.players).toHaveLength(2);
    expect(player(summary, A)).toMatchObject({ side: 'ct', equipmentValue: null });
    expect(summary.map).toBeNull();
  });
});

describe('summarizeRound · o que não gera resumo', () => {
  it('aquecimento: nem no início nem no fim', () => {
    expect(
      summarizeRound({ start: start(), kills: [], damages: [], end: end({ warmup: true }) }),
    ).toBeNull();
    expect(
      summarizeRound({ start: start({ warmup: true }), kills: [], damages: [], end: end() }),
    ).toBeNull();
  });

  it('round sintético do cs2-retakes: sem humanos dos dois lados', () => {
    const onlyCt = start({
      players: [A, B, C].map((steamId) => ({ steamId, team: 'ct', equipmentValue: 4750 })),
      botsT: 3,
    });
    expect(summarizeRound({ start: onlyCt, kills: [], damages: [], end: end() })).toBeNull();
    const empty = start({ players: [], botsCt: 5, botsT: 5 });
    expect(summarizeRound({ start: empty, kills: [], damages: [], end: end() })).toBeNull();
    // Sem round_start, vale o mesmo para os jogadores do fim do round.
    expect(
      summarizeRound({
        start: null,
        kills: [],
        damages: [],
        end: end({ players: [{ steamId: A, team: 'ct' }] }),
      }),
    ).toBeNull();
  });

  it('kills e danos em aquecimento são ignorados', () => {
    const summary = run({
      kills: [kill(A, D, 1000, { warmup: true })],
      damages: [hit(A, D, 50, 900, { warmup: true })],
    });
    expect(player(summary, A)).toMatchObject({ kills: 0, damage: 0 });
    expect(player(summary, D)).toMatchObject({ deaths: 0, survived: true });
  });
});

describe('summarizeRound · kills, mortes e abertura', () => {
  it('conta kills, headshots e mortes; a abertura é a primeira kill do round', () => {
    const summary = run({
      kills: [kill(A, D, 5000, { headshot: true }), kill(E, B, 9000), kill(A, E, 12_000)],
      end: end({ alive: [A, C, F] }),
    });
    expect(player(summary, A)).toMatchObject({
      kills: 2,
      headshots: 1,
      deaths: 0,
      openingKill: true,
      openingDeath: false,
    });
    expect(player(summary, D)).toMatchObject({ deaths: 1, openingKill: false, openingDeath: true });
    expect(player(summary, B)).toMatchObject({ deaths: 1, openingDeath: false });
    expect(player(summary, E)).toMatchObject({ kills: 1, deaths: 1, openingKill: false });
    expect(summary.players.filter((p) => p.openingKill || p.openingDeath)).toHaveLength(2);
  });

  it('a ordem vem do horário, não da posição na lista', () => {
    const summary = run({
      kills: [kill(E, B, 9000), kill(A, D, 5000)],
    });
    expect(player(summary, A).openingKill).toBe(true);
    expect(player(summary, B).openingDeath).toBe(false);
  });

  it('sem atMs, usa o horário `at` do evento', () => {
    const noMs = (e: KillEvent): KillEvent => ({ ...e, atMs: undefined });
    const summary = run({ kills: [noMs(kill(E, B, 9000)), noMs(kill(A, D, 5000))] });
    expect(player(summary, A).openingKill).toBe(true);
  });

  it('suicídio e queda contam a morte, mas não são abertura nem kill', () => {
    const summary = run({
      kills: [kill(A, A, 2000), kill(null, B, 3000), kill(D, C, 4000)],
    });
    expect(player(summary, A)).toMatchObject({ kills: 0, deaths: 1, openingDeath: false });
    expect(player(summary, B)).toMatchObject({ deaths: 1, survived: false, openingDeath: false });
    expect(player(summary, D)).toMatchObject({ kills: 1, openingKill: true });
    expect(player(summary, C)).toMatchObject({ openingDeath: true });
  });

  it('kill em aliado não conta kill nem morte, mas a vítima não sobreviveu', () => {
    const summary = run({ kills: [kill(A, B, 2000, { teamKill: true, victimTeam: 'ct' })] });
    expect(player(summary, A)).toMatchObject({ kills: 0, openingKill: false });
    expect(player(summary, B)).toMatchObject({ deaths: 0, survived: false, openingDeath: false });
  });

  it('bot como assassino ou vítima não conta kill nem morte (ADR 0018)', () => {
    const summary = run({
      kills: [
        kill(A, null, 1000, { victimIsBot: true, victimTeam: 't' }),
        kill(null, D, 2000, { killerIsBot: true, killerTeam: 'ct', victimTeam: 't' }),
        kill(null, B, 3000, { killerIsBot: true, killerTeam: 't', victimTeam: 'ct' }),
      ],
    });
    expect(player(summary, A)).toMatchObject({ kills: 0, openingKill: false });
    expect(player(summary, D)).toMatchObject({ deaths: 0 });
    expect(player(summary, B)).toMatchObject({ deaths: 0, survived: false });
  });

  it('jogador que entrou depois da abertura não tem resumo e não atrapalha ninguém', () => {
    const summary = run({ kills: [kill(LATE, D, 2000, { killerTeam: 'ct' }), kill(A, E, 3000)] });
    expect(summary.players.map((p) => p.steamId)).not.toContain(LATE);
    expect(player(summary, A).kills).toBe(1);
  });
});

describe('summarizeRound · multi-kill', () => {
  it('3 kills no round dão multi-kill de 3', () => {
    const summary = run({
      kills: [kill(A, D, 5000), kill(A, E, 6000), kill(A, F, 7000)],
    });
    expect(player(summary, A)).toMatchObject({ kills: 3, multiKill: 3 });
  });

  it('1 kill não é multi-kill, e o 5k é o teto', () => {
    expect(player(run({ kills: [kill(A, D, 5000)] }), A).multiKill).toBeNull();
    const five = start({
      players: [
        { steamId: A, team: 'ct', equipmentValue: 5000 },
        ...[D, E, F, '76561198000000007', '76561198000000008'].map((steamId) => ({
          steamId,
          team: 't' as const,
          equipmentValue: 1000,
        })),
      ],
    });
    const kills = [D, E, F, '76561198000000007', '76561198000000008'].map((v, i) =>
      kill(A, v, 1000 * (i + 1), { victimTeam: 't' }),
    );
    expect(player(run({ start: five, kills }), A)).toMatchObject({ kills: 5, multiKill: 5 });
  });
});

describe('summarizeRound · trocado em até 5 s', () => {
  it('o matador morre 4 s depois pelas mãos de um aliado: foi trocado', () => {
    const summary = run({ kills: [kill(D, A, 10_000), kill(B, D, 14_000)] });
    expect(player(summary, A)).toMatchObject({ deaths: 1, survived: false, traded: true });
    expect(player(summary, A).kast).toBe(true);
  });

  it('exatamente 5 s ainda é troca', () => {
    expect(TRADE_WINDOW_MS).toBe(5000);
    const summary = run({ kills: [kill(D, A, 10_000), kill(B, D, 15_000)] });
    expect(player(summary, A).traded).toBe(true);
  });

  it('o matador morre 6 s depois: não foi trocado, e sem mais nada o KAST do round é falso', () => {
    const summary = run({ kills: [kill(D, A, 10_000), kill(B, D, 16_000)] });
    expect(player(summary, A)).toMatchObject({ traded: false, kast: false });
  });

  it('o matador morrer ANTES da vítima não é troca', () => {
    const summary = run({ kills: [kill(B, D, 9000), kill(D, A, 10_000)] });
    expect(player(summary, A).traded).toBe(false);
  });

  it('o matador morrer por queda ou bomba (sem assassino) ou por um aliado dele não é troca', () => {
    const fall = run({ kills: [kill(D, A, 10_000), kill(null, D, 11_000)] });
    expect(player(fall, A).traded).toBe(false);
    const friendly = run({
      kills: [kill(D, A, 10_000), kill(E, D, 11_000, { teamKill: true, victimTeam: 't' })],
    });
    expect(player(friendly, A).traded).toBe(false);
  });

  it('morte por suicídio não é trocada', () => {
    expect(player(run({ kills: [kill(A, A, 1000)] }), A).traded).toBe(false);
  });

  it('o matador que se suicida depois não deixou a morte trocada: o aliado não o matou', () => {
    const summary = run({ kills: [kill(D, A, 10_000), kill(D, D, 12_000, { victimTeam: 't' })] });
    expect(player(summary, A).traded).toBe(false);
  });

  it('bot nunca troca: nem como matador (não há quem vingar) nem como quem vinga', () => {
    // O matador é um bot: a morte de A não pode ser trocada, mesmo que um aliado mate um bot depois.
    const botKiller = run({
      kills: [
        kill(null, A, 10_000, { killerIsBot: true, killerTeam: 't', victimTeam: 'ct' }),
        kill(B, null, 12_000, { victimIsBot: true, victimTeam: 't' }),
      ],
    });
    expect(player(botKiller, A).traded).toBe(false);
    // Quem mata o matador é um bot aliado: a kill de um bot não conta (ADR 0018), então não troca.
    const botAvenger = run({
      kills: [
        kill(D, A, 10_000),
        kill(null, D, 12_000, { killerIsBot: true, killerTeam: 'ct', victimTeam: 't' }),
      ],
    });
    expect(player(botAvenger, A).traded).toBe(false);
  });
});

describe('summarizeRound · assistências e flash assists', () => {
  it('com menos de 40 de dano não é assistência', () => {
    const summary = run({
      damages: [hit(A, D, 39, 4000)],
      kills: [kill(B, D, 5000)],
    });
    expect(player(summary, A)).toMatchObject({ assists: 0, damage: 39 });
  });

  it('com 40 de dano é assistência, mesmo somando vários acertos', () => {
    const summary = run({
      damages: [hit(A, D, 20, 3000), hit(A, D, 20, 4000)],
      kills: [kill(B, D, 5000)],
    });
    expect(player(summary, A)).toMatchObject({ assists: 1, kast: true });
    expect(player(summary, B).assists).toBe(0);
  });

  it('o dano depois da morte ou em outra vítima não vale para a assistência', () => {
    const summary = run({
      damages: [hit(A, D, 30, 3000), hit(A, E, 30, 3500), hit(A, D, 30, 6000)],
      kills: [kill(B, D, 5000)],
    });
    expect(player(summary, A).assists).toBe(0);
  });

  it('dois aliados com 40 ou mais assistem a mesma kill', () => {
    const summary = run({
      damages: [hit(A, D, 45, 3000), hit(C, D, 40, 4000)],
      kills: [kill(B, D, 5000)],
    });
    expect(player(summary, A).assists).toBe(1);
    expect(player(summary, C).assists).toBe(1);
  });

  it('o dano de um inimigo da equipe do assassino não gera assistência', () => {
    const summary = run({
      damages: [hit(E, D, 60, 3000, { teamDamage: true })],
      kills: [kill(A, D, 5000)],
    });
    expect(player(summary, E)).toMatchObject({ assists: 0, damage: 0 });
  });

  it('flash assist conta como flash assist e não como assistência em dobro', () => {
    const summary = run({
      damages: [hit(B, D, 55, 3000)],
      kills: [kill(A, D, 5000, { assisterSteamId: B, flashAssist: true })],
    });
    expect(player(summary, B)).toMatchObject({ flashAssists: 1, assists: 0, kast: true });
  });

  it('assistência do jogo sem flash e sem 40 de dano não conta', () => {
    const summary = run({
      damages: [hit(B, D, 10, 3000)],
      kills: [kill(A, D, 5000, { assisterSteamId: B, flashAssist: false })],
    });
    expect(player(summary, B)).toMatchObject({ flashAssists: 0, assists: 0 });
  });
});

describe('summarizeRound · dano limitado pela vida da vítima', () => {
  it('a soma de acertos acima da vida é cortada em 100 por vítima', () => {
    const summary = run({
      damages: [hit(A, D, 90, 3000), hit(B, D, 120, 4000)],
      kills: [kill(B, D, 4000)],
    });
    expect(player(summary, A).damage).toBe(90);
    expect(player(summary, B).damage).toBe(10);
  });

  it('um acerto bruto de 150 num de 100 de vida vale 100', () => {
    expect(player(run({ damages: [hit(A, D, 150, 3000)] }), A).damage).toBe(100);
  });

  it('usa o dano limitado que o plugin mandou, e nunca passa de 100 por vítima', () => {
    const summary = run({
      damages: [
        hit(A, D, 150, 3000, { healthDamage: 100 }),
        hit(B, D, 80, 3500, { healthDamage: 80 }),
        hit(A, E, 150, 4000, { healthDamage: 60 }),
      ],
    });
    expect(player(summary, A).damage).toBe(100 + 60);
    expect(player(summary, B).damage).toBe(0);
  });

  it('dano em aliado ou em bot não entra', () => {
    const summary = run({
      damages: [
        hit(A, B, 40, 1000, { teamDamage: true }),
        hit(A, D, 40, 1000, { victimIsBot: true }),
        hit(A, E, 40, 1000),
      ],
    });
    expect(player(summary, A).damage).toBe(40);
  });
});

describe('summarizeRound · sobreviveu', () => {
  it('sem round_end.alive, sobrevive quem não morreu', () => {
    const summary = run({ kills: [kill(D, A, 5000)] });
    expect(player(summary, A).survived).toBe(false);
    expect(player(summary, B).survived).toBe(true);
  });

  it('com round_end.alive, vale a lista (quem saiu do servidor não sobreviveu)', () => {
    const summary = run({ end: end({ alive: [A, B] }) });
    expect(player(summary, A).survived).toBe(true);
    expect(player(summary, C).survived).toBe(false);
  });
});

describe('summarizeRound · clutch', () => {
  /** A mata F, e depois D e E matam B e C: A fica sozinho contra 2. */
  const oneVsTwo = (): KillEvent[] => [kill(A, F, 3000), kill(D, B, 6000), kill(E, C, 8000)];

  it('1v2 vencido: o último vivo do time contra 2 e o time venceu', () => {
    const summary = run({
      kills: [...oneVsTwo(), kill(A, D, 12_000), kill(A, E, 15_000)],
      end: end({ winner: 'ct', alive: [A] }),
    });
    expect(player(summary, A)).toMatchObject({
      clutch: { against: 2, won: true },
      kills: 3,
      multiKill: 3,
      survived: true,
    });
    expect(player(summary, B).clutch).toBeNull();
    expect(player(summary, D).clutch).toBeNull();
  });

  it('1v2 perdido: o time perdeu', () => {
    const summary = run({
      kills: [...oneVsTwo(), kill(D, A, 12_000)],
      end: end({ winner: 't', alive: [D, E] }),
    });
    expect(player(summary, A).clutch).toEqual({ against: 2, won: false });
    expect(player(summary, A).survived).toBe(false);
  });

  it('o clutch vencido não exige estar vivo: o T sozinho morre e a bomba explode', () => {
    const summary = run({
      kills: [
        kill(D, C, 1000),
        kill(B, E, 2000),
        kill(A, F, 3000),
        // D é o último T vivo contra A e B, e morre; a bomba (já plantada) explode.
        kill(B, D, 9000),
      ],
      end: end({ winner: 't', reason: 'bomb_exploded', alive: [A, B] }),
    });
    expect(player(summary, D)).toMatchObject({
      survived: false,
      clutch: { against: 2, won: true },
    });
  });

  it('o mesmo vale para o CT: morre, mas o time vence o round', () => {
    const summary = run({
      kills: [...oneVsTwo(), kill(A, D, 12_000), kill(E, A, 14_000)],
      end: end({ winner: 'ct', reason: 'time' }),
    });
    expect(player(summary, A).clutch).toEqual({ against: 2, won: true });
  });

  it('o clutch também vale para o lado T', () => {
    const summary = run({
      kills: [
        kill(D, C, 1000),
        kill(B, E, 2000),
        // F cai e D fica sozinho contra A e B.
        kill(A, F, 3000),
        kill(D, B, 9000),
        kill(D, A, 12_000),
      ],
      end: end({ winner: 't', alive: [D] }),
    });
    expect(player(summary, D).clutch).toEqual({ against: 2, won: true });
    // Depois que D mata B, A é o último CT vivo, e perde o 1v1.
    expect(player(summary, A).clutch).toEqual({ against: 1, won: false });
  });

  it('o N é o de quando ficou sozinho (1v3), e os dois lados podem ter clutch no mesmo round', () => {
    const summary = run({
      kills: [
        kill(D, B, 2000),
        kill(E, C, 3000),
        kill(A, D, 4000),
        kill(A, E, 5000),
        // F é o último T vivo contra A.
        kill(A, F, 6000),
      ],
      end: end({ winner: 'ct', alive: [A] }),
    });
    expect(player(summary, A).clutch).toEqual({ against: 3, won: true });
    expect(player(summary, F).clutch).toEqual({ against: 1, won: false });
    expect(player(summary, B).clutch).toBeNull();
  });

  it('um time inteiro de 1 humano contra mais não é clutch: não houve morte de aliado', () => {
    const solo = start({
      players: [
        { steamId: A, team: 'ct', equipmentValue: 4750 },
        { steamId: D, team: 't', equipmentValue: 3900 },
        { steamId: E, team: 't', equipmentValue: 3900 },
      ],
    });
    const summary = run({ start: solo, kills: [kill(A, D, 2000), kill(A, E, 3000)] });
    expect(player(summary, A).clutch).toBeNull();
  });

  it('bot no time conta como vivo: o humano só fica sozinho quando o bot morre', () => {
    const withBot = start({
      players: [
        { steamId: A, team: 'ct', equipmentValue: 4750 },
        { steamId: D, team: 't', equipmentValue: 3900 },
        { steamId: E, team: 't', equipmentValue: 3900 },
      ],
      botsCt: 1,
    });
    const summary = run({
      start: withBot,
      kills: [kill(D, null, 4000, { victimIsBot: true, victimTeam: 'ct' }), kill(A, D, 7000)],
      end: end({ winner: 'ct', alive: [A] }),
    });
    expect(player(summary, A).clutch).toEqual({ against: 2, won: true });
    // A kill do bot não conta para ninguém.
    expect(player(summary, D)).toMatchObject({ kills: 0, deaths: 1 });
  });
});

describe('summarizeRound · KAST', () => {
  it('kill, assistência, sobreviveu ou trocado; senão falso', () => {
    const summary = run({
      damages: [hit(C, E, 50, 2000)],
      kills: [
        kill(A, D, 1000), // A: kill
        kill(E, B, 3000), // B: morreu sem nada
        kill(F, C, 4000), // C: morreu, mas já tinha assistido a morte de E
        kill(A, E, 5000),
      ],
      end: end({ winner: 'ct', alive: [A] }),
    });
    expect(player(summary, A).kast).toBe(true); // kill e sobreviveu
    expect(player(summary, C).kast).toBe(true); // assistência (50 de dano em E) antes de morrer
    expect(player(summary, B).kast).toBe(true); // trocado: E morreu 2 s depois, por A
    expect(player(summary, F).kast).toBe(true); // matou C
  });

  it('morreu, sem kill, sem assistência e sem troca: fora do KAST', () => {
    const summary = run({ kills: [kill(D, B, 5000)], end: end({ winner: 't', alive: [D, E, F] }) });
    expect(player(summary, B).kast).toBe(false);
    expect(player(summary, D).kast).toBe(true);
  });
});
