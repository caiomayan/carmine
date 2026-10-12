import type { OutgoingHttpHeaders } from 'node:http';
import {
  LIVE_SERVERS_EVENT,
  LIVE_SERVERS_KEEPALIVE_SECONDS,
  LIVE_SERVERS_RETRY_MS,
} from '@carmine/contracts';
import type { BeforeApplicationShutdown } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { LiveServers } from './live-servers.js';

/**
 * Os streams SSE da home (ADR 0016). Cada conexão recebe a lista inteira logo ao abrir e a cada
 * mudança; entre elas, um comentário a cada {@link LIVE_SERVERS_KEEPALIVE_SECONDS} s mantém a
 * conexão viva no Cloudflare (que derruba uma resposta parada por 100 s).
 */
export class LiveServerStreams implements BeforeApplicationShutdown {
  private readonly open = new Set<() => void>();

  constructor(private readonly live: LiveServers) {}

  /** Assume a resposta (o Fastify não a envia mais) e a mantém aberta até o cliente sair. */
  stream(reply: FastifyReply): void {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      // Os cabeçalhos já postos na resposta (os do rate limit) vão junto.
      ...(reply.getHeaders() as OutgoingHttpHeaders),
      'content-type': 'text/event-stream; charset=utf-8',
      // no-transform: nenhum proxy comprime (e segura) o stream.
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    });
    raw.write(`retry: ${LIVE_SERVERS_RETRY_MS}\n\n`);

    const keepalive = setInterval(
      () => raw.write(': keepalive\n\n'),
      LIVE_SERVERS_KEEPALIVE_SECONDS * 1000,
    );
    const unsubscribe = this.live.subscribe((list) => {
      raw.write(`event: ${LIVE_SERVERS_EVENT}\ndata: ${JSON.stringify(list)}\n\n`);
    });
    const close = () => {
      if (!this.open.delete(close)) return;
      clearInterval(keepalive);
      unsubscribe();
      raw.end();
    };
    this.open.add(close);
    // O 'close' da resposta, não o da requisição: este dispara assim que o corpo (vazio) é lido;
    // aquele, quando o cliente sai (ou quando nós encerramos).
    raw.once('close', close);
  }

  /** Quantos streams estão abertos agora. */
  get openCount(): number {
    return this.open.size;
  }

  /** Fecha os streams abertos: senão o encerramento esperaria cada cliente sair. */
  beforeApplicationShutdown(): void {
    for (const close of [...this.open]) {
      close();
    }
  }
}
