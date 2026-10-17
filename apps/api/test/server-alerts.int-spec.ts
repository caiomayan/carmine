import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { startTestApp, type TestApp } from './support/app.js';

/** Aceite da S09: derrubar um servidor CS2 gera um alerta no Discord (aqui, um webhook falso). */
describe('Alertas de Servidor Carmine no Discord (S09)', () => {
  let t: TestApp;
  let webhook: Server;
  const messages: string[] = [];

  beforeAll(async () => {
    webhook = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        messages.push(
          (JSON.parse(Buffer.concat(chunks).toString()) as { content: string }).content,
        );
        response.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) => webhook.listen(0, '127.0.0.1', resolve));
    const { port } = webhook.address() as AddressInfo;

    t = await startTestApp({
      // Em produção o webhook é https (a configuração exige); o do teste é o servidor local acima.
      DISCORD_ALERT_WEBHOOK_URL: `http://127.0.0.1:${port}/webhook`,
      SERVER_OFFLINE_AFTER_SECONDS: '1',
      LIVE_SERVERS_SWEEP_SECONDS: '1',
      ALERT_SERVER_OFFLINE_CONFIRM_SECONDS: '1',
      ALERT_SWEEP_SECONDS: '1',
    });
  });

  afterAll(async () => {
    await t?.stop();
    webhook?.close();
  });

  it('o servidor que para de mandar batimento gera o aviso de offline e, ao voltar, o de volta', async () => {
    const { key } = await t.app
      .get(GameServerRegistry)
      .register({ name: 'retake-alerta', mode: 'retake', address: '127.0.0.1:27030' });
    const heartbeat = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/server/heartbeat',
        headers: { authorization: `Bearer ${key}` },
        payload: { map: 'de_nuke', players: [], maxPlayers: 9 },
      });

    expect((await heartbeat()).statusCode).toBe(200);
    await expect
      .poll(() => messages.find((m) => m.includes('retake-alerta') && m.startsWith('🔴')), {
        timeout: 15_000,
        interval: 250,
      })
      .toContain('**retake-alerta** está offline');

    expect((await heartbeat()).statusCode).toBe(200);
    await expect
      .poll(() => messages.find((m) => m.includes('retake-alerta') && m.startsWith('🟢')), {
        timeout: 15_000,
        interval: 250,
      })
      .toContain('**retake-alerta** voltou');
  });
});
