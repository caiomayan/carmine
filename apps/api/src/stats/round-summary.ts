import type {
  DamageEvent,
  GameTeam,
  KillEvent,
  MapName,
  RoundEndEvent,
  RoundEndReason,
  RoundStartEvent,
  RoundWinner,
} from '@carmine/contracts';

/** O matador de um jogador que morre até este tempo depois da morte dele troca a morte (KAST). */
export const TRADE_WINDOW_MS = 5000;

/** Dano à vítima, em vida, a partir do qual quem não matou tem a assistência (HLTV 3.0). */
export const ASSIST_DAMAGE_MIN = 40;

/** A vida de um jogador no começo do round: o teto do dano que ele pode levar. */
export const ROUND_HEALTH = 100;

/** O maior multi-kill que o resumo guarda (5k). */
export const MULTI_KILL_MAX = 5;

/**
 * O último vivo do time contra `against` inimigos vivos, e se o time venceu o round depois disso,
 * esteja ele vivo ou não no fim (a bomba plantada explode e o clutch é do T que morreu).
 */
export interface Clutch {
  against: number;
  won: boolean;
}

/** O que um jogador fez num round (S17). Os números de um bot nunca entram. */
export interface PlayerRoundSummary {
  steamId: string;
  side: GameTeam;
  /** O valor do equipamento no fim do freeze; nulo sem `round_start` (plugin antigo). */
  equipmentValue: number | null;
  kills: number;
  headshots: number;
  deaths: number;
  /** Assistências por dano (40 ou mais à vítima), sem somar a flash assist da mesma kill. */
  assists: number;
  flashAssists: number;
  /** Dano em inimigos humanos, limitado pela vida que a vítima tinha. */
  damage: number;
  survived: boolean;
  /** O matador dele morreu até `TRADE_WINDOW_MS` depois, pelas mãos de um aliado. */
  traded: boolean;
  /** Fez a primeira kill do round. */
  openingKill: boolean;
  /** Levou a primeira kill do round. */
  openingDeath: boolean;
  /** 2 a 5 kills no round; nulo com menos de 2. */
  multiKill: number | null;
  clutch: Clutch | null;
  /** Kill, assistência (de dano ou de flash), sobreviveu ou foi trocado. */
  kast: boolean;
}

export interface RoundSummary {
  mapPlayId: string | null;
  roundNumber: number | null;
  map: MapName | null;
  winner: RoundWinner;
  reason: RoundEndReason | null;
  durationMs: number | null;
  players: PlayerRoundSummary[];
}

/** Os eventos de um round, já separados pelo mapa jogado e pelo número dele. */
export interface RoundInput {
  /** Nulo quando o plugin ainda não manda `round_start`: o fim do round dá o elenco. */
  start: RoundStartEvent | null;
  kills: readonly KillEvent[];
  damages: readonly DamageEvent[];
  end: RoundEndEvent;
}

interface Member {
  steamId: string;
  side: GameTeam;
  equipmentValue: number | null;
}

interface Hit {
  attacker: string;
  victim: string | null;
  at: number;
  health: number;
}

interface CountedKill {
  at: number;
  killer: string;
  victim: string;
}

const other = (side: GameTeam): GameTeam => (side === 'ct' ? 't' : 'ct');

/** O horário do servidor em ms; sem ele, o `at` do evento. */
const timeOf = (event: { at: string; atMs?: number | undefined }): number =>
  event.atMs ?? Date.parse(event.at);

/** Em ordem de horário; o empate mantém a ordem em que o plugin mandou. */
function chronological<T extends { at: string; atMs?: number | undefined }>(
  events: readonly T[],
): { event: T; at: number }[] {
  return events
    .map((event, index) => ({ event, at: timeOf(event), index }))
    .sort((a, b) => a.at - b.at || a.index - b.index);
}

/**
 * O resumo de um round por jogador (S17): a função pura que a API usa quando o `round_end` chega.
 * Devolve `null` para o que não vale resumo: aquecimento e round sem humanos dos dois lados (os
 * rounds sintéticos do `cs2-retakes`).
 *
 * As regras de quem conta são as do ADR 0018: um bot como assassino ou vítima anula o evento para
 * todos (nem kill, nem morte, nem assistência, nem dano), kill em aliado não conta kill nem morte,
 * e suicídio e queda contam só a morte. O bot só existe como "vivo" na conta do clutch, e a morte de
 * qualquer um tira o jogador do `survived`. A abertura, a troca e o multi-kill olham só as kills que
 * contam (humano contra humano, em lados opostos).
 */
export function summarizeRound(input: RoundInput): RoundSummary | null {
  const { start, end } = input;
  if (end.warmup || start?.warmup) return null;

  const roster = new Map<string, Member>();
  const source =
    start?.players.map((p) => ({ ...p })) ??
    end.players.map((p) => ({ ...p, equipmentValue: null as number | null }));
  for (const { steamId, team, equipmentValue } of source) {
    roster.set(steamId, { steamId, side: team, equipmentValue });
  }
  const members = [...roster.values()];
  if (!members.some((m) => m.side === 'ct') || !members.some((m) => m.side === 't')) return null;

  const stats = new Map<string, PlayerRoundSummary>(
    members.map((m) => [
      m.steamId,
      {
        steamId: m.steamId,
        side: m.side,
        equipmentValue: m.equipmentValue,
        kills: 0,
        headshots: 0,
        deaths: 0,
        assists: 0,
        flashAssists: 0,
        damage: 0,
        survived: false,
        traded: false,
        openingKill: false,
        openingDeath: false,
        multiKill: null,
        clutch: null,
        kast: false,
      },
    ]),
  );

  const hits = limitDamage(input.damages, roster, stats);

  // Quem está vivo, por lado: os humanos pelo SteamID e os bots só pela conta.
  const aliveHumans: Record<GameTeam, Set<string>> = {
    ct: new Set(members.filter((m) => m.side === 'ct').map((m) => m.steamId)),
    t: new Set(members.filter((m) => m.side === 't').map((m) => m.steamId)),
  };
  const aliveBots: Record<GameTeam, number> = { ct: start?.botsCt ?? 0, t: start?.botsT ?? 0 };
  const dead = new Set<string>();
  const counted: CountedKill[] = [];
  const clutchAgainst = new Map<string, number>();
  let opening: CountedKill | null = null;

  for (const { event: kill, at } of chronological(input.kills.filter((k) => !k.warmup))) {
    const victim = kill.victimSteamId;
    const killer = kill.killerSteamId;
    const victimMember = victim === null || kill.victimIsBot ? undefined : roster.get(victim);
    // Quem entrou no meio do round não está no elenco: a morte dele não muda a conta.
    const victimSide = victimMember?.side ?? botVictimSide(kill);
    const isCounted =
      killer !== null &&
      victim !== null &&
      killer !== victim &&
      !kill.killerIsBot &&
      !kill.victimIsBot &&
      !kill.teamKill;

    if (victimMember) {
      dead.add(victimMember.steamId);
      aliveHumans[victimMember.side].delete(victimMember.steamId);
      // Bot matando e kill em aliado não contam a morte (ADR 0018); suicídio e queda contam.
      const died = stats.get(victimMember.steamId);
      if (died && !kill.killerIsBot && !kill.teamKill) died.deaths++;
    } else if (kill.victimIsBot && victimSide) {
      aliveBots[victimSide] = Math.max(0, aliveBots[victimSide] - 1);
    }

    if (isCounted) {
      const entry = { at, killer, victim };
      opening ??= entry;
      counted.push(entry);
      creditKill(kill, at, stats, roster, hits);
    }

    if (victimSide && (victimMember || kill.victimIsBot)) {
      markClutch(victimSide, aliveHumans, aliveBots, clutchAgainst);
    }
  }

  if (opening) {
    const first = stats.get(opening.killer);
    const last = stats.get(opening.victim);
    if (first) first.openingKill = true;
    if (last) last.openingDeath = true;
  }

  for (const [index, kill] of counted.entries()) {
    const victim = stats.get(kill.victim);
    if (!victim) continue;
    for (const later of counted.slice(index + 1)) {
      if (later.at - kill.at > TRADE_WINDOW_MS) break;
      if (later.victim === kill.killer) victim.traded = true;
    }
  }

  const alive = end.alive === undefined ? null : new Set(end.alive);
  for (const player of stats.values()) {
    player.survived = alive ? alive.has(player.steamId) : !dead.has(player.steamId);
    player.multiKill = player.kills >= 2 ? Math.min(player.kills, MULTI_KILL_MAX) : null;
    const against = clutchAgainst.get(player.steamId);
    if (against !== undefined) {
      player.clutch = { against, won: end.winner === player.side };
    }
    player.kast =
      player.kills > 0 ||
      player.assists > 0 ||
      player.flashAssists > 0 ||
      player.survived ||
      player.traded;
  }

  return {
    mapPlayId: end.mapPlayId ?? start?.mapPlayId ?? null,
    roundNumber: end.roundNumber ?? start?.roundNumber ?? null,
    map: end.map ?? start?.map ?? null,
    winner: end.winner,
    reason: end.reason ?? null,
    durationMs: end.durationMs ?? null,
    players: members.map((m) => stats.get(m.steamId) as PlayerRoundSummary),
  };
}

/**
 * Soma o dano de cada atacante em inimigos humanos, limitado à vida que a vítima ainda tinha: usa o
 * `healthDamage` do plugin quando vem (senão o valor bruto) e nunca passa de `ROUND_HEALTH` por
 * vítima no round. Devolve os acertos já limitados, para a assistência olhar o dano à vítima.
 */
function limitDamage(
  damages: readonly DamageEvent[],
  roster: ReadonlyMap<string, Member>,
  stats: ReadonlyMap<string, PlayerRoundSummary>,
): Hit[] {
  const taken = new Map<string, number>();
  const hits: Hit[] = [];
  for (const { event: hit, at } of chronological(damages.filter((d) => !d.warmup))) {
    const attacker = roster.get(hit.attackerSteamId);
    if (!attacker || hit.victimIsBot || hit.teamDamage) continue;
    const victim = hit.victimSteamId ?? null;
    if (victim === hit.attackerSteamId) continue;
    const already = victim === null ? 0 : (taken.get(victim) ?? 0);
    const health = Math.max(0, Math.min(hit.healthDamage ?? hit.amount, ROUND_HEALTH - already));
    if (victim !== null) taken.set(victim, already + health);
    const dealer = stats.get(attacker.steamId);
    if (dealer) dealer.damage += health;
    hits.push({ attacker: attacker.steamId, victim, at, health });
  }
  return hits;
}

/** Kill, headshot, flash assist e assistências por dano de uma kill que conta. */
function creditKill(
  kill: KillEvent,
  at: number,
  stats: ReadonlyMap<string, PlayerRoundSummary>,
  roster: ReadonlyMap<string, Member>,
  hits: readonly Hit[],
): void {
  const killer = stats.get(kill.killerSteamId as string);
  if (!killer) return;
  killer.kills++;
  if (kill.headshot) killer.headshots++;

  const flasher = kill.assisterSteamId;
  const flashAssister =
    kill.flashAssist && flasher !== null && !kill.assisterIsBot && flasher !== killer.steamId
      ? stats.get(flasher)
      : undefined;
  if (flashAssister && flashAssister.side === killer.side) flashAssister.flashAssists++;

  for (const mate of roster.values()) {
    if (mate.side !== killer.side || mate.steamId === killer.steamId) continue;
    if (mate.steamId === flashAssister?.steamId) continue;
    const dealt = hits
      .filter((h) => h.attacker === mate.steamId && h.victim === kill.victimSteamId && h.at <= at)
      .reduce((sum, h) => sum + h.health, 0);
    const assister = stats.get(mate.steamId);
    if (assister && dealt >= ASSIST_DAMAGE_MIN) assister.assists++;
  }
}

/** O lado de uma vítima bot: o que o plugin disse, ou o inverso do assassino (o mesmo, em aliado). */
function botVictimSide(kill: KillEvent): GameTeam | null {
  if (!kill.victimIsBot) return null;
  if (kill.victimTeam) return kill.victimTeam;
  if (!kill.killerTeam) return null;
  return kill.teamKill ? kill.killerTeam : other(kill.killerTeam);
}

/** Depois de uma morte no lado `side`: se sobrou um humano sozinho contra algum inimigo, é um clutch. */
function markClutch(
  side: GameTeam,
  aliveHumans: Record<GameTeam, Set<string>>,
  aliveBots: Record<GameTeam, number>,
  clutchAgainst: Map<string, number>,
): void {
  if (aliveHumans[side].size !== 1 || aliveBots[side] !== 0) return;
  const enemies = aliveHumans[other(side)].size + aliveBots[other(side)];
  if (enemies === 0) return;
  const [survivor] = aliveHumans[side];
  if (survivor !== undefined && !clutchAgainst.has(survivor)) clutchAgainst.set(survivor, enemies);
}
