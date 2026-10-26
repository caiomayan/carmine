import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

interface StoredObject {
  body: Buffer;
  contentType: string;
  cacheControl: string | null;
}

const PURGE = /^\/client\/v4\/zones\/([^/]+)\/purge_cache$/;

/**
 * O R2 e a API de purga da Cloudflare, de mentira, num servidor só (ADR 0022): o suficiente da API
 * S3 por caminho (PutObject, GetObject, CopyObject, DeleteObject) para a API de verdade falar com
 * ele pelo SDK, e `POST /client/v4/zones/{zona}/purge_cache`. Guarda tudo em memória.
 */
export class FakeMedia {
  /** `true`: toda remoção responde 500 (a fila tem de tentar de novo). */
  failDeletes = false;
  /** `true`: a purga responde 403. */
  failPurge = false;
  /** Cada pedido de purga, na ordem: as URLs e o token usado. */
  readonly purges: { zone: string; token: string | undefined; files: string[] }[] = [];
  private readonly objects = new Map<string, StoredObject>();
  private server: Server | null = null;

  static async start(): Promise<FakeMedia> {
    const fake = new FakeMedia();
    fake.server = createServer((req, res) => void fake.handle(req, res));
    await new Promise<void>((resolve) => fake.server?.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  /** Base do endpoint S3 e da API da Cloudflare (`/client/v4`). */
  get url(): string {
    const { port } = (this.server as Server).address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  has(bucket: string, key: string): boolean {
    return this.objects.has(`${bucket}/${key}`);
  }

  get(bucket: string, key: string): StoredObject | undefined {
    return this.objects.get(`${bucket}/${key}`);
  }

  /** As chaves guardadas num bucket, em ordem. */
  keys(bucket: string): string[] {
    return [...this.objects.keys()]
      .filter((entry) => entry.startsWith(`${bucket}/`))
      .map((entry) => entry.slice(bucket.length + 1))
      .sort();
  }

  /** Põe um objeto direto (para montar um estado de partida). */
  seed(bucket: string, key: string, body: Buffer, contentType = 'image/webp'): void {
    this.objects.set(`${bucket}/${key}`, { body, contentType, cacheControl: null });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.url);
    const purge = PURGE.exec(url.pathname);
    if (purge && req.method === 'POST') {
      const body = JSON.parse((await read(req)).toString()) as { files: string[] };
      const authorization = req.headers.authorization;
      this.purges.push({
        zone: purge[1] as string,
        token: authorization?.replace(/^Bearer /, ''),
        files: body.files,
      });
      res.writeHead(this.failPurge ? 403 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: !this.failPurge }));
      return;
    }

    const [, bucket, ...rest] = decodeURIComponent(url.pathname).split('/');
    const key = rest.join('/');
    if (!bucket || !key) {
      res.writeHead(400).end();
      return;
    }
    const entry = `${bucket}/${key}`;
    switch (req.method) {
      case 'PUT': {
        const source = req.headers['x-amz-copy-source'];
        if (typeof source === 'string') {
          const copied = this.objects.get(decodeURIComponent(source.replace(/^\//, '')));
          if (!copied) return s3Error(res, 404, 'NoSuchKey');
          this.objects.set(entry, { ...copied });
          res.writeHead(200, { 'content-type': 'application/xml' });
          res.end(
            '<CopyObjectResult><ETag>"fake"</ETag><LastModified>2026-01-01T00:00:00.000Z</LastModified></CopyObjectResult>',
          );
          return;
        }
        this.objects.set(entry, {
          body: await read(req),
          contentType: String(req.headers['content-type'] ?? 'application/octet-stream'),
          cacheControl: (req.headers['cache-control'] as string | undefined) ?? null,
        });
        res.writeHead(200, { etag: '"fake"' }).end();
        return;
      }
      case 'GET': {
        const found = this.objects.get(entry);
        if (!found) return s3Error(res, 404, 'NoSuchKey');
        res.writeHead(200, { 'content-type': found.contentType, etag: '"fake"' });
        res.end(found.body);
        return;
      }
      case 'DELETE':
        if (this.failDeletes) return s3Error(res, 500, 'InternalError');
        this.objects.delete(entry);
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

async function read(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
