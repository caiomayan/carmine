import type { LiveServer, ServerPlayers, ServerToday } from '@carmine/contracts';
import type { Collectable, Match, Roster, RosterPlayer, Today } from './types';

/**
 * Dos contratos da S12b (`LiveServer.match`, `ServerPlayers`, `ServerToday`) para o que a página lê. Cada bloco
 * vira "coletando" quando a API diz que ainda não há dado (campo ausente, ou `since` nulo), nunca um zero no lugar.
 */

const clock = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "HH:MM" no relógio de Brasília. */
export const brasiliaClock = (iso: string) => clock.format(new Date(iso));

/** O mapa de agora costuma ter o último movimento em segundos; acima disso o mapa já acabou. */
const CURRENT_MAP_GRACE_MS = 3 * 60_000;

/**
 * O placar de times da lista ao vivo. `match` ausente é "o servidor ainda não manda" (coletando); nulo é "não há
 * placar de times" (Deathmatch, vazio): pronto e sem partida.
 */
export function matchOf(server: Pick<LiveServer, 'match'>): Collectable<Match | null> {
  if (server.match === undefined) return { status: 'collecting', since: null };
  return { status: 'ready', data: server.match };
}

/** `GET /api/servers/{id}/players`: o Perfil privado vira uma linha anônima (sem nome, avatar nem link). */
export function rosterOf(response: ServerPlayers): Collectable<Roster> {
  let privates = 0;
  const players: RosterPlayer[] = response.players.map((row) => {
    const isPrivate = row.player.private || row.player.publicId === null;
    return {
      id: isPrivate ? `privado-${privates++}` : String(row.player.publicId),
      name: isPrivate ? null : row.player.displayName,
      avatarUrl: isPrivate ? null : row.player.avatarUrl,
      publicId: isPrivate ? null : row.player.publicId,
      team: row.team,
      kills: row.kills ?? 0,
      deaths: row.deaths ?? 0,
      score: row.score ?? 0,
    };
  });
  return { status: 'ready', data: { players, scoreboard: response.scoreboard } };
}

/**
 * `GET /api/servers/{id}/today`. `liveMap` é o mapa do servidor no ar (nulo offline): o último mapa do dia que ainda
 * é o dele e tem movimento recente é o "agora". Sem `since` (o servidor nunca teve dado detalhado) o bloco é
 * "coletando".
 */
export function todayOf(response: ServerToday, liveMap: string | null): Collectable<Today> {
  if (response.since === null) return { status: 'collecting', since: null };

  const generated = Date.parse(response.generatedAt);
  const last = response.maps.length - 1;
  const maps = response.maps.map((row, index) => {
    const now =
      response.isToday &&
      liveMap !== null &&
      index === last &&
      row.map === liveMap &&
      generated - Date.parse(row.to) <= CURRENT_MAP_GRACE_MS;
    return {
      map: row.map,
      from: brasiliaClock(row.from),
      to: now ? null : brasiliaClock(row.to),
      rounds: row.rounds,
      ctWins: row.ctWins,
      tWins: row.tWins,
    };
  });

  // Sem rounds (Deathmatch, plugin antigo) o gráfico mostra os jogadores por hora.
  const hasRounds = response.rounds !== null && response.rounds.played > 0;
  const hours = [...response.hours].sort((a, b) => a.hour - b.hour);

  return {
    status: 'ready',
    data: {
      date: response.date,
      clock: response.isToday ? brasiliaClock(response.generatedAt) : '23:59',
      rounds: response.rounds,
      maps,
      hours: hours.map((hour) => (hasRounds ? hour.rounds : hour.players)),
      hoursMetric: hasRounds ? 'rounds' : 'players',
      peakPlayers: response.peakPlayers
        ? { at: brasiliaClock(response.peakPlayers.at), count: response.peakPlayers.count }
        : null,
      uniquePlayers: response.uniquePlayers,
      since: response.since,
    },
  };
}
