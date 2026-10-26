import type {
  FriendsPlaying,
  LiveServer,
  LiveServerList,
  PlayingFriend,
  ProfilePlaying,
} from '@carmine/contracts';

/**
 * Conferência leve das respostas da nossa própria API no navegador, sem o Zod. Os schemas (`@carmine/contracts`)
 * são o contrato e continuam sendo o que a API e os testes usam; mas o Zod com todos os schemas pesa ~41 kB gzip, e
 * puxá-lo na primeira carga só para validar uma resposta que a API acabou de validar do outro lado custa mais
 * (orçamento de JS da Home e do Perfil) do que protege. Aqui só se confere o que a tela lê: o formato, não os
 * formatos de texto (datas, URLs, UUIDs). Resposta que não bate vira `null` e a tela segue como já seguia com o
 * Zod falhando (lista antiga, bloco some). `guards.test.ts` compara cada conferência com o schema de verdade.
 *
 * Quem valida de verdade (formulários, entradas de Staff, o que tem permissão) continua com `loadContracts()`.
 */

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

const MODES = new Set(['retake', 'deathmatch']);
const STATES = new Set(['online', 'full', 'offline']);

function isMatch(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isInteger(value.round) &&
    isCount(value.ctScore) &&
    isCount(value.tScore) &&
    typeof value.warmup === 'boolean'
  );
}

function isLiveServer(value: unknown): value is LiveServer {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNullableString(value.showcaseName) &&
    isNullableString(value.code) &&
    isString(value.mode) &&
    MODES.has(value.mode) &&
    isString(value.address) &&
    isString(value.region) &&
    isNullableString(value.map) &&
    isCount(value.players) &&
    isCount(value.maxPlayers) &&
    (value.maxPlayers as number) >= 1 &&
    isString(value.state) &&
    STATES.has(value.state) &&
    isNullableString(value.lastHeartbeatAt) &&
    isNullableString(value.lastMap) &&
    (value.match === undefined || value.match === null || isMatch(value.match))
  );
}

/** A lista de servidores (`GET /api/servers` e cada evento do SSE); `null` se o formato não é o do contrato. */
export function parseLiveServerList(value: unknown): LiveServerList | null {
  if (!isRecord(value) || !Array.isArray(value.servers) || !isRecord(value.summary)) return null;
  if (!isString(value.generatedAt)) return null;
  if (!isCount(value.summary.online) || !isCount(value.summary.players)) return null;
  return value.servers.every(isLiveServer) ? (value as unknown as LiveServerList) : null;
}

function isFriend(value: unknown): value is PlayingFriend {
  return (
    isRecord(value) &&
    isString(value.steamId) &&
    Number.isInteger(value.publicId) &&
    (value.publicId as number) > 0 &&
    isString(value.displayName) &&
    value.displayName.length > 0 &&
    isNullableString(value.avatarUrl) &&
    isString(value.serverId)
  );
}

/** `GET /api/me/friends-playing`; `null` se o formato não é o do contrato. */
export function parseFriendsPlaying(value: unknown): FriendsPlaying | null {
  if (!isRecord(value)) return null;
  if (value.status === 'unavailable') return { status: 'unavailable' };
  if (value.status !== 'ok' && value.status !== 'private') return null;
  if (!Array.isArray(value.friends) || !value.friends.every(isFriend)) return null;
  return { status: value.status, friends: value.friends };
}

/** `GET /api/profiles/{id}/playing`: o servidor onde a Conta está agora, ou `null` no `server`. */
export function parseProfilePlaying(value: unknown): ProfilePlaying | null {
  if (!isRecord(value) || !('server' in value)) return null;
  const server = value.server;
  if (server === null) return { server: null };
  if (
    !isRecord(server) ||
    !isString(server.id) ||
    !isString(server.name) ||
    !isNullableString(server.showcaseName) ||
    !isString(server.mode) ||
    !MODES.has(server.mode) ||
    !isNullableString(server.map) ||
    !isString(server.address) ||
    !isString(server.state) ||
    !STATES.has(server.state)
  ) {
    return null;
  }
  return {
    server: {
      id: server.id,
      name: server.name,
      showcaseName: server.showcaseName,
      mode: server.mode as NonNullable<ProfilePlaying['server']>['mode'],
      map: server.map,
      address: server.address,
      state: server.state as 'online' | 'full' | 'offline',
    },
  };
}
