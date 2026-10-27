import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { R2MediaStorage } from '../avatars/media-storage.js';
import { DemoNotAllowed } from './demo-guard.js';
import { assertHomologation, MediaStore } from './demo-media.js';

const PUBLIC = 'carmine-media-hml';
const PRIVATE = 'carmine-media-removidas-hml';
const KEY_ID = 'carmine-hml';
const ID = '0d8f4b2e-6c1a-4e3f-9a57-1b2c3d4e5f60';
const OTHER = '1e9a5c3f-7d2b-4f40-8b68-2c3d4e5f6071';

describe('assertHomologation', () => {
  const ok = {
    CARMINE_DEMO: 'homologacao',
    PUBLIC_WEB_URL: 'https://dev.stcarmine.com',
    SENTRY_ENVIRONMENT: 'staging',
  };

  it('aceita a homologação', () => {
    expect(() => assertHomologation(ok)).not.toThrow();
  });

  it('recusa a produção, em cada chave', () => {
    expect(() => assertHomologation({ ...ok, CARMINE_DEMO: undefined })).toThrow(DemoNotAllowed);
    expect(() => assertHomologation({ ...ok, PUBLIC_WEB_URL: 'https://stcarmine.com' })).toThrow(
      DemoNotAllowed,
    );
    expect(() => assertHomologation({ ...ok, PUBLIC_WEB_URL: undefined })).toThrow(DemoNotAllowed);
    expect(() => assertHomologation({ ...ok, SENTRY_ENVIRONMENT: 'production' })).toThrow(
      DemoNotAllowed,
    );
  });
});

/** O mesmo `R2MediaStorage` da API conversando com o armazenamento de mentira da homologação. */
describe('MediaStore (o R2 de mentira da homologação)', () => {
  let root: string;
  let store: MediaStore;
  let apiUrl: string;
  let publicUrl: string;
  let storage: R2MediaStorage;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'carmine-media-'));
    store = new MediaStore({
      root,
      publicBucket: PUBLIC,
      privateBucket: PRIVATE,
      accessKeyId: KEY_ID,
    });
    const ports = await store.listen({ api: 0, public: 0 }, '127.0.0.1');
    apiUrl = `http://127.0.0.1:${ports.api}`;
    publicUrl = `http://127.0.0.1:${ports.public}`;
    storage = new R2MediaStorage({
      endpoint: apiUrl,
      accessKeyId: KEY_ID,
      secretAccessKey: 'segredo',
      publicBucket: PUBLIC,
      privateBucket: PRIVATE,
      publicUrl,
      purge: null,
      sweepMs: 0,
    });
  });

  afterAll(async () => {
    await store.close();
    await rm(root, { recursive: true, force: true });
  });

  const key = (id: string, size = 512) => `avatars/${id}/${size}.webp`;

  it('guarda, lê, copia e apaga como o R2, com o tipo e o cache da foto', async () => {
    const body = Buffer.from('uma imagem qualquer');
    await storage.put({ bucket: 'public', key: key(ID) }, body, 'image/webp');

    expect((await storage.get({ bucket: 'public', key: key(ID) }))?.equals(body)).toBe(true);
    expect(await storage.get({ bucket: 'public', key: key(OTHER) })).toBeNull();

    await storage.copy(
      { bucket: 'public', key: key(ID) },
      { bucket: 'private', key: `removed/${ID}/512.webp` },
    );
    expect(
      (await storage.get({ bucket: 'private', key: `removed/${ID}/512.webp` }))?.equals(body),
    ).toBe(true);

    await storage.delete({ bucket: 'public', key: key(ID) });
    expect(await storage.get({ bucket: 'public', key: key(ID) })).toBeNull();
    // Apagar o que não existe não é erro.
    await storage.delete({ bucket: 'public', key: key(ID) });
    // A cópia privada segue.
    expect(await storage.get({ bucket: 'private', key: `removed/${ID}/512.webp` })).not.toBeNull();
  });

  it('a porta pública serve só a foto no ar, no caminho da produção, com cache de um ano', async () => {
    const body = Buffer.from('foto no ar');
    await storage.put({ bucket: 'public', key: key(ID, 256) }, body, 'image/webp');
    await storage.put({ bucket: 'private', key: `removed/${ID}/256.webp` }, body, 'image/webp');

    const ok = await fetch(`${publicUrl}/avatars/${ID}/256.webp`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/webp');
    expect(ok.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await ok.arrayBuffer()).equals(body)).toBe(true);
    expect((await fetch(`${publicUrl}/avatars/${ID}/256.webp`, { method: 'HEAD' })).status).toBe(
      200,
    );

    // Nada além da foto: o privado, a listagem, a raiz e caminhos tortos.
    for (const nope of [
      `/removed/${ID}/256.webp`,
      `/${PRIVATE}/removed/${ID}/256.webp`,
      `/${PUBLIC}/avatars/${ID}/256.webp`,
      '/avatars/',
      '/',
      `/avatars/${ID}/../256.webp`,
      `/avatars/${OTHER}/256.webp`,
    ]) {
      expect((await fetch(`${publicUrl}${nope}`)).status, nope).toBe(404);
    }
    expect((await fetch(`${publicUrl}/avatars/${ID}/256.webp`, { method: 'PUT' })).status).toBe(
      405,
    );
    expect((await fetch(`${publicUrl}/avatars/${ID}/256.webp`, { method: 'DELETE' })).status).toBe(
      405,
    );
    expect((await fetch(`${publicUrl}/healthz`)).status).toBe(200);
  });

  it('a porta da API recusa quem não traz a chave e chaves fora do desenho', async () => {
    expect((await fetch(`${apiUrl}/${PUBLIC}/${key(ID)}`)).status).toBe(403);
    const auth = {
      authorization: `AWS4-HMAC-SHA256 Credential=${KEY_ID}/20260101/auto/s3/aws4_request`,
    };
    for (const nope of [
      `/${PUBLIC}/../etc/passwd`,
      `/${PUBLIC}/avatars/nao-e-uuid/512.webp`,
      `/outro-bucket/${key(ID)}`,
    ]) {
      expect((await fetch(`${apiUrl}${nope}`, { headers: auth })).status, nope).toBe(404);
    }
  });
});
