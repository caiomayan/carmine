import {
  type EventBatch,
  type KillEvent,
  PLAY_SESSION_MAX_SECONDS,
  type RoundEndEvent,
} from '@carmine/contracts';
import { splitByWeek, weekStartOf } from './stats-week.js';

/** O que um lote soma nas Estatísticas de uma Conta numa semana (de Brasília). */
export interface StatsDelta {
  steamId: string;
  /** Segunda-feira da semana, `YYYY-MM-DD`. */
  weekStart: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damage: number;
  roundsPlayed: number;
  roundsWon: number;
  secondsPlayed: number;
}

/** Uma kill em aliado, guardada para a moderação (não entra nas Estatísticas). */
export interface TeamKill {
  id: string;
  at: Date;
  killerSteamId: string;
  victimSteamId: string;
  weapon: string;
}

export interface CollectedStats {
  deltas: StatsDelta[];
  teamKills: TeamKill[];
  /**
   * Eventos que, por regra, não mudaram nenhuma Estatística: bot, aquecimento, kill em aliado,
   * Conta desconhecida, Sessão de jogo absurda. O início da Sessão não é regra: não soma nada e
   * não é ignorado.
   */
  ignored: number;
}

type Counters = Omit<StatsDelta, 'steamId' | 'weekStart'>;

/**
 * As regras da S12 sobre o que conta: transforma eventos novos (já sem duplicatas) em somas por
 * Conta e semana. Só conta quem está em `knownSteamIds` (tem Conta). Não toca em banco.
 */
export function collectStats(
  batch: EventBatch,
  knownSteamIds: ReadonlySet<string>,
): CollectedStats {
  const deltas = new Map<string, StatsDelta>();
  const teamKills: TeamKill[] = [];
  let ignored = 0;

  /** Soma para a Conta, se existir; diz se algo foi somado. */
  const add = (steamId: string, at: Date, counters: Partial<Counters>): boolean => {
    if (!knownSteamIds.has(steamId)) return false;
    addTo(deltas, steamId, weekStartOf(at), counters);
    return true;
  };

  for (const kill of batch.kills) {
    const at = new Date(kill.at);
    if (kill.warmup) {
      ignored++;
      continue;
    }
    const counted = countKill(kill, at, knownSteamIds, add, teamKills);
    if (!counted) ignored++;
  }

  for (const hit of batch.damages) {
    const counts = !hit.warmup && !hit.victimIsBot && !hit.teamDamage;
    if (!counts || !add(hit.attackerSteamId, new Date(hit.at), { damage: hit.amount })) ignored++;
  }

  for (const round of batch.roundEnds) {
    if (round.warmup || !countRound(round, add)) ignored++;
  }

  for (const end of batch.sessionEnds) {
    const start = new Date(end.startedAt);
    const stop = new Date(end.at);
    const seconds = (stop.getTime() - start.getTime()) / 1000;
    if (seconds <= 0 || seconds > PLAY_SESSION_MAX_SECONDS) {
      ignored++;
      continue;
    }
    if (!knownSteamIds.has(end.steamId)) {
      ignored++;
      continue;
    }
    for (const piece of splitByWeek(start, stop)) {
      addTo(deltas, end.steamId, piece.weekStart, { secondsPlayed: piece.seconds });
    }
  }

  return { deltas: [...deltas.values()], teamKills, ignored };
}

type Add = (steamId: string, at: Date, counters: Partial<Counters>) => boolean;

function countKill(
  kill: KillEvent,
  at: Date,
  known: ReadonlySet<string>,
  add: Add,
  teamKills: TeamKill[],
): boolean {
  // Um bot como assassino ou vítima anula o evento para todos.
  if (kill.killerIsBot || kill.victimIsBot || kill.victimSteamId === null) return false;
  const { killerSteamId, victimSteamId } = kill;

  if (killerSteamId === victimSteamId) return add(victimSteamId, at, { deaths: 1 });

  if (kill.teamKill) {
    if (killerSteamId !== null && known.has(killerSteamId) && known.has(victimSteamId)) {
      teamKills.push({ id: kill.id, at, killerSteamId, victimSteamId, weapon: kill.weapon });
    }
    return false;
  }

  let counted = add(victimSteamId, at, { deaths: 1 });
  if (killerSteamId !== null) {
    counted = add(killerSteamId, at, { kills: 1, headshots: kill.headshot ? 1 : 0 }) || counted;
  }
  const assister = kill.assisterSteamId;
  if (
    assister !== null &&
    !kill.assisterIsBot &&
    assister !== killerSteamId &&
    assister !== victimSteamId
  ) {
    counted = add(assister, at, { assists: 1 }) || counted;
  }
  return counted;
}

function countRound(round: RoundEndEvent, add: Add): boolean {
  const at = new Date(round.at);
  const seen = new Set<string>();
  let counted = false;
  for (const player of round.players) {
    if (seen.has(player.steamId)) continue;
    seen.add(player.steamId);
    const won = round.winner === player.team ? 1 : 0;
    counted = add(player.steamId, at, { roundsPlayed: 1, roundsWon: won }) || counted;
  }
  return counted;
}

function addTo(
  deltas: Map<string, StatsDelta>,
  steamId: string,
  weekStart: string,
  counters: Partial<Counters>,
): void {
  const key = `${steamId}|${weekStart}`;
  let delta = deltas.get(key);
  if (!delta) {
    delta = {
      steamId,
      weekStart,
      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      damage: 0,
      roundsPlayed: 0,
      roundsWon: 0,
      secondsPlayed: 0,
    };
    deltas.set(key, delta);
  }
  for (const [name, value] of Object.entries(counters) as [keyof Counters, number][]) {
    delta[name] += value;
  }
}
