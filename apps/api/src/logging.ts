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
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    },
  };
}
