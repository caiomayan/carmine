import type { LiveServer } from '@carmine/contracts';
import { isLiveServer } from '@/lib/home/state';
import type { Match, RosterPlayer, Side, Today, TodayMap } from './types';

/** O estado de cabeça da página: no ar, lotado, esquentando (sem round ainda) ou offline. */
export type ServerPhase = 'live' | 'full' | 'warmup' | 'offline';

export function serverPhase(server: Pick<LiveServer, 'state'>, match: Match | null): ServerPhase {
  if (!isLiveServer(server)) return 'offline';
  if (match?.warmup) return 'warmup';
  return server.state === 'full' ? 'full' : 'live';
}

/** Minutos entre dois horários "HH:MM" do mesmo dia (nunca negativo). */
export function minutesBetween(from: string, to: string): number {
  const toMinutes = (clock: string) => {
    const [h = '0', m = '0'] = clock.split(':');
    return Number(h) * 60 + Number(m);
  };
  return Math.max(0, toMinutes(to) - toMinutes(from));
}

/** Por pontos, depois abates, depois nome (Perfil privado por último): a ordem do placar do jogo. */
function byScore(a: RosterPlayer, b: RosterPlayer): number {
  return (
    b.score - a.score ||
    b.kills - a.kills ||
    Number(a.name === null) - Number(b.name === null) ||
    (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR')
  );
}

/** Os jogadores de um lado, em ordem de placar. */
export function rankedBySide(players: readonly RosterPlayer[], side: Side): RosterPlayer[] {
  return players.filter((player) => player.team === side).sort(byScore);
}

/** Todos, em ordem de placar (o Deathmatch). */
export function rankedAll(players: readonly RosterPlayer[]): RosterPlayer[] {
  return [...players].sort(byScore);
}

function byName(a: RosterPlayer, b: RosterPlayer): number {
  return (
    Number(a.name === null) - Number(b.name === null) ||
    (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR')
  );
}

/** Em ordem alfabética, Perfil privado por último (o aquecimento: sem número, a ordem não quer dizer nada). */
export function alphabeticalBySide(players: readonly RosterPlayer[], side: Side): RosterPlayer[] {
  return players.filter((player) => player.team === side).sort(byName);
}

/** Todos, em ordem alfabética (sem o placar por jogador não há time nem pontos para ordenar). */
export function namesOnly(players: readonly RosterPlayer[]): RosterPlayer[] {
  return [...players].sort(byName);
}

/** Abates por morte, com 2 casas (morrer 0 vezes conta como 1, como o placar do jogo). */
export function killDeathRatio(player: Pick<RosterPlayer, 'kills' | 'deaths'>): string {
  return (player.kills / Math.max(1, player.deaths)).toFixed(2);
}

/** Quanto do total (em %) é do lado CT; 50 sem nenhum round. */
export function ctShare(ctWins: number, tWins: number): number {
  const total = ctWins + tWins;
  return total === 0 ? 50 : (ctWins / total) * 100;
}

/** O mapa de agora no histórico do dia (o que ainda não acabou), se houver. */
export function currentMap(today: Today): TodayMap | null {
  const last = today.maps.at(-1);
  return last && last.to === null ? last : null;
}

/** Há quantos minutos o mapa de agora começou (do histórico do dia); nulo sem mapa de agora. */
export function minutesOnMap(today: Today): number | null {
  const current = currentMap(today);
  return current ? minutesBetween(current.from, today.clock) : null;
}

/** A hora mais movimentada do dia (a primeira no empate) e o seu total; `null` se nenhum round foi jogado. */
export function busiestHour(hours: readonly number[]): { hour: number; rounds: number } | null {
  const rounds = Math.max(0, ...hours);
  if (rounds === 0) return null;
  return { hour: hours.indexOf(rounds), rounds };
}

/** A primeira hora com round, ou nulo. */
export function firstActiveHour(hours: readonly number[]): number | null {
  const index = hours.findIndex((count) => count > 0);
  return index === -1 ? null : index;
}

/** O caminho da página de um servidor. */
export const serverHref = (id: string) => `/servers/${id}`;
