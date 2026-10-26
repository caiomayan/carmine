import type { EventBatch, ServerHeartbeat } from '@carmine/contracts';
import { type DemoServer, playersOf } from './demo-cast.js';
import { between, pick, type Random } from './demo-random.js';

const WEAPONS = [
  'ak47',
  'm4a1',
  'm4a1_silencer',
  'awp',
  'deagle',
  'usp_silencer',
  'glock',
  'famas',
  'galilar',
  'mp9',
  'p250',
  'ssg08',
] as const;

const MAP_MINUTES = { min: 12, max: 20 } as const;

interface Session {
  sessionId: string;
  startedAt: Date;
}

/** O que o simulador sabe de um servidor fictício entre um batimento e o seguinte. */
export interface SimServer {
  def: DemoServer;
  /** SteamID64 conectados → a Sessão de jogo de cada um. */
  present: Map<string, Session>;
  target: number;
  map: string;
  mapChangesAt: number;
  /** Quando sai o próximo round (Retake) ou o próximo punhado de abates (Deathmatch). */
  nextActionAt: number;
  /** O placar de times do Retake (zera a cada mapa) e os números de cada jogador no servidor. */
  match: { played: number; ct: number; t: number };
  board: Map<string, { team: 'ct' | 't' | null; kills: number; deaths: number; score: number }>;
}

export interface Tick {
  heartbeat: ServerHeartbeat;
  /** Nulo quando nada aconteceu neste batimento. */
  batch: EventBatch | null;
}

export function createSimServer(def: DemoServer, now: Date, random: Random): SimServer {
  return {
    def,
    present: new Map(),
    target: Math.floor(between(random, def.online.min, def.online.max + 1)),
    map: pick(random, def.maps),
    mapChangesAt: now.getTime() + minutes(random, MAP_MINUTES),
    nextActionAt: now.getTime() + between(random, 5_000, 20_000),
    match: { played: 0, ct: 0, t: 0 },
    board: new Map(),
  };
}

const minutes = (random: Random, range: { min: number; max: number }) =>
  between(random, range.min, range.max) * 60_000;

/**
 * Um passo do servidor fictício (a cada ~10 s): quem entra e sai, o mapa, e, quando é a hora, um
 * round ou um punhado de abates. Tudo o que o Carmine.Core mandaria: um batimento e um lote de
 * eventos. `newId` gera os IDs dos eventos e das Sessões (UUID).
 */
export function tick(state: SimServer, now: Date, random: Random, newId: () => string): Tick {
  const batch = emptyBatch();
  moveMembers(state, now, random, newId, batch);

  if (now.getTime() >= state.mapChangesAt) {
    state.map = pick(
      random,
      state.def.maps.filter((map) => map !== state.map),
    );
    state.mapChangesAt = now.getTime() + minutes(random, MAP_MINUTES);
    // Mapa novo: o placar de times e os números do placar recomeçam.
    state.match = { played: 0, ct: 0, t: 0 };
    for (const row of state.board.values()) Object.assign(row, { kills: 0, deaths: 0, score: 0 });
  }

  if (now.getTime() >= state.nextActionAt && state.present.size >= 2) {
    if (state.def.mode === 'retake') playRetakeRound(state, now, random, newId, batch);
    else playDeathmatchBurst(state, now, random, newId, batch);
  }

  const retake = state.def.mode === 'retake';
  const heartbeat: ServerHeartbeat = {
    map: state.map,
    players: [...state.present.keys()],
    maxPlayers: state.def.maxPlayers,
    // Como o Carmine.Core: placar de times só no Retake, placar por jogador nos dois Modos.
    match: retake
      ? {
          round: state.match.played + 1,
          ctScore: state.match.ct,
          tScore: state.match.t,
          warmup: false,
        }
      : null,
    scoreboard: [...state.present.keys()].map((steamId) => {
      const row = state.board.get(steamId);
      return {
        steamId,
        team: retake ? (row?.team ?? null) : null,
        kills: row?.kills ?? 0,
        deaths: row?.deaths ?? 0,
        score: row?.score ?? 0,
      };
    }),
  };
  const quiet =
    batch.kills.length +
      batch.damages.length +
      batch.roundEnds.length +
      batch.sessionStarts.length +
      batch.sessionEnds.length ===
    0;
  return { heartbeat, batch: quiet ? null : batch };
}

function emptyBatch(): EventBatch {
  return { kills: [], damages: [], roundEnds: [], sessionStarts: [], sessionEnds: [] };
}

function join(state: SimServer, steamId: string, at: Date, newId: () => string, batch: EventBatch) {
  const sessionId = newId();
  state.present.set(steamId, { sessionId, startedAt: at });
  state.board.set(steamId, { team: null, kills: 0, deaths: 0, score: 0 });
  batch.sessionStarts.push({
    id: newId(),
    at: at.toISOString(),
    sessionId,
    steamId,
    map: state.map,
  });
}

function leave(
  state: SimServer,
  steamId: string,
  at: Date,
  newId: () => string,
  batch: EventBatch,
) {
  const session = state.present.get(steamId);
  if (!session) return;
  state.present.delete(steamId);
  state.board.delete(steamId);
  batch.sessionEnds.push({
    id: newId(),
    at: at.toISOString(),
    sessionId: session.sessionId,
    steamId,
    startedAt: session.startedAt.toISOString(),
  });
}

/** Mantém o servidor perto da lotação alvo: enche no primeiro passo e depois só mexe de vez em quando. */
function moveMembers(
  state: SimServer,
  now: Date,
  random: Random,
  newId: () => string,
  batch: EventBatch,
): void {
  const { min, max } = state.def.online;
  const pool = playersOf(state.def.name).map((player) => player.steamId);
  const firstFill = state.present.size === 0;
  if (!firstFill && random() < 0.08) {
    state.target = Math.floor(between(random, min, max + 1));
  }
  const absent = () => pool.filter((steamId) => !state.present.has(steamId));

  // Sem folga para variar (min = max), a lotação fixa troca um jogador de vez em quando.
  if (!firstFill && min === max && state.present.size === state.target && random() < 0.06) {
    leave(state, pick(random, [...state.present.keys()]), now, newId, batch);
  }

  while (state.present.size < state.target && absent().length > 0) {
    join(state, pick(random, absent()), now, newId, batch);
    if (!firstFill && random() < 0.5) break;
  }
  while (state.present.size > state.target) {
    leave(state, pick(random, [...state.present.keys()]), now, newId, batch);
    if (random() < 0.5) break;
  }
}

function playRetakeRound(
  state: SimServer,
  now: Date,
  random: Random,
  newId: () => string,
  batch: EventBatch,
): void {
  const humans = [...state.present.keys()];
  const shuffled = [...humans].sort(() => random() - 0.5);
  const ct = shuffled.filter((_, index) => index % 2 === 0);
  const t = shuffled.filter((_, index) => index % 2 === 1);
  const winner = random() < 0.5 ? 'ct' : 't';

  const kills = Math.round(between(random, 3, 7.99));
  for (let n = 0; n < kills; n++) {
    const killerSide = random() < 0.5 ? 'ct' : 't';
    const [attackers, victims] = killerSide === 'ct' ? [ct, t] : [t, ct];
    const killer = pick(random, attackers);
    const victim = pick(random, victims);
    const assisters = attackers.filter((steamId) => steamId !== killer);
    credit(state, killer, victim);
    const at = new Date(now.getTime() - (kills - n) * 700);
    batch.kills.push({
      id: newId(),
      at: at.toISOString(),
      warmup: false,
      killerSteamId: killer,
      killerIsBot: false,
      victimSteamId: victim,
      victimIsBot: false,
      assisterSteamId: assisters.length > 0 && random() < 0.25 ? pick(random, assisters) : null,
      assisterIsBot: false,
      headshot: random() < 0.42,
      weapon: pick(random, WEAPONS),
      teamKill: false,
      killerTeam: killerSide,
    });
    batch.damages.push({
      id: newId(),
      at: at.toISOString(),
      warmup: false,
      attackerSteamId: killer,
      victimIsBot: false,
      teamDamage: false,
      amount: Math.round(between(random, 45, 100)),
    });
  }
  for (const steamId of ct) {
    const row = state.board.get(steamId);
    if (row) row.team = 'ct';
  }
  for (const steamId of t) {
    const row = state.board.get(steamId);
    if (row) row.team = 't';
  }
  state.match.played += 1;
  if (winner === 'ct') state.match.ct += 1;
  else state.match.t += 1;
  batch.roundEnds.push({
    id: newId(),
    at: now.toISOString(),
    warmup: false,
    winner,
    map: state.map,
    roundNumber: state.match.played,
    scoreCt: state.match.ct,
    scoreT: state.match.t,
    players: [
      ...ct.map((steamId) => ({ steamId, team: 'ct' as const })),
      ...t.map((steamId) => ({ steamId, team: 't' as const })),
    ],
  });
  state.nextActionAt = now.getTime() + between(random, 40_000, 75_000);
}

function playDeathmatchBurst(
  state: SimServer,
  now: Date,
  random: Random,
  newId: () => string,
  batch: EventBatch,
): void {
  const humans = [...state.present.keys()];
  const kills = Math.round(between(random, 2, 4.99));
  for (let n = 0; n < kills; n++) {
    const killer = pick(random, humans);
    const victim = pick(
      random,
      humans.filter((steamId) => steamId !== killer),
    );
    const at = new Date(now.getTime() - (kills - n) * 800);
    credit(state, killer, victim);
    batch.kills.push({
      id: newId(),
      at: at.toISOString(),
      warmup: false,
      killerSteamId: killer,
      killerIsBot: false,
      victimSteamId: victim,
      victimIsBot: false,
      assisterSteamId: null,
      assisterIsBot: false,
      headshot: random() < 0.38,
      weapon: pick(random, WEAPONS),
      teamKill: false,
    });
    batch.damages.push({
      id: newId(),
      at: at.toISOString(),
      warmup: false,
      attackerSteamId: killer,
      victimIsBot: false,
      teamDamage: false,
      amount: Math.round(between(random, 60, 100)),
    });
  }
  state.nextActionAt = now.getTime() + between(random, 8_000, 15_000);
}

/** Os números do placar por jogador: 2 pontos por abate, como no jogo. */
function credit(state: SimServer, killer: string, victim: string): void {
  const k = state.board.get(killer);
  if (k) {
    k.kills += 1;
    k.score += 2;
  }
  const v = state.board.get(victim);
  if (v) v.deaths += 1;
}
