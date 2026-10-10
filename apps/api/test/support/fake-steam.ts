import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeSteamBehavior = 'ok' | 'error' | 'hang';

/**
 * Imita o `ISteamUser/GetPlayerSummaries/v2` da Steam Web API, para os testes não dependerem
 * da Steam real nem de uma chave.
 */
export class FakeSteam {
  behavior: FakeSteamBehavior = 'ok';
  readonly requests: URL[] = [];
  private readonly server: Server;

  private constructor() {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://fake-steam');
      this.requests.push(url);
      if (this.behavior === 'hang') {
        return; // nunca responde: o cliente tem de desistir pelo timeout.
      }
      if (this.behavior === 'error' || url.pathname !== '/ISteamUser/GetPlayerSummaries/v2/') {
        res.writeHead(500).end();
        return;
      }
      const players = (url.searchParams.get('steamids') ?? '')
        .split(',')
        .filter(Boolean)
        .map((steamid) => ({
          steamid,
          personaname: FakeSteam.personaNameFor(steamid),
          avatarfull: FakeSteam.avatarUrlFor(steamid),
        }));
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ response: { players } }));
    });
  }

  static async start(): Promise<FakeSteam> {
    const fake = new FakeSteam();
    await new Promise<void>((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  static personaNameFor(steamId: string): string {
    return `steam-${steamId.slice(-4)}`;
  }

  static avatarUrlFor(steamId: string): string {
    return `https://avatars.steamstatic.com/${steamId}_full.jpg`;
  }

  get url(): string {
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  requestsFor(steamId: string): URL[] {
    return this.requests.filter((url) => url.searchParams.get('steamids') === steamId);
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
