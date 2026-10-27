import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameServers, serverPresenceSamples } from '../src/database/schema.js';
import { ServerPresenceSamples } from '../src/live-servers/server-presence-samples.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

/**
 * O amostrador de jogadores simultâneos (A1, ADR 0021): uma amostra por minuto por servidor, só com a contagem, gravada
 * pelo batimento. É o pico e a média do "mídia kit" (a Presença, no Valkey, não guardava histórico).
 */
describe('Amostras de presença (jogadores simultâneos)', () => {
  let t: TestApp;
  let serverId: string;

  beforeAll(async () => {
    t = await startTestApp();
    const [server] = await t.postgres.db.select({ id: gameServers.id }).from(gameServers);
    serverId = server?.id as string;
  });

  afterAll(async () => {
    await t?.stop();
  });

  const samples = () =>
    t.postgres.db
      .select()
      .from(serverPresenceSamples)
      .where(eq(serverPresenceSamples.serverId, serverId))
      .orderBy(asc(serverPresenceSamples.at));

  const heartbeat = (players: string[]) =>
    t.app.inject({
      method: 'POST',
      url: '/api/server/heartbeat',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { map: 'de_mirage', players, maxPlayers: 10 },
    });

  it('o batimento grava a amostra do minuto com a contagem de jogadores (sem repetir o mesmo jogador)', async () => {
    const response = await heartbeat([steamIdFor(1), steamIdFor(2), steamIdFor(2), steamIdFor(3)]);
    expect(response.statusCode, response.body).toBe(200);

    await expect.poll(async () => (await samples()).length, { timeout: 5000 }).toBe(1);
    const [sample] = await samples();
    expect(sample?.players).toBe(3);
    // O minuto cheio, sem segundos.
    expect((sample?.at.getTime() ?? 1) % 60_000).toBe(0);
    // Só servidor, minuto e contagem: nenhuma coluna de pessoa.
    expect(Object.keys(sample ?? {}).sort()).toEqual(['at', 'players', 'serverId']);
  });

  it('batimentos no mesmo minuto não gravam outra amostra', async () => {
    const before = (await samples()).length;

    await heartbeat([steamIdFor(1)]);
    await heartbeat([steamIdFor(1), steamIdFor(2)]);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Pode haver a do minuto seguinte se a virada caiu no meio do teste; nunca duas no mesmo minuto.
    const after = await samples();
    expect(after.length).toBeLessThanOrEqual(before + 1);
    expect(new Set(after.map((row) => row.at.getTime())).size).toBe(after.length);
  });

  it('um minuto novo grava outra amostra; duas instâncias no mesmo minuto deixam só uma linha', async () => {
    const sampler = new ServerPresenceSamples(t.postgres.db);
    const other = new ServerPresenceSamples(t.postgres.db);
    const base = new Date('2030-01-01T10:00:20.000Z');

    await sampler.record(serverId, 4, base);
    await sampler.record(serverId, 9, new Date(base.getTime() + 15_000));
    await other.record(serverId, 5, new Date(base.getTime() + 30_000));
    await sampler.record(serverId, 6, new Date(base.getTime() + 65_000));

    const rows = (await samples()).filter((row) => row.at.getUTCFullYear() === 2030);
    expect(rows.map((row) => [row.at.toISOString(), row.players])).toEqual([
      ['2030-01-01T10:00:00.000Z', 4],
      ['2030-01-01T10:01:00.000Z', 6],
    ]);
  });

  it('apagar o servidor leva as amostras (cascata)', async () => {
    const sampler = new ServerPresenceSamples(t.postgres.db);
    const [created] = await t.postgres.db
      .insert(gameServers)
      .values({
        name: 'efemero',
        mode: 'retake',
        address: '127.0.0.1:27099',
        keyHash: 'x'.repeat(64),
      })
      .returning({ id: gameServers.id });
    const id = created?.id as string;
    await sampler.record(id, 2, new Date('2030-02-02T00:00:00.000Z'));

    await t.postgres.db.delete(gameServers).where(eq(gameServers.id, id));

    expect(
      await t.postgres.db
        .select()
        .from(serverPresenceSamples)
        .where(eq(serverPresenceSamples.serverId, id)),
    ).toEqual([]);
  });
});
