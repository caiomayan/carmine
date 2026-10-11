import { z } from 'zod';

const urlWithProtocol = (protocols: string[]) =>
  z.url().refine((value) => protocols.includes(new URL(value).protocol), {
    message: `deve usar o protocolo ${protocols.join(' ou ')}`,
  });

/** Origem (esquema, host e porta), sem caminho: a barra final é tolerada. */
const origin = () =>
  urlWithProtocol(['https:', 'http:']).refine((value) => new URL(value).pathname === '/', {
    message: 'deve ser só a origem, sem caminho (ex.: https://stcarmine.com)',
  });

const DAY_SECONDS = 24 * 60 * 60;

const envSchema = z
  .object({
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
    // Onde o web é servido; a API fica em <origem>/api (mesma origem, ADR 0015). É o realm do
    // login Steam e a base do return_to e dos redirecionamentos depois do login.
    PUBLIC_WEB_URL: origin().default('http://localhost:3000'),
    // Endpoint OpenID 2.0 da Steam; nos testes, a Steam falsa local.
    STEAM_OPENID_URL: urlWithProtocol(['https:', 'http:']).default(
      'https://steamcommunity.com/openid/login',
    ),
    // A sessão expira depois desse tempo sem uso (renovação deslizante) ...
    SESSION_IDLE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(14 * DAY_SECONDS),
    // ... e, mesmo em uso, depois desse tempo do login.
    SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(90 * DAY_SECONDS),
  })
  .superRefine((env, ctx) => {
    if (env.SESSION_ABSOLUTE_TTL_SECONDS < env.SESSION_IDLE_TTL_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_ABSOLUTE_TTL_SECONDS'],
        message: 'deve ser maior ou igual a SESSION_IDLE_TTL_SECONDS',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of ['PUBLIC_WEB_URL', 'STEAM_OPENID_URL'] as const) {
        if (new URL(env[key]).protocol !== 'https:') {
          ctx.addIssue({ code: 'custom', path: [key], message: 'deve usar https em produção' });
        }
      }
    }
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
  /** Origem pública do web, sem barra final (ex.: `https://stcarmine.com`). */
  publicWebUrl: string;
  steamOpenIdUrl: string;
  session: { idleTtlSeconds: number; absoluteTtlSeconds: number };
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
    publicWebUrl: e.PUBLIC_WEB_URL.replace(/\/+$/, ''),
    steamOpenIdUrl: e.STEAM_OPENID_URL,
    session: {
      idleTtlSeconds: e.SESSION_IDLE_TTL_SECONDS,
      absoluteTtlSeconds: e.SESSION_ABSOLUTE_TTL_SECONDS,
    },
  };
}
