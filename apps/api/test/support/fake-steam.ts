import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeSteamBehavior = 'ok' | 'error' | 'hang';

/** A lista de amigos de um SteamID: os amigos, `private` (HTTP 401, como a Steam) ou `error` (500). */
export type FakeFriendList = string[] | 'private' | 'error';

const SUMMARIES_PATH = '/ISteamUser/GetPlayerSummaries/v2/';
const FRIENDS_PATH = '/ISteamUser/GetFriendList/v1/';

/**
 * Imita a Steam Web API (`ISteamUser/GetPlayerSummaries/v2` e `ISteamUser/GetFriendList/v1`),
 * para os testes não dependerem da Steam real nem de uma chave.
 */
export class FakeSteam {
  behavior: FakeSteamBehavior = 'ok';
  /** `false`: nenhum perfil existe (GetPlayerSummaries vem vazio; vale o avatar neutro). */
  profilesExist = true;
  /** Lista de amigos de cada SteamID; quem não está aqui não tem amigos. */
  friendsOf: (steamId: string) => FakeFriendList = (steamId) => this.friendLists.get(steamId) ?? [];
  readonly friendLists = new Map<string, FakeFriendList>();
  readonly requests: URL[] = [];
  private server: Server | null = null;

  /** Atende um pedido à Steam Web API (também usado pela Steam falsa do E2E). */
  readonly handle = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://fake-steam');
    this.requests.push(url);
    if (this.behavior === 'hang') {
      return; // nunca responde: o cliente tem de desistir pelo timeout.
    }
    if (this.behavior === 'error') {
      res.writeHead(500).end();
      return;
    }
    if (url.pathname === SUMMARIES_PATH) {
      const players = (url.searchParams.get('steamids') ?? '')
        .split(',')
        .filter((steamid) => steamid !== '' && this.profilesExist)
        .map((steamid) => ({
          steamid,
          personaname: FakeSteam.personaNameFor(steamid),
          avatarfull: FakeSteam.avatarUrlFor(steamid),
        }));
      json(res, { response: { players } });
      return;
    }
    if (url.pathname === FRIENDS_PATH) {
      const list = this.friendsOf(url.searchParams.get('steamid') ?? '');
      if (list === 'private') {
        res.writeHead(401).end('<html><head><title>Unauthorized</title></head></html>');
      } else if (list === 'error') {
        res.writeHead(500).end();
      } else if (list.length === 0) {
        json(res, {}); // a Steam devolve um objeto vazio para quem não tem amigos.
      } else {
        const friends = list.map((steamid) => ({
          steamid,
          relationship: 'friend',
          friend_since: 1_700_000_000,
        }));
        json(res, { friendslist: { friends } });
      }
      return;
    }
    res.writeHead(404).end();
  };

  static async start(): Promise<FakeSteam> {
    const fake = new FakeSteam();
    const server = createServer(fake.handle);
    fake.server = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  static personaNameFor(steamId: string): string {
    return `steam-${steamId.slice(-4)}`;
  }

  static avatarUrlFor(steamId: string): string {
    return `https://avatars.steamstatic.com/${steamId}_full.jpg`;
  }

  get url(): string {
    const { port } = (this.server as Server).address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  requestsFor(steamId: string): URL[] {
    return this.requests.filter((url) => url.searchParams.get('steamids') === steamId);
  }

  friendListRequestsFor(steamId: string): URL[] {
    return this.requests.filter(
      (url) => url.pathname === FRIENDS_PATH && url.searchParams.get('steamid') === steamId,
    );
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (server === null) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function json(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

/** No E2E (Steam falsa do `fake-steam-openid.cli.ts`): lista de amigos privada. */
export const E2E_PRIVATE_FRIENDS_STEAM_ID = '76561198000009001';
/** No E2E: a Steam falha (HTTP 500) ao buscar a lista de amigos. */
export const E2E_FRIENDS_ERROR_STEAM_ID = '76561198000009002';

const E2E_FIRST_FRIEND = 76561198000000001n;
const E2E_LAST_FRIEND = 76561198000000999n;

/**
 * Regra fixa de amizades da Steam falsa do E2E: os SteamID64 de ...0001 a ...0999 são todos
 * amigos entre si (e de qualquer outro SteamID); as duas exceções dão os outros estados do bloco.
 * Quem tem a lista privada (…9001) está na lista de todos eles: a amizade é mútua, então o
 * bloco o acha pelas listas de quem está jogando.
 */
export function e2eFriendList(steamId: string): FakeFriendList {
  if (steamId === E2E_PRIVATE_FRIENDS_STEAM_ID) return 'private';
  if (steamId === E2E_FRIENDS_ERROR_STEAM_ID) return 'error';
  const friends: string[] = [];
  const inRange = BigInt(steamId) >= E2E_FIRST_FRIEND && BigInt(steamId) <= E2E_LAST_FRIEND;
  if (inRange) friends.push(E2E_PRIVATE_FRIENDS_STEAM_ID);
  for (let id = E2E_FIRST_FRIEND; id <= E2E_LAST_FRIEND; id++) {
    if (id.toString() !== steamId) friends.push(id.toString());
  }
  return friends;
}
