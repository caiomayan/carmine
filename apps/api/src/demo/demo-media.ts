import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { DEMO_ALLOWED_HOSTS, DemoNotAllowed } from './demo-guard.js';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * O armazenamento de mídia da homologação: um R2 de mentira, em disco, na própria imagem da API. Existe só para a
 * foto de perfil rodar de verdade em `dev.stcarmine.com` sem conta nem bucket da Cloudflare; a produção usa o R2.
 * As mesmas quatro chaves da demonstração (menos o segredo do seed): `CARMINE_DEMO=homologacao`, `PUBLIC_WEB_URL`
 * num host de homologação e `SENTRY_ENVIRONMENT` diferente de `production`.
 */
export function assertHomologation(env: Env): void {
  if (env.CARMINE_DEMO !== 'homologacao') {
    throw new DemoNotAllowed('CARMINE_DEMO não é "homologacao"');
  }
  let host: string;
  try {
    host = new URL((env.PUBLIC_WEB_URL ?? '').trim()).hostname;
  } catch {
    throw new DemoNotAllowed('PUBLIC_WEB_URL ausente ou inválida');
  }
  if (!DEMO_ALLOWED_HOSTS.has(host)) {
    throw new DemoNotAllowed(`PUBLIC_WEB_URL aponta para ${host}`);
  }
  if ((env.SENTRY_ENVIRONMENT ?? '').trim().toLowerCase() === 'production') {
    throw new DemoNotAllowed('SENTRY_ENVIRONMENT é production');
  }
}

export interface MediaStoreOptions {
  /** Pasta onde os arquivos ficam (um volume do compose). */
  root: string;
  /** Os dois buckets que a API usa: o público (servido) e o privado (nunca servido). */
  publicBucket: string;
  privateBucket: string;
  /** A chave de acesso que a API usa; o pedido sem ela é recusado (a rede é interna, isto é só um cinto). */
  accessKeyId: string;
}

interface Meta {
  contentType: string;
  cacheControl: string | null;
}

/** Só estas chaves existem (`avatars/<id>/<tamanho>.webp` e `removed/<id>/<tamanho>.webp`). */
const KEY = /^(avatars|removed)\/[0-9a-f-]{36}\/\d{2,4}\.webp$/;
/** O que o navegador pode pedir: a foto no ar, pelo mesmo caminho da produção (`img.stcarmine.com/avatars/...`). */
const PUBLIC_PATH = /^\/avatars\/[0-9a-f-]{36}\/\d{2,4}\.webp$/;

/**
 * O servidor de mídia da homologação, com duas portas: a **da API** (S3 por caminho: PutObject, GetObject,
 * CopyObject e DeleteObject, o que a `R2MediaStorage` usa; só na rede interna) e a **pública** (só GET e HEAD das
 * fotos no ar, no mesmo caminho da produção; é a que o túnel expõe). O bucket privado nunca sai pela pública.
 */
export class MediaStore {
  private servers: Server[] = [];

  constructor(private readonly options: MediaStoreOptions) {}

  async listen(
    ports: { api: number; public: number },
    host = '0.0.0.0',
  ): Promise<{ api: number; public: number }> {
    const api = createServer((req, res) => void this.handleApi(req, res));
    const open = createServer((req, res) => void this.handlePublic(req, res));
    this.servers = [api, open];
    const bound = await Promise.all(
      [
        [api, ports.api],
        [open, ports.public],
      ].map(
        ([server, port]) =>
          new Promise<number>((resolve, reject) => {
            (server as Server).once('error', reject);
            (server as Server).listen(port as number, host, () => {
              const address = (server as Server).address();
              resolve(typeof address === 'object' && address ? address.port : (port as number));
            });
          }),
      ),
    );
    return { api: bound[0] as number, public: bound[1] as number };
  }

  async close(): Promise<void> {
    await Promise.all(
      this.servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  }

  private fileOf(bucket: string, key: string): string | null {
    if (bucket !== this.options.publicBucket && bucket !== this.options.privateBucket) return null;
    if (!KEY.test(key)) return null;
    return path.join(this.options.root, bucket, ...key.split('/'));
  }

  private async load(file: string): Promise<{ body: Buffer; meta: Meta } | null> {
    try {
      const [body, meta] = await Promise.all([readFile(file), readFile(`${file}.meta`, 'utf8')]);
      return { body, meta: JSON.parse(meta) as Meta };
    } catch {
      return null;
    }
  }

  private async store(file: string, body: Buffer, meta: Meta): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    await Promise.all([writeFile(file, body), writeFile(`${file}.meta`, JSON.stringify(meta))]);
  }

  /** A porta pública: só a foto no ar, só leitura. */
  private async handlePublic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://media');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const file = PUBLIC_PATH.test(url.pathname)
      ? this.fileOf(this.options.publicBucket, url.pathname.slice(1))
      : null;
    const found = file ? await this.load(file) : null;
    if (!found) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': found.meta.contentType,
      'content-length': found.body.length,
      'cache-control': found.meta.cacheControl ?? 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : found.body);
  }

  /** A porta da API: S3 por caminho. */
  private async handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!(req.headers.authorization ?? '').includes(`Credential=${this.options.accessKeyId}/`)) {
      s3Error(res, 403, 'AccessDenied');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://media');
    const [, bucket = '', ...rest] = decodeURIComponent(url.pathname).split('/');
    const file = this.fileOf(bucket, rest.join('/'));
    if (!file) {
      s3Error(res, 404, 'NoSuchKey');
      return;
    }
    switch (req.method) {
      case 'PUT': {
        const source = req.headers['x-amz-copy-source'];
        if (typeof source === 'string') {
          const [fromBucket = '', ...fromKey] = decodeURIComponent(source.replace(/^\//, '')).split(
            '/',
          );
          const from = this.fileOf(fromBucket, fromKey.join('/'));
          const copied = from ? await this.load(from) : null;
          if (!copied) return s3Error(res, 404, 'NoSuchKey');
          await this.store(file, copied.body, copied.meta);
          res.writeHead(200, { 'content-type': 'application/xml' });
          res.end(
            `<CopyObjectResult><ETag>"demo"</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`,
          );
          return;
        }
        await this.store(file, await readBody(req), {
          contentType: String(req.headers['content-type'] ?? 'application/octet-stream'),
          cacheControl: (req.headers['cache-control'] as string | undefined) ?? null,
        });
        res.writeHead(200, { etag: '"demo"' }).end();
        return;
      }
      case 'GET': {
        const found = await this.load(file);
        if (!found) return s3Error(res, 404, 'NoSuchKey');
        res.writeHead(200, { 'content-type': found.meta.contentType, etag: '"demo"' });
        res.end(found.body);
        return;
      }
      case 'DELETE':
        await Promise.all([rm(file, { force: true }), rm(`${file}.meta`, { force: true })]);
        res.writeHead(204).end();
        return;
      default:
        res.writeHead(405).end();
    }
  }
}

function s3Error(res: ServerResponse, status: number, code: string): void {
  res.writeHead(status, { 'content-type': 'application/xml' });
  res.end(`<Error><Code>${code}</Code><Message>${code}</Message></Error>`);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
