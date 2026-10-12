import { execFileSync } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import path from 'node:path';
import type { LiveServer, LiveServerList } from '@carmine/contracts';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * Servidores Carmine dos E2E da S06. Cada teste cadastra o seu pelo CLI da API (como a Staff) e
 * manda os batimentos como o Carmine.Core. Só Retake: o filtro de Deathmatch fica vazio nos E2E.
 */
export type E2eServer = { name: string; key: string; address: string };

export function createServer(): E2eServer {
  const name = `e2e-s06-${randomBytes(3).toString('hex')}`;
  const address = `203.0.113.${randomInt(1, 250)}:${randomInt(27015, 27999)}`;
  const output = execFileSync(
    process.execPath,
    [
      '--env-file=.env.example',
      '--env-file-if-exists=.env',
      'dist/game-servers/servers.cli.js',
      'create',
      '--name',
      name,
      '--mode',
      'retake',
      '--address',
      address,
    ],
    { cwd: path.resolve(import.meta.dirname, '../../api'), encoding: 'utf8' },
  );
  const key = /Chave: (\S+)/.exec(output)?.[1];
  if (!key) throw new Error(`O CLI de servidores não devolveu a chave:\n${output}`);
  return { name, key, address };
}

/** O Carmine.Core avisa o connect: a Conta do jogador passa a existir. */
export async function connectPlayer(
  request: APIRequestContext,
  server: E2eServer,
  steamId: string,
  steamName: string,
) {
  const response = await request.post('/api/server/player-connects', {
    headers: { authorization: `Bearer ${server.key}` },
    data: { steamId, steamName },
  });
  if (!response.ok()) throw new Error(`connect recusado: ${response.status()}`);
}

export async function heartbeat(
  request: APIRequestContext,
  server: E2eServer,
  players: string[],
  map = 'de_mirage',
) {
  const response = await request.post('/api/server/heartbeat', {
    headers: { authorization: `Bearer ${server.key}` },
    data: { map, players, maxPlayers: 9 },
  });
  if (response.status() !== 204) throw new Error(`batimento recusado: ${response.status()}`);
}

/**
 * Batimentos contínuos (o E2E roda com SERVER_OFFLINE_AFTER_SECONDS curto). `players` é lido a
 * cada batimento, então o teste muda os jogadores sem recriar o laço. Devolve o "desligar".
 */
export function keepBeating(
  request: APIRequestContext,
  server: E2eServer,
  players: () => string[],
): () => void {
  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      await heartbeat(request, server, players()).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };
  void loop();
  return () => {
    stopped = true;
  };
}

/** Um SteamID64 do intervalo que a Steam falsa trata como amigo de todo mundo (…0001 a …0999). */
export function friendSteamId(): string {
  return (76561198000000000n + BigInt(randomInt(100, 1000))).toString();
}

export function fakeServer(over: Partial<LiveServer> = {}): LiveServer {
  return {
    id: crypto.randomUUID(),
    name: `fixo-${randomBytes(2).toString('hex')}`,
    mode: 'retake',
    address: '203.0.113.200:27015',
    region: 'sao-paulo',
    map: 'de_inferno',
    players: 4,
    maxPlayers: 9,
    state: 'online',
    lastHeartbeatAt: new Date().toISOString(),
    ...over,
  };
}

/**
 * Responde o SSE da home com uma lista fixa (para estados exatos, sem depender dos servidores
 * que os outros testes ligam). `generatedAt` 5 s no futuro: a lista vence a leitura do servidor do
 * site. Com `failAfter`, só as primeiras conexões recebem a lista; as seguintes levam 503, como
 * a API fora do ar.
 */
export async function routeLiveServers(
  page: Page,
  servers: LiveServer[],
  { failAfter = Number.POSITIVE_INFINITY }: { failAfter?: number } = {},
) {
  const online = servers.filter((s) => s.state !== 'offline');
  const list: LiveServerList = {
    servers,
    summary: { online: online.length, players: online.reduce((n, s) => n + s.players, 0) },
    generatedAt: new Date(Date.now() + 5000).toISOString(),
  };
  let connections = 0;
  await page.route('**/api/servers/live', async (route) => {
    connections += 1;
    if (connections > failAfter) {
      await route.fulfill({ status: 503, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: `retry: 500\nevent: servers\ndata: ${JSON.stringify(list)}\n\n`,
    });
  });
  return list;
}
