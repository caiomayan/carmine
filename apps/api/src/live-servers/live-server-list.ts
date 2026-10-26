import {
  type GameMode,
  type LiveServer,
  type LiveServerList,
  type MatchState,
  type ScoreboardEntry,
  SERVER_OFFLINE_AFTER_SECONDS,
  type ServerRegion,
} from '@carmine/contracts';

/** O que a lista pública mostra do cadastro de um Servidor Carmine. */
export interface ListedServer {
  id: string;
  name: string;
  showcaseName: string | null;
  code: string | null;
  mode: GameMode;
  address: string;
  region: ServerRegion;
}

/** O último batimento de um servidor, como ficou guardado na presença. */
export interface ServerPresence {
  map: string;
  /** SteamID64 dos jogadores humanos conectados. */
  players: string[];
  maxPlayers: number;
  at: Date;
  /** S12b: o placar de times do último batimento; nulo no Deathmatch ou sem placar do plugin. */
  match?: MatchState | null;
  /** S12b: o placar por jogador do último batimento; ausente se o plugin não o mandou. */
  scoreboard?: ScoreboardEntry[] | null;
}

/** Vagas públicas de cada Modo (S02), para um servidor que ainda não mandou batimento. */
const DEFAULT_MAX_PLAYERS: Record<GameMode, number> = { retake: 9, deathmatch: 16 };

const MODE_ORDER: Record<GameMode, number> = { retake: 0, deathmatch: 1 };

/** Padrão: o servidor está no ar enquanto o último batimento tem menos que esse tempo. */
export const OFFLINE_AFTER_MS = SERVER_OFFLINE_AFTER_SECONDS * 1000;

/** A lista pública em `now`: estado de cada servidor (por Modo e nome) e o resumo do rodapé. */
export function buildLiveServerList(
  servers: ListedServer[],
  presences: ReadonlyMap<string, ServerPresence>,
  now: Date,
  offlineAfterMs = OFFLINE_AFTER_MS,
): LiveServerList {
  const listed = servers
    .map((server) => toLiveServer(server, presences.get(server.id), now, offlineAfterMs))
    .sort((a, b) => MODE_ORDER[a.mode] - MODE_ORDER[b.mode] || a.name.localeCompare(b.name));
  const up = listed.filter((server) => server.state !== 'offline');
  return {
    servers: listed,
    summary: {
      online: up.length,
      players: up.reduce((total, server) => total + server.players, 0),
    },
    generatedAt: now.toISOString(),
  };
}

/** Um servidor da lista pública em `now`, a partir do último batimento (se houve). */
export function toLiveServer(
  server: ListedServer,
  presence: ServerPresence | undefined,
  now: Date,
  offlineAfterMs: number,
): LiveServer {
  const { id, name, showcaseName, code, mode, address, region } = server;
  const base = {
    id,
    name,
    showcaseName,
    code,
    mode,
    address,
    region,
    lastHeartbeatAt: presence?.at.toISOString() ?? null,
    lastMap: presence?.map ?? null,
  };
  if (presence === undefined || now.getTime() - presence.at.getTime() >= offlineAfterMs) {
    return {
      ...base,
      map: null,
      players: 0,
      maxPlayers: presence?.maxPlayers ?? DEFAULT_MAX_PLAYERS[server.mode],
      state: 'offline',
      match: null,
    };
  }
  const players = presence.players.length;
  return {
    ...base,
    map: presence.map,
    players,
    maxPlayers: presence.maxPlayers,
    state: players >= presence.maxPlayers ? 'full' : 'online',
    // Só enquanto o servidor está no ar: um placar de antes da queda não é o de agora.
    match: presence.match ?? null,
  };
}
