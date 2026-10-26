import { AVATAR_ERROR_STATUS, AVATAR_MAX_UPLOAD_BYTES, type AvatarError } from '@carmine/contracts';
import type { FastifyInstance } from 'fastify';

/** A rota do envio (prefixo `api` incluso): o corpo é o arquivo cru, não JSON. */
export const AVATAR_UPLOAD_ROUTE = '/api/me/avatar';

/** O corpo passou de `AVATAR_MAX_UPLOAD_BYTES`: o controller responde `too_large`. */
export class OversizeUpload {}

/** Pára de ler (e derruba a conexão) depois de tantas vezes o limite: não vale gastar banda com abuso. */
const GIVE_UP_FACTOR = 4;

export const oversizeError = (): AvatarError => ({
  statusCode: AVATAR_ERROR_STATUS.too_large,
  code: 'too_large',
  message: `A foto passa de ${AVATAR_MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
});

/**
 * O envio da foto de perfil (ADR 0022): o corpo é a imagem (`image/*`), lida inteira em memória
 * com teto. Sem isto o Fastify recusa `image/*` com um 415 genérico. Um `Content-Length` acima do
 * teto é recusado já na entrada, com o corpo do contrato; sem ele (ou mentindo), o leitor corta.
 * O tipo exato e os bytes são conferidos no processamento (`processAvatar`).
 */
export function registerAvatarUpload(fastify: FastifyInstance): void {
  fastify.addContentTypeParser(/^image\/[\w.+-]+$/, (_request, payload, done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    let finished = false;
    const finish = (error: Error | null, body?: Buffer | OversizeUpload) => {
      if (finished) return;
      finished = true;
      done(error, body);
    };
    payload.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > AVATAR_MAX_UPLOAD_BYTES) {
        over = true;
        chunks.length = 0;
        if (size > AVATAR_MAX_UPLOAD_BYTES * GIVE_UP_FACTOR) payload.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    payload.on('end', () => finish(null, over ? new OversizeUpload() : Buffer.concat(chunks)));
    payload.on('error', (error) => finish(error));
    // Derrubada por excesso: o `end` não vem, mas o corpo já se mostrou grande demais.
    payload.on('close', () => over && finish(null, new OversizeUpload()));
  });
  fastify.addHook('onRequest', (request, reply, done) => {
    if (request.method === 'POST' && request.routeOptions.url === AVATAR_UPLOAD_ROUTE) {
      const length = Number(request.headers['content-length']);
      if (Number.isFinite(length) && length > AVATAR_MAX_UPLOAD_BYTES) {
        void reply.code(AVATAR_ERROR_STATUS.too_large).send(oversizeError());
        return;
      }
    }
    done();
  });
}
