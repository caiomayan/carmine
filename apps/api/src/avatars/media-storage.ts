import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import type { MediaConfig } from '../config/config.js';

/** Em que bucket do R2 (ADR 0022): o público serve a CDN; o privado guarda o que saiu do ar. */
export type MediaBucket = 'public' | 'private';

export interface MediaObject {
  bucket: MediaBucket;
  key: string;
}

/** O R2 de mídia como a API o usa. Tudo idempotente: apagar o que não existe não é erro. */
export interface MediaStorage {
  put(object: MediaObject, body: Buffer, contentType: string): Promise<void>;
  /** `null` se o objeto não existe. */
  get(object: MediaObject): Promise<Buffer | null>;
  copy(from: MediaObject, to: MediaObject): Promise<void>;
  delete(object: MediaObject): Promise<void>;
}

/** Tira uma URL pública do cache da CDN (depois de apagar o arquivo). */
export interface CdnPurger {
  purge(urls: string[]): Promise<void>;
}

/** Uma foto nunca muda sob a mesma URL (o ID é novo a cada envio): cache de um ano na borda e no navegador. */
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const isNotFound = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { name?: string }).name === 'NoSuchKey' ||
    (error as { name?: string }).name === 'NotFound' ||
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);

/** O R2 pela API S3 (endereçamento por caminho, região `auto`). */
export class R2MediaStorage implements MediaStorage {
  private readonly client: S3Client;

  constructor(private readonly config: MediaConfig) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      forcePathStyle: true,
      // O R2 não aceita os checksums extras que o SDK passou a mandar por padrão.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private bucketOf(bucket: MediaBucket): string {
    return bucket === 'public' ? this.config.publicBucket : this.config.privateBucket;
  }

  async put({ bucket, key }: MediaObject, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketOf(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(bucket === 'public' && { CacheControl: PUBLIC_CACHE_CONTROL }),
      }),
    );
  }

  async get({ bucket, key }: MediaObject): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketOf(bucket), Key: key }),
      );
      return Buffer.from((await result.Body?.transformToByteArray()) ?? []);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async copy(from: MediaObject, to: MediaObject): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucketOf(to.bucket),
        Key: to.key,
        CopySource: `${this.bucketOf(from.bucket)}/${encodeURIComponent(from.key).replaceAll('%2F', '/')}`,
        // O CopyObject mantém os metadados do original (tipo e cache).
        MetadataDirective: 'COPY',
      }),
    );
  }

  async delete({ bucket, key }: MediaObject): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketOf(bucket), Key: key }));
  }
}

/** A API da Cloudflare aceita até 30 URLs por pedido de purga. */
const PURGE_BATCH = 30;

/** Purga por URL na Cloudflare (`POST /zones/{zona}/purge_cache`). */
export class CloudflarePurger implements CdnPurger {
  constructor(
    private readonly options: { zoneId: string; token: string; apiUrl: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async purge(urls: string[]): Promise<void> {
    for (let start = 0; start < urls.length; start += PURGE_BATCH) {
      const response = await this.fetchImpl(
        `${this.options.apiUrl}/zones/${this.options.zoneId}/purge_cache`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ files: urls.slice(start, start + PURGE_BATCH) }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        throw new Error(`purga da CDN recusada (${response.status})`);
      }
    }
  }
}

/** Sem a Cloudflare configurada (desenvolvimento, homologação): nada a purgar. */
export class NoPurger implements CdnPurger {
  private readonly logger = new Logger(NoPurger.name);
  private warned = false;

  async purge(urls: string[]): Promise<void> {
    if (!this.warned && urls.length > 0) {
      this.warned = true;
      this.logger.warn(
        'CLOUDFLARE_ZONE_ID/CLOUDFLARE_PURGE_TOKEN vazios: fotos apagadas só somem do cache ao expirar',
      );
    }
  }
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
export const CDN_PURGER = Symbol('CDN_PURGER');
