import {
  LIVE_SERVERS_EVENT,
  LIVE_SERVERS_RETRY_MS,
  type LiveServerList,
  liveServerListSchema,
  type ServerHeartbeat,
} from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { openEventStream } from './support/event-stream.js';

describe('Servidores ao vivo (S06)', () => {
  let t: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    t = await startTestApp({
      // Encurtados para o teste não esperar 45 s; o padrão (45 s + varredura de 5 s ≤ 60 s) está
      // no teste de configuração.
      SERVER_OFFLINE_AFTER_SECONDS: '2',
      LIVE_SERVERS_SWEEP_SECONDS: '1',
    });
    await t.app.listen(0, '127.0.0.1');
    baseUrl = await t.app.getUrl();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const heartbeat = (key: string, body: ServerHeartbeat) =>
    t.app.inject({
      method: 'POST',
      url: '/api/server/heartbeat',
      headers: { authorization: `Bearer ${key}` },
      payload: body,
    });

  async function list(): Promise<LiveServerList> {
    const response = await t.app.inject({ method: 'GET', url: '/api/servers' });
    expect(response.statusCode, response.body).toBe(200);
    return liveServerListSchema.parse(response.json());
  }

  async function newServer(name: string, mode: 'retake' | 'deathmatch' = 'retake') {
    const { server, key } = await t.app
      .get(GameServerRegistry)
      .register({ name, mode, address: '127.0.0.1:27020' });
    return { server, key };
  }

  it('um batimento com chave inválida recebe 401', async () => {
    const response = await heartbeat('cmk_invalida', {
      map: 'de_dust2',
      players: [],
      maxPlayers: 9,
    });

    expect(response.statusCode).toBe(401);
  });

  it('o batimento põe o servidor online na lista pública, com mapa, jogadores e região', async () => {
    const { server, key } = await newServer('retake-lista');

    const response = await heartbeat(key, {
      map: 'de_mirage',
      players: [steamIdFor(1), steamIdFor(2)],
      maxPlayers: 9,
    });

    expect(response.statusCode, response.body).toBe(204);
    const listed = (await list()).servers.find((s) => s.id === server.id);
    expect(listed).toMatchObject({
      name: 'retake-lista',
      mode: 'retake',
      address: '127.0.0.1:27020',
      region: 'sao-paulo',
      map: 'de_mirage',
      players: 2,
      maxPlayers: 9,
      state: 'online',
    });
  });

  it('um servidor cheio aparece lotado e o rodapé soma os jogadores', async () => {
    const { server, key } = await newServer('dm-lotado', 'deathmatch');
    const before = (await list()).summary;

    await heartbeat(key, {
      map: 'de_inferno',
      players: [steamIdFor(10), steamIdFor(11)],
      maxPlayers: 2,
    });

    const after = await list();
    expect(after.servers.find((s) => s.id === server.id)?.state).toBe('full');
    expect(after.summary).toEqual({ online: before.online + 1, players: before.players + 2 });
  });

  it('um jogador entra e o contador muda ao vivo, sem recarregar (evento SSE)', async () => {
    const { server, key } = await newServer('retake-ao-vivo');
    await heartbeat(key, { map: 'de_nuke', players: [steamIdFor(20)], maxPlayers: 9 });
    const stream = await openEventStream(`${baseUrl}/api/servers/live`);
    try {
      expect(stream.headers.get('content-type')).toMatch(/^text\/event-stream/);
      const first = await stream.next();
      expect(first.event).toBe(LIVE_SERVERS_EVENT);
      expect(stream.retry).toBe(LIVE_SERVERS_RETRY_MS);
      const initial = liveServerListSchema.parse(JSON.parse(first.data));
      expect(initial.servers.find((s) => s.id === server.id)?.players).toBe(1);

      const sentAt = Date.now();
      await heartbeat(key, {
        map: 'de_nuke',
        players: [steamIdFor(20), steamIdFor(21)],
        maxPlayers: 9,
      });

      const changed = await stream.until((message) => {
        const live = liveServerListSchema.parse(JSON.parse(message.data));
        return live.servers.find((s) => s.id === server.id)?.players === 2;
      });
      expect(changed.event).toBe(LIVE_SERVERS_EVENT);
      // O batimento já chega logo depois do connect; o evento sai na hora, não na varredura.
      expect(Date.now() - sentAt).toBeLessThan(500);
    } finally {
      stream.close();
    }
  });

  it('sem batimento, o servidor fica offline e o evento sai sozinho', async () => {
    const { server, key } = await newServer('retake-desliga');
    await heartbeat(key, { map: 'de_anubis', players: [steamIdFor(30)], maxPlayers: 9 });
    const stream = await openEventStream(`${baseUrl}/api/servers/live`);
    try {
      const offline = await stream.until((message) => {
        const live = liveServerListSchema.parse(JSON.parse(message.data));
        return live.servers.find((s) => s.id === server.id)?.state === 'offline';
      }, 6000);

      const listed = liveServerListSchema
        .parse(JSON.parse(offline.data))
        .servers.find((s) => s.id === server.id);
      expect(listed).toMatchObject({ map: null, players: 0, maxPlayers: 9 });
      expect(listed?.lastHeartbeatAt).not.toBeNull();
    } finally {
      stream.close();
    }
  });

  it('rejeita um batimento malformado', async () => {
    const { key } = await newServer('retake-invalido');

    const response = await heartbeat(key, {
      map: '',
      players: ['123'],
      maxPlayers: 0,
    } as ServerHeartbeat);

    expect(response.statusCode).toBe(400);
  });
});
