import type { Params } from 'nestjs-pino';
import type { AppConfig } from './config/config.js';

/** Logs estruturados em JSON (pino); legíveis no terminal só em desenvolvimento. */
export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-server-key"]'],
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
