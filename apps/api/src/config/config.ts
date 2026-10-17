import { z } from 'zod';
import { parseTrustedProxies } from '../client-ip/client-ip.js';
import type { RateLimitPolicyName } from '../rate-limit/policies.js';

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

const perMinute = (fallback: number) => z.coerce.number().int().positive().default(fallback);

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
    // Proxies cujo CF-Connecting-IP vale como IP do visitante: o cloudflared (e o web, que o
    // repassa nas chamadas dos Server Components). IPs ou redes CIDR, separados por vírgula;
    // vazio (padrão) confia só no IP do socket.
    TRUSTED_PROXIES: z
      .string()
      .default('')
      .transform((value, ctx) => {
        try {
          return parseTrustedProxies(value);
        } catch (error) {
          ctx.addIssue({ code: 'custom', message: (error as Error).message });
          return z.NEVER;
        }
      }),
    // Requisições por minuto de cada política de rate limit (src/rate-limit/policies.ts).
    RATE_LIMIT_LOGIN_PER_MINUTE: perMinute(20),
    RATE_LIMIT_PUBLIC_PER_MINUTE: perMinute(240),
    RATE_LIMIT_EQUIPPED_PER_MINUTE: perMinute(120),
    RATE_LIMIT_MUTATIONS_PER_MINUTE: perMinute(60),
    RATE_LIMIT_SERVER_PER_MINUTE: perMinute(600),
    // Servidores ao vivo (S06): sem batimento por esse tempo, o servidor fica offline; a varredura
    // que percebe isso (e avisa a home ao vivo) roda nesse intervalo. Os dois somados ficam em até
    // 60 s (critério da S06).
    SERVER_OFFLINE_AFTER_SECONDS: z.coerce.number().int().positive().default(45),
    LIVE_SERVERS_SWEEP_SECONDS: z.coerce.number().int().positive().default(5),
    // Alertas no Discord (S09): URL do webhook; vazia desliga. O servidor precisa ficar offline por
    // esse tempo (além dos 45 s da presença) para avisar, o que evita alarme por troca de mapa.
    DISCORD_ALERT_WEBHOOK_URL: z
      .union([z.literal(''), urlWithProtocol(['https:', 'http:'])])
      .default(''),
    ALERT_SERVER_OFFLINE_CONFIRM_SECONDS: z.coerce.number().int().positive().default(60),
    ALERT_SWEEP_SECONDS: z.coerce.number().int().positive().default(15),
    // Sentry (S09): DSN vazio desliga. Ambiente e release identificam o deploy nos eventos.
    SENTRY_DSN: z.union([z.literal(''), urlWithProtocol(['https:'])]).default(''),
    SENTRY_ENVIRONMENT: z.string().trim().default(''),
    SENTRY_RELEASE: z.string().trim().default(''),
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
      for (const key of [
        'PUBLIC_WEB_URL',
        'STEAM_OPENID_URL',
        'DISCORD_ALERT_WEBHOOK_URL',
      ] as const) {
        if (env[key] !== '' && new URL(env[key]).protocol !== 'https:') {
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
  /** Proxies confiáveis (IPs e redes CIDR) para o `CF-Connecting-IP`; vazio: só o socket. */
  trustedProxies: string[];
  /** Requisições por minuto de cada política de rate limit. */
  rateLimitsPerMinute: Record<RateLimitPolicyName, number>;
  /** Servidores ao vivo (S06). */
  liveServers: { offlineAfterMs: number; sweepMs: number };
  /** Alertas no Discord (S09). Sem webhook, desligados. */
  alerts: { discordWebhookUrl: string | null; serverOfflineConfirmMs: number; sweepMs: number };
  /** Sentry (S09): sem DSN, desligado. */
  sentry: { dsn: string | null; environment: string; release: string | null };
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
    trustedProxies: e.TRUSTED_PROXIES,
    rateLimitsPerMinute: {
      login: e.RATE_LIMIT_LOGIN_PER_MINUTE,
      public: e.RATE_LIMIT_PUBLIC_PER_MINUTE,
      equipped: e.RATE_LIMIT_EQUIPPED_PER_MINUTE,
      mutations: e.RATE_LIMIT_MUTATIONS_PER_MINUTE,
      server: e.RATE_LIMIT_SERVER_PER_MINUTE,
    },
    liveServers: {
      offlineAfterMs: e.SERVER_OFFLINE_AFTER_SECONDS * 1000,
      sweepMs: e.LIVE_SERVERS_SWEEP_SECONDS * 1000,
    },
    alerts: {
      discordWebhookUrl: e.DISCORD_ALERT_WEBHOOK_URL === '' ? null : e.DISCORD_ALERT_WEBHOOK_URL,
      serverOfflineConfirmMs: e.ALERT_SERVER_OFFLINE_CONFIRM_SECONDS * 1000,
      sweepMs: e.ALERT_SWEEP_SECONDS * 1000,
    },
    sentry: {
      dsn: e.SENTRY_DSN === '' ? null : e.SENTRY_DSN,
      environment: e.SENTRY_ENVIRONMENT === '' ? e.NODE_ENV : e.SENTRY_ENVIRONMENT,
      release: e.SENTRY_RELEASE === '' ? null : e.SENTRY_RELEASE,
    },
    publicWebUrl: e.PUBLIC_WEB_URL.replace(/\/+$/, ''),
    steamOpenIdUrl: e.STEAM_OPENID_URL,
    session: {
      idleTtlSeconds: e.SESSION_IDLE_TTL_SECONDS,
      absoluteTtlSeconds: e.SESSION_ABSOLUTE_TTL_SECONDS,
    },
  };
}
