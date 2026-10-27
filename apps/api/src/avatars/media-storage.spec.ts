import { describe, expect, it, vi } from 'vitest';
import { CloudflarePurger } from './media-storage.js';

const options = { zoneId: 'zona-1', token: 'segredo', apiUrl: 'https://cf.test/client/v4' };

const respondingWith = (status: number) =>
  vi.fn<typeof fetch>(async () => new Response('{}', { status }));

const filesOf = (init: RequestInit | undefined) =>
  (JSON.parse(String(init?.body)) as { files: string[] }).files;

describe('CloudflarePurger', () => {
  it('purga por URL na zona, com o token da Cloudflare', async () => {
    const fetchImpl = respondingWith(200);

    await new CloudflarePurger(options, fetchImpl).purge(['https://img.test/a.webp']);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://cf.test/client/v4/zones/zona-1/purge_cache');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer segredo' });
    expect(filesOf(init)).toEqual(['https://img.test/a.webp']);
  });

  it('manda no máximo 30 URLs por pedido (o limite da API)', async () => {
    const fetchImpl = respondingWith(200);
    const urls = Array.from({ length: 65 }, (_, i) => `https://img.test/${i}.webp`);

    await new CloudflarePurger(options, fetchImpl).purge(urls);

    expect(fetchImpl.mock.calls.map(([, init]) => filesOf(init).length)).toEqual([30, 30, 5]);
  });

  it('rejeita quando a Cloudflare recusa, para a fila tentar de novo', async () => {
    await expect(
      new CloudflarePurger(options, respondingWith(403)).purge(['https://img.test/a.webp']),
    ).rejects.toThrow('403');
  });

  it('sem URLs não faz pedido nenhum', async () => {
    const fetchImpl = respondingWith(200);

    await new CloudflarePurger(options, fetchImpl).purge([]);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
