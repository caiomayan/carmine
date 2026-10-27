import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const ID = '0d8f4b2e-6c1a-4e3f-9a57-1b2c3d4e5f60';
const call = (id: string, file: string, method = 'GET') =>
  GET(new Request(`http://web/avatars/${id}/${file}`, { method }), {
    params: Promise.resolve({ id, file }),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /avatars/<id>/<tamanho>.webp (homologação)', () => {
  it('sem MEDIA_INTERNAL_URL (produção) é um 404 comum e nem chama a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await call(ID, '512.webp');

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com a variável, busca a foto no serviço de mídia pela rede interna e a devolve com cache de um ano', async () => {
    vi.stubEnv('MEDIA_INTERNAL_URL', 'http://media:8080/');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('bytes da foto', { status: 200, headers: { 'content-type': 'image/webp' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await call(ID, '512.webp');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`http://media:8080/avatars/${ID}/512.webp`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('bytes da foto');
  });

  it('só repassa nomes no desenho da foto (nada de caminho torto)', async () => {
    vi.stubEnv('MEDIA_INTERNAL_URL', 'http://media:8080');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    for (const [id, file] of [
      ['..', '512.webp'],
      [ID, '512.png'],
      [ID, '../x.webp'],
      ['nao-e-uuid', '512.webp'],
    ] as const) {
      expect((await call(id, file)).status, `${id}/${file}`).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('foto que não existe é 404; o armazenamento fora do ar é 502', async () => {
    vi.stubEnv('MEDIA_INTERNAL_URL', 'http://media:8080');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect((await call(ID, '64.webp')).status).toBe(404);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('recusou')));
    expect((await call(ID, '64.webp')).status).toBe(502);
  });
});
