import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './support/app.js';
import { openEventStream } from './support/event-stream.js';

describe('Cabeçalhos padrão das respostas', () => {
  let t: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    t = await startTestApp();
    await t.app.listen(0, '127.0.0.1');
    baseUrl = await t.app.getUrl();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const get = (url: string, headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'GET', url, headers });

  it('respostas de dados saem com no-store e nosniff', async () => {
    for (const url of ['/api/health', '/api/servers', '/api/me', '/api/profiles/1']) {
      const response = await get(url);
      expect(response.headers['cache-control'], url).toBe('no-store');
      expect(response.headers['x-content-type-options'], url).toBe('nosniff');
    }
  });

  it('erros e rotas inexistentes também: nenhuma resposta fica em cache de proxy', async () => {
    const notFound = await get('/api/nao-existe');
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['cache-control']).toBe('no-store');
    expect(notFound.headers['x-content-type-options']).toBe('nosniff');

    const unauthorized = await get('/api/server/health');
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers['cache-control']).toBe('no-store');
  });

  it('o equipped (lido pelo plugin, já cacheado no Valkey) também não é guardado por proxy', async () => {
    const response = await get('/api/equipped/v5/76561198000000001.json');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('o SSE mantém o seu próprio cache-control (no-transform) e ganha o nosniff', async () => {
    const stream = await openEventStream(`${baseUrl}/api/servers/live`);
    try {
      expect(stream.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(stream.headers.get('x-content-type-options')).toBe('nosniff');
    } finally {
      stream.close();
    }
  });
});
