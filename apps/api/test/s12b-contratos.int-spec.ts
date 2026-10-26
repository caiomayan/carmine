import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

const SERVER_ID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';

describe('S12b · contratos (PR só de contratos)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('as rotas novas existem e respondem 501 até a implementação entrar', async () => {
    for (const url of [
      '/api/profiles/10000/stats/activity',
      '/api/profiles/10000/stats/weapons',
      '/api/profiles/10000/sessions',
      `/api/servers/${SERVER_ID}/players`,
      `/api/servers/${SERVER_ID}/today`,
    ]) {
      const response = await t.app.inject({ url });
      expect(response.statusCode, url).toBe(501);
    }
  });

  it('o batimento e os eventos aceitam os campos novos (e os ignoram por enquanto)', async () => {
    const headers = { authorization: `Bearer ${t.serverKey}` };
    const steamId = steamIdFor(1);
    const beat = await t.app.inject({
      method: 'POST',
      url: '/api/server/heartbeat',
      headers,
      payload: {
        map: 'de_mirage',
        players: [steamId],
        maxPlayers: 9,
        match: { round: 3, ctScore: 1, tScore: 1, warmup: false },
        scoreboard: [{ steamId, team: 'ct', kills: 2, deaths: 1, score: 6 }],
      },
    });
    expect(beat.statusCode, beat.body).toBe(200);

    const events = await t.app.inject({
      method: 'POST',
      url: '/api/server/events',
      headers,
      payload: {
        kills: [],
        damages: [],
        roundEnds: [
          {
            id: '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809103',
            at: new Date().toISOString(),
            warmup: false,
            winner: 'ct',
            players: [],
            map: 'de_mirage',
            roundNumber: 3,
            scoreCt: 2,
            scoreT: 1,
          },
        ],
        sessionStarts: [],
        sessionEnds: [],
      },
    });
    expect(events.statusCode, events.body).toBe(200);
  });
});
