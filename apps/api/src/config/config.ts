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

/** ID do Discord (snowflake) ou vazio. */
const snowflake = () =>
  z
    .union([
      z
        .string()
        .trim()
        .regex(/^\d{15,25}$/, 'deve ser um ID do Discord (só dígitos)'),
      z.literal(''),
    ])
    .default('');

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
    RATE_LIMIT_SEARCH_PER_MINUTE: perMinute(60),
    RATE_LIMIT_EQUIPPED_PER_MINUTE: perMinute(120),
    RATE_LIMIT_MUTATIONS_PER_MINUTE: perMinute(60),
    RATE_LIMIT_SERVER_PER_MINUTE: perMinute(600),
    // Servidores ao vivo (S06): sem batimento por esse tempo, o servidor fica offline; a varredura
    // que percebe isso (e avisa a home ao vivo) roda nesse intervalo. Os dois somados ficam em até
    // 60 s (critério da S06).
    SERVER_OFFLINE_AFTER_SECONDS: z.coerce.number().int().positive().default(45),
    LIVE_SERVERS_SWEEP_SECONDS: z.coerce.number().int().positive().default(5),
    // Ranking semanal (S12): quanto o resultado de um Modo e semana fica no cache do Valkey (0 desliga).
    RANKING_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(45),
    // Faixa "Esta semana" da home: quanto os números da semana ficam na memória da API (0 desliga).
    WEEK_SUMMARY_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(30),
    // Prévias do header (U3e): quanto a resposta de cada Conta (e a do visitante) fica no cache do Valkey (0 desliga).
    HEADER_PREVIEWS_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(15),
    // Faixa de atividade ao vivo da home: quanto a resposta pública fica no cache do Valkey (0 desliga).
    ACTIVITY_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(5),
    // Alertas no Discord (S09): URL do webhook; vazia desliga. O servidor precisa ficar offline por
    // esse tempo (além dos 45 s da presença) para avisar, o que evita alarme por troca de mapa.
    DISCORD_ALERT_WEBHOOK_URL: z
      .union([z.literal(''), urlWithProtocol(['https:', 'http:'])])
      .default(''),
    // Denúncias (S13): webhook do canal da Staff, separado do de alertas; vazio desliga. A limpeza de
    // retenção (chat 30 dias, Denúncia 90 dias) roda de tantos em tantos minutos (0 desliga).
    STAFF_REPORTS_WEBHOOK_URL: z
      .union([z.literal(''), urlWithProtocol(['https:', 'http:'])])
      .default(''),
    RETENTION_SWEEP_MINUTES: z.coerce.number().int().nonnegative().default(60),
    // Discord integrado (S15): o vínculo da Conta, os cargos sincronizados e o status dos servidores.
    // Sem o conjunto base (as quatro primeiras), a S15 fica desligada; os cargos são opcionais um a um
    // (cargo sem ID não é gerenciado) e sem canal de status o bot não posta. Ver docs/operacao/discord.md.
    DISCORD_CLIENT_ID: snowflake(),
    DISCORD_CLIENT_SECRET: z.string().trim().default(''),
    DISCORD_BOT_TOKEN: z.string().trim().default(''),
    DISCORD_GUILD_ID: snowflake(),
    DISCORD_ROLE_PLAYER_ID: snowflake(),
    DISCORD_ROLE_VIP_ID: snowflake(),
    DISCORD_ROLE_STAFF_ID: snowflake(),
    DISCORD_ROLE_OWNER_ID: snowflake(),
    DISCORD_STATUS_CHANNEL_ID: snowflake(),
    // Só os testes mudam estas duas (o Discord falso local); em produção valem as padrão.
    DISCORD_API_URL: urlWithProtocol(['https:', 'http:']).default('https://discord.com/api/v10'),
    DISCORD_AUTHORIZE_URL: urlWithProtocol(['https:', 'http:']).default(
      'https://discord.com/oauth2/authorize',
    ),
    // A reconciliação de cargos (pega o VIP que vence, que não tem evento) e a edição da mensagem de
    // status. O aceite da S15 pede até 1 minuto para o cargo mudar.
    DISCORD_SYNC_SECONDS: z.coerce.number().int().positive().default(30),
    DISCORD_STATUS_SECONDS: z.coerce.number().int().positive().default(60),
    // Foto de perfil própria (ADR 0022): o R2 de mídia (separado do bucket de backup). Sem o conjunto
    // base (as seis primeiras), a funcionalidade fica desligada. A purga da CDN é opcional (sem ela,
    // só a expiração do cache tira uma foto apagada de circulação; em produção, configure).
    R2_MEDIA_ENDPOINT: z.union([z.literal(''), urlWithProtocol(['https:', 'http:'])]).default(''),
    R2_MEDIA_ACCESS_KEY_ID: z.string().trim().default(''),
    R2_MEDIA_SECRET_ACCESS_KEY: z.string().trim().default(''),
    R2_MEDIA_PUBLIC_BUCKET: z.string().trim().default(''),
    R2_MEDIA_PRIVATE_BUCKET: z.string().trim().default(''),
    // Origem pública das fotos (o domínio do bucket público na Cloudflare), ex.: https://img.stcarmine.com.
    MEDIA_PUBLIC_URL: z.union([z.literal(''), origin()]).default(''),
    CLOUDFLARE_ZONE_ID: z.string().trim().default(''),
    CLOUDFLARE_PURGE_TOKEN: z.string().trim().default(''),
    // Só os testes mudam esta (a API falsa local); em produção vale a padrão.
    CLOUDFLARE_API_URL: urlWithProtocol(['https:', 'http:']).default(
      'https://api.cloudflare.com/client/v4',
    ),
    // De quanto em quanto tempo a fila de remoção de arquivos roda (0 desliga).
    MEDIA_SWEEP_SECONDS: z.coerce.number().int().nonnegative().default(30),
    ALERT_SERVER_OFFLINE_CONFIRM_SECONDS: z.coerce.number().int().positive().default(60),
    ALERT_SWEEP_SECONDS: z.coerce.number().int().positive().default(15),
    // Sentry (S09): DSN vazio desliga. Ambiente e release identificam o deploy nos eventos.
    SENTRY_DSN: z.union([z.literal(''), urlWithProtocol(['https:', 'http:'])]).default(''),
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
        'STAFF_REPORTS_WEBHOOK_URL',
        'DISCORD_API_URL',
        'DISCORD_AUTHORIZE_URL',
        'R2_MEDIA_ENDPOINT',
        'MEDIA_PUBLIC_URL',
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
  /** Cache do Ranking semanal (S12), em segundos. */
  rankingCacheTtlSeconds: number;
  /** Cache dos números da semana da home, em segundos. */
  weekSummaryCacheTtlSeconds: number;
  /** Cache das prévias do header (U3e), em segundos. */
  headerPreviewsCacheTtlSeconds: number;
  /** Cache da faixa de atividade ao vivo, em segundos. */
  activityCacheTtlSeconds: number;
  /** Alertas no Discord (S09). Sem webhook, desligados. */
  alerts: { discordWebhookUrl: string | null; serverOfflineConfirmMs: number; sweepMs: number };
  /** Denúncias (S13): webhook da Staff (sem URL, desligado) e a limpeza de retenção (0: desligada). */
  reports: { webhookUrl: string | null; retentionSweepMs: number };
  /** Discord integrado (S15); nulo (desligado) sem o conjunto base de variáveis. */
  discord: DiscordConfig | null;
  /** Variáveis base do Discord que faltam quando só parte delas foi preenchida (a S15 fica desligada). */
  discordMissing: string[];
  /** Foto de perfil própria (ADR 0022); nulo (desligada) sem o conjunto base de variáveis. */
  media: MediaConfig | null;
  /** Variáveis base da foto de perfil que faltam quando só parte delas foi preenchida. */
  mediaMissing: string[];
  /** Sentry (S09): sem DSN, desligado. */
  sentry: { dsn: string | null; environment: string; release: string | null };
  /** Origem pública do web, sem barra final (ex.: `https://stcarmine.com`). */
  publicWebUrl: string;
  steamOpenIdUrl: string;
  session: { idleTtlSeconds: number; absoluteTtlSeconds: number };
}

export type DiscordRoleKey = 'player' | 'vip' | 'staff' | 'owner';

export interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  botToken: string;
  guildId: string;
  /** ID do cargo de cada chave; cargo sem ID configurado não é gerenciado. */
  roleIds: Partial<Record<DiscordRoleKey, string>>;
  /** Canal da mensagem de status; nulo: o bot de status fica desligado. */
  statusChannelId: string | null;
  apiUrl: string;
  authorizeUrl: string;
  syncMs: number;
  statusMs: number;
}

export interface MediaConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
  /** Origem pública das fotos, sem barra final. */
  publicUrl: string;
  /** Purga da CDN depois de apagar; nulo: só a expiração do cache. */
  purge: { zoneId: string; token: string; apiUrl: string } | null;
  sweepMs: number;
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
      search: e.RATE_LIMIT_SEARCH_PER_MINUTE,
      equipped: e.RATE_LIMIT_EQUIPPED_PER_MINUTE,
      mutations: e.RATE_LIMIT_MUTATIONS_PER_MINUTE,
      server: e.RATE_LIMIT_SERVER_PER_MINUTE,
    },
    rankingCacheTtlSeconds: e.RANKING_CACHE_TTL_SECONDS,
    weekSummaryCacheTtlSeconds: e.WEEK_SUMMARY_CACHE_TTL_SECONDS,
    headerPreviewsCacheTtlSeconds: e.HEADER_PREVIEWS_CACHE_TTL_SECONDS,
    activityCacheTtlSeconds: e.ACTIVITY_CACHE_TTL_SECONDS,
    liveServers: {
      offlineAfterMs: e.SERVER_OFFLINE_AFTER_SECONDS * 1000,
      sweepMs: e.LIVE_SERVERS_SWEEP_SECONDS * 1000,
    },
    alerts: {
      discordWebhookUrl: e.DISCORD_ALERT_WEBHOOK_URL === '' ? null : e.DISCORD_ALERT_WEBHOOK_URL,
      serverOfflineConfirmMs: e.ALERT_SERVER_OFFLINE_CONFIRM_SECONDS * 1000,
      sweepMs: e.ALERT_SWEEP_SECONDS * 1000,
    },
    reports: {
      webhookUrl: e.STAFF_REPORTS_WEBHOOK_URL === '' ? null : e.STAFF_REPORTS_WEBHOOK_URL,
      retentionSweepMs: e.RETENTION_SWEEP_MINUTES * 60_000,
    },
    ...discordConfig(e),
    ...mediaConfig(e),
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

type Env = z.infer<typeof envSchema>;

const DISCORD_BASE_VARS = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
] as const;

/** A S15 liga só com o conjunto base inteiro; parcial desliga e a API avisa o que falta no boot. */
function discordConfig(e: Env): Pick<AppConfig, 'discord' | 'discordMissing'> {
  const missing = DISCORD_BASE_VARS.filter((key) => e[key] === '');
  if (missing.length > 0) {
    return {
      discord: null,
      discordMissing: missing.length === DISCORD_BASE_VARS.length ? [] : missing,
    };
  }
  const roles: [DiscordRoleKey, string][] = [
    ['player', e.DISCORD_ROLE_PLAYER_ID],
    ['vip', e.DISCORD_ROLE_VIP_ID],
    ['staff', e.DISCORD_ROLE_STAFF_ID],
    ['owner', e.DISCORD_ROLE_OWNER_ID],
  ];
  return {
    discordMissing: [],
    discord: {
      clientId: e.DISCORD_CLIENT_ID,
      clientSecret: e.DISCORD_CLIENT_SECRET,
      botToken: e.DISCORD_BOT_TOKEN,
      guildId: e.DISCORD_GUILD_ID,
      roleIds: Object.fromEntries(roles.filter(([, id]) => id !== '')),
      statusChannelId: e.DISCORD_STATUS_CHANNEL_ID === '' ? null : e.DISCORD_STATUS_CHANNEL_ID,
      apiUrl: e.DISCORD_API_URL.replace(/\/+$/, ''),
      authorizeUrl: e.DISCORD_AUTHORIZE_URL,
      syncMs: e.DISCORD_SYNC_SECONDS * 1000,
      statusMs: e.DISCORD_STATUS_SECONDS * 1000,
    },
  };
}

const MEDIA_BASE_VARS = [
  'R2_MEDIA_ENDPOINT',
  'R2_MEDIA_ACCESS_KEY_ID',
  'R2_MEDIA_SECRET_ACCESS_KEY',
  'R2_MEDIA_PUBLIC_BUCKET',
  'R2_MEDIA_PRIVATE_BUCKET',
  'MEDIA_PUBLIC_URL',
] as const;

/** A foto de perfil liga só com o conjunto base inteiro; parcial desliga e a API avisa o que falta no boot. */
function mediaConfig(e: Env): Pick<AppConfig, 'media' | 'mediaMissing'> {
  const missing = MEDIA_BASE_VARS.filter((key) => e[key] === '');
  if (missing.length > 0) {
    return {
      media: null,
      mediaMissing: missing.length === MEDIA_BASE_VARS.length ? [] : missing,
    };
  }
  return {
    mediaMissing: [],
    media: {
      endpoint: e.R2_MEDIA_ENDPOINT,
      accessKeyId: e.R2_MEDIA_ACCESS_KEY_ID,
      secretAccessKey: e.R2_MEDIA_SECRET_ACCESS_KEY,
      publicBucket: e.R2_MEDIA_PUBLIC_BUCKET,
      privateBucket: e.R2_MEDIA_PRIVATE_BUCKET,
      publicUrl: e.MEDIA_PUBLIC_URL.replace(/\/+$/, ''),
      purge:
        e.CLOUDFLARE_ZONE_ID !== '' && e.CLOUDFLARE_PURGE_TOKEN !== ''
          ? {
              zoneId: e.CLOUDFLARE_ZONE_ID,
              token: e.CLOUDFLARE_PURGE_TOKEN,
              apiUrl: e.CLOUDFLARE_API_URL.replace(/\/+$/, ''),
            }
          : null,
      sweepMs: e.MEDIA_SWEEP_SECONDS * 1000,
    },
  };
}
