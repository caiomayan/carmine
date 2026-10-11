import type { Params } from 'nestjs-pino';
import { CF_CONNECTING_IP, ClientIpResolver } from './client-ip/client-ip.js';
import type { AppConfig } from './config/config.js';

/** Logs estruturados em JSON (pino); legíveis no terminal só em desenvolvimento. */
export function loggerParams(config: AppConfig): Params {
  const clientIp = new ClientIpResolver(config.trustedProxies);
  return {
    pinoHttp: {
      level: config.logLevel,
      // O IP real do visitante (atrás do túnel, o socket é sempre o cloudflared).
      customProps: (req) => ({
        clientIp: clientIp.resolve(req.socket?.remoteAddress, req.headers[CF_CONNECTING_IP]),
      }),
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      // A chave dos Servidores Carmine vai no Authorization (Bearer).
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      // O health check é chamado a cada poucos segundos pelo Docker; as falhas são logadas pelo controller.
      // Sob o Fastify o middleware recebe a URL relativa ao ponto de montagem; a original fica em originalUrl.
      autoLogging: {
        ignore: (req) => {
          const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '';
          return url.split('?')[0] === '/api/health';
        },
      },
    },
  };
}
