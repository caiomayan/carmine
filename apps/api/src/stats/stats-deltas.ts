import {
  type EventBatch,
  type GameTeam,
  type KillEvent,
  PLAY_SESSION_MAX_SECONDS,
  type RoundEndEvent,
  type StatWeapon,
} from '@carmine/contracts';
import { dayOf, splitByDay, splitByWeek, weekStartOf } from './stats-week.js';
import { normalizeWeapon } from './weapons.js';

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

/** O que um lote soma na atividade de uma Conta num dia de Brasília (S12b, o mapa de calor). */
export interface DayDelta extends Omit<StatsDelta, 'weekStart'> {
  /** `YYYY-MM-DD`. */
  day: string;
}

/** Abates de uma Conta com uma arma, por lado do assassino (S12b, o radar). */
export interface WeaponDelta {
  steamId: string;
  weapon: StatWeapon;
  side: GameTeam;
  kills: number;
  headshots: number;
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
  /** As mesmas somas por dia (S12b): o que entra em uma entra na outra, pelas mesmas regras. */
  dailyDeltas: DayDelta[];
  /** Só a kill que conta e veio com o lado do assassino (`killerTeam`); plugin velho não entra. */
  weapons: WeaponDelta[];
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
  const weekly = new Map<string, StatsDelta>();
  const daily = new Map<string, StatsDelta>();
  const weapons = new Map<string, WeaponDelta>();
  const teamKills: TeamKill[] = [];
  let ignored = 0;

  /** Soma para a Conta, se existir, na semana e no dia; diz se algo foi somado. */
  const add = (steamId: string, at: Date, counters: Partial<Counters>): boolean => {
    if (!knownSteamIds.has(steamId)) return false;
    addTo(weekly, steamId, weekStartOf(at), counters);
    addTo(daily, steamId, dayOf(at), counters);
    return true;
  };

  for (const kill of batch.kills) {
    const at = new Date(kill.at);
    if (kill.warmup) {
      ignored++;
      continue;
    }
    const counted = countKill(kill, at, knownSteamIds, add, teamKills, weapons);
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
      addTo(weekly, end.steamId, piece.weekStart, { secondsPlayed: piece.seconds });
    }
    for (const piece of splitByDay(start, stop)) {
      addTo(daily, end.steamId, piece.day, { secondsPlayed: piece.seconds });
    }
  }

  return {
    deltas: [...weekly.values()],
    dailyDeltas: [...daily.values()].map(({ weekStart, ...rest }) => ({ ...rest, day: weekStart })),
    weapons: [...weapons.values()],
    teamKills,
    ignored,
  };
}

type Add = (steamId: string, at: Date, counters: Partial<Counters>) => boolean;

function countKill(
  kill: KillEvent,
  at: Date,
  known: ReadonlySet<string>,
  add: Add,
  teamKills: TeamKill[],
  weapons: Map<string, WeaponDelta>,
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
    const killerCounted = add(killerSteamId, at, { kills: 1, headshots: kill.headshot ? 1 : 0 });
    counted = killerCounted || counted;
    // O radar (S12b) é a mesma kill, com a arma e o lado; sem o lado (plugin velho), só não entra nele.
    if (killerCounted && kill.killerTeam) {
      addWeapon(
        weapons,
        killerSteamId,
        normalizeWeapon(kill.weapon),
        kill.killerTeam,
        kill.headshot,
      );
    }
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

function addWeapon(
  weapons: Map<string, WeaponDelta>,
  steamId: string,
  weapon: StatWeapon,
  side: GameTeam,
  headshot: boolean,
): void {
  const key = `${steamId}|${weapon}|${side}`;
  const delta = weapons.get(key) ?? { steamId, weapon, side, kills: 0, headshots: 0 };
  delta.kills += 1;
  delta.headshots += headshot ? 1 : 0;
  weapons.set(key, delta);
}

/** `period` é a semana ou o dia: quem chama diz qual (o campo `weekStart` carrega os dois). */
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
