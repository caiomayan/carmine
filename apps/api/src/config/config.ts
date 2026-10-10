import { z } from 'zod';

const urlWithProtocol = (protocols: string[]) =>
  z.url().refine((value) => protocols.includes(new URL(value).protocol), {
    message: `deve usar o protocolo ${protocols.join(' ou ')}`,
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: urlWithProtocol(['postgres:', 'postgresql:']),
  VALKEY_URL: urlWithProtocol(['redis:', 'rediss:']),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  // Vazia desliga a busca de avatares (as Contas ficam com o avatar neutro).
  STEAM_WEB_API_KEY: z.string().trim().default(''),
  STEAM_WEB_API_URL: urlWithProtocol(['https:', 'http:']).default('https://api.steampowered.com'),
  STEAM_WEB_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  EQUIPPED_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  databaseUrl: string;
  valkeyUrl: string;
  healthCheckTimeoutMs: number;
  steamWebApi: { key: string | null; url: string; timeoutMs: number };
  /** Requisições por minuto, por IP, ao `equipped/v5` (o servidor de jogo pede por todos). */
  equippedRateLimitPerMinute: number;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Lê e valida as variáveis de ambiente; falha listando todas as inválidas de uma vez. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .sort()
      .join('\n');
    throw new Error(`Configuração inválida:\n${problems}`);
  }

  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    valkeyUrl: e.VALKEY_URL,
    healthCheckTimeoutMs: e.HEALTH_CHECK_TIMEOUT_MS,
    steamWebApi: {
      key: e.STEAM_WEB_API_KEY === '' ? null : e.STEAM_WEB_API_KEY,
      url: e.STEAM_WEB_API_URL.replace(/\/+$/, ''),
      timeoutMs: e.STEAM_WEB_API_TIMEOUT_MS,
    },
    equippedRateLimitPerMinute: e.EQUIPPED_RATE_LIMIT_PER_MINUTE,
  };
}
