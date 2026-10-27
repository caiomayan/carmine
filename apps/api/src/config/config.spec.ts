import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const validEnv = {
  DATABASE_URL: 'postgres://carmine:carmine@localhost:5432/carmine',
  VALKEY_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('aplica os padrões quando só as URLs obrigatórias são informadas', () => {
    expect(loadConfig(validEnv)).toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3333,
      logLevel: 'info',
      databaseUrl: 'postgres://carmine:carmine@localhost:5432/carmine',
      valkeyUrl: 'redis://localhost:6379',
      healthCheckTimeoutMs: 2000,
      steamWebApi: { key: null, url: 'https://api.steampowered.com', timeoutMs: 5000 },
      trustedProxies: [],
      rateLimitsPerMinute: {
        login: 20,
        public: 240,
        search: 60,
        equipped: 120,
        mutations: 60,
        server: 600,
        webhook: 120,
      },
      rankingCacheTtlSeconds: 45,
      weekSummaryCacheTtlSeconds: 30,
      headerPreviewsCacheTtlSeconds: 15,
      activityCacheTtlSeconds: 5,
      liveServers: { offlineAfterMs: 45_000, sweepMs: 5000 },
      vipHold: { enabled: false, sweepMs: 60_000 },
      payments: {
        enabled: false,
        provider: null,
        dataKey: null,
        mercadopago: null,
        sweepMs: 60_000,
      },
      alerts: { discordWebhookUrl: null, serverOfflineConfirmMs: 60_000, sweepMs: 15_000 },
      reports: { webhookUrl: null, retentionSweepMs: 3_600_000 },
      discord: null,
      discordMissing: [],
      media: null,
      mediaMissing: [],
      analytics: { mode: 'off', environment: 'producao', posthog: null },
      sentry: { dsn: null, environment: 'development', release: null },
      publicWebUrl: 'http://localhost:3000',
      steamOpenIdUrl: 'https://steamcommunity.com/openid/login',
      session: { idleTtlSeconds: 1_209_600, absoluteTtlSeconds: 7_776_000 },
    });
  });

  it('por padrão, um servidor desligado aparece offline em até 60 s (S06)', () => {
    const { offlineAfterMs, sweepMs } = loadConfig(validEnv).liveServers;

    expect(offlineAfterMs + sweepMs).toBeLessThanOrEqual(60_000);
  });

  it('lê os proxies confiáveis e recusa um que não é IP nem rede', () => {
    expect(loadConfig({ ...validEnv, TRUSTED_PROXIES: '172.30.0.10, 10.8.0.0/16' })).toMatchObject({
      trustedProxies: ['172.30.0.10', '10.8.0.0/16'],
    });
    expect(() => loadConfig({ ...validEnv, TRUSTED_PROXIES: 'cloudflared' })).toThrow(
      /TRUSTED_PROXIES: proxy confiável inválido: "cloudflared"/,
    );
  });

  it('lê os limites de cada política de rate limit', () => {
    const config = loadConfig({
      ...validEnv,
      RATE_LIMIT_LOGIN_PER_MINUTE: '5',
      RATE_LIMIT_SERVER_PER_MINUTE: '1000',
    });

    expect(config.rateLimitsPerMinute).toMatchObject({ login: 5, server: 1000 });
    expect(() => loadConfig({ ...validEnv, RATE_LIMIT_PUBLIC_PER_MINUTE: '0' })).toThrow(
      /RATE_LIMIT_PUBLIC_PER_MINUTE/,
    );
  });

  it('lê o webhook do Discord e o Sentry; vazios, ficam desligados', () => {
    const config = loadConfig({
      ...validEnv,
      DISCORD_ALERT_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc',
      ALERT_SERVER_OFFLINE_CONFIRM_SECONDS: '90',
      SENTRY_DSN: 'https://chave@o1.ingest.sentry.io/2',
      SENTRY_RELEASE: 'abc123',
    });

    expect(config.alerts).toEqual({
      discordWebhookUrl: 'https://discord.com/api/webhooks/1/abc',
      serverOfflineConfirmMs: 90_000,
      sweepMs: 15_000,
    });
    expect(config.sentry).toEqual({
      dsn: 'https://chave@o1.ingest.sentry.io/2',
      environment: 'development',
      release: 'abc123',
    });
    expect(
      loadConfig({ ...validEnv, DISCORD_ALERT_WEBHOOK_URL: '', SENTRY_DSN: '' }),
    ).toMatchObject({
      alerts: { discordWebhookUrl: null },
      sentry: { dsn: null },
    });
    expect(() =>
      loadConfig({
        ...validEnv,
        NODE_ENV: 'production',
        DISCORD_ALERT_WEBHOOK_URL: 'http://x.example/w',
      }),
    ).toThrow(/DISCORD_ALERT_WEBHOOK_URL/);
  });

  it('lê o webhook da Staff (S13) e a limpeza de retenção; sem webhook, desligado', () => {
    expect(loadConfig(validEnv).reports).toEqual({ webhookUrl: null, retentionSweepMs: 3_600_000 });
    expect(
      loadConfig({
        ...validEnv,
        STAFF_REPORTS_WEBHOOK_URL: 'https://discord.com/api/webhooks/2/def',
        RETENTION_SWEEP_MINUTES: '0',
      }).reports,
    ).toEqual({ webhookUrl: 'https://discord.com/api/webhooks/2/def', retentionSweepMs: 0 });
    expect(() =>
      loadConfig({
        ...validEnv,
        NODE_ENV: 'production',
        STAFF_REPORTS_WEBHOOK_URL: 'http://x.example/w',
      }),
    ).toThrow(/STAFF_REPORTS_WEBHOOK_URL/);
  });

  it('lê a origem pública do web sem a barra final', () => {
    const config = loadConfig({ ...validEnv, PUBLIC_WEB_URL: 'https://stcarmine.com/' });

    expect(config.publicWebUrl).toBe('https://stcarmine.com');
  });

  it('rejeita uma origem pública do web com caminho', () => {
    expect(() => loadConfig({ ...validEnv, PUBLIC_WEB_URL: 'https://stcarmine.com/app' })).toThrow(
      /PUBLIC_WEB_URL/,
    );
  });

  it('exige HTTPS na origem pública e na Steam OpenID em produção', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        NODE_ENV: 'production',
        PUBLIC_WEB_URL: 'http://stcarmine.com',
        STEAM_OPENID_URL: 'http://127.0.0.1:9999/openid/login',
      }),
    ).toThrow(/PUBLIC_WEB_URL[\s\S]*STEAM_OPENID_URL/);
  });

  it('rejeita uma sessão absoluta mais curta que a ociosa', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SESSION_IDLE_TTL_SECONDS: '100',
        SESSION_ABSOLUTE_TTL_SECONDS: '50',
      }),
    ).toThrow(/SESSION_ABSOLUTE_TTL_SECONDS/);
  });

  it('lê a chave da Steam Web API e ignora a barra final da URL', () => {
    const config = loadConfig({
      ...validEnv,
      STEAM_WEB_API_KEY: ' abc123 ',
      STEAM_WEB_API_URL: 'http://localhost:9999/',
    });

    expect(config.steamWebApi).toEqual({
      key: 'abc123',
      url: 'http://localhost:9999',
      timeoutMs: 5000,
    });
  });

  it('converte números vindos como texto', () => {
    const config = loadConfig({ ...validEnv, PORT: '8080', HEALTH_CHECK_TIMEOUT_MS: '500' });

    expect(config.port).toBe(8080);
    expect(config.healthCheckTimeoutMs).toBe(500);
  });

  it('falha listando cada variável ausente ou inválida', () => {
    expect(() => loadConfig({ PORT: 'abc', VALKEY_URL: 'http://localhost:6379' })).toThrow(
      /DATABASE_URL[\s\S]*PORT[\s\S]*VALKEY_URL/,
    );
  });

  it('rejeita uma DATABASE_URL que não é do Postgres', () => {
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: 'mysql://localhost/carmine' })).toThrow(
      /DATABASE_URL/,
    );
  });

  describe('Discord integrado (S15)', () => {
    const discordEnv = {
      ...validEnv,
      DISCORD_CLIENT_ID: '830000000000000001',
      DISCORD_CLIENT_SECRET: 'segredo',
      DISCORD_BOT_TOKEN: 'token',
      DISCORD_GUILD_ID: '900000000000000001',
    };

    it('sem nenhuma variável fica desligado, sem erro e sem aviso', () => {
      const config = loadConfig(validEnv);

      expect(config.discord).toBeNull();
      expect(config.discordMissing).toEqual([]);
    });

    it('com o conjunto base liga; cargo sem ID não é gerenciado e sem canal não há status', () => {
      const config = loadConfig({
        ...discordEnv,
        DISCORD_ROLE_PLAYER_ID: '810000000000000001',
        DISCORD_ROLE_VIP_ID: '',
      });

      expect(config.discord).toMatchObject({
        guildId: '900000000000000001',
        roleIds: { player: '810000000000000001' },
        statusChannelId: null,
        apiUrl: 'https://discord.com/api/v10',
        syncMs: 30_000,
        statusMs: 60_000,
      });
    });

    it('com só parte do conjunto base fica desligado e diz o que falta', () => {
      const config = loadConfig({ ...discordEnv, DISCORD_BOT_TOKEN: '' });

      expect(config.discord).toBeNull();
      expect(config.discordMissing).toEqual(['DISCORD_BOT_TOKEN']);
    });

    it('rejeita ID que não é número do Discord', () => {
      expect(() => loadConfig({ ...discordEnv, DISCORD_GUILD_ID: 'meu-servidor' })).toThrow(
        /DISCORD_GUILD_ID/,
      );
    });

    it('em produção exige https nas URLs do Discord', () => {
      expect(() =>
        loadConfig({
          ...discordEnv,
          NODE_ENV: 'production',
          PUBLIC_WEB_URL: 'https://stcarmine.com',
          DISCORD_API_URL: 'http://discord.test/api',
        }),
      ).toThrow(/DISCORD_API_URL/);
    });
  });

  describe('foto de perfil (R2 de mídia)', () => {
    const media = {
      R2_MEDIA_ENDPOINT: 'https://conta.r2.cloudflarestorage.com',
      R2_MEDIA_ACCESS_KEY_ID: 'chave',
      R2_MEDIA_SECRET_ACCESS_KEY: 'segredo',
      R2_MEDIA_PUBLIC_BUCKET: 'carmine-media',
      R2_MEDIA_PRIVATE_BUCKET: 'carmine-media-removidas',
      MEDIA_PUBLIC_URL: 'https://img.stcarmine.com/',
    };

    it('desligada sem nenhuma variável, sem aviso do que falta', () => {
      expect(loadConfig(validEnv)).toMatchObject({ media: null, mediaMissing: [] });
    });

    it('liga com o conjunto base; a purga da CDN é opcional', () => {
      const config = loadConfig({ ...validEnv, ...media });

      expect(config.media).toMatchObject({
        publicBucket: 'carmine-media',
        privateBucket: 'carmine-media-removidas',
        publicUrl: 'https://img.stcarmine.com',
        purge: null,
        sweepMs: 30_000,
      });
      expect(
        loadConfig({
          ...validEnv,
          ...media,
          CLOUDFLARE_ZONE_ID: 'zona',
          CLOUDFLARE_PURGE_TOKEN: 'token',
        }).media?.purge,
      ).toEqual({ zoneId: 'zona', token: 'token', apiUrl: 'https://api.cloudflare.com/client/v4' });
    });

    it('parcial desliga e diz o que falta', () => {
      const config = loadConfig({ ...validEnv, ...media, R2_MEDIA_SECRET_ACCESS_KEY: '' });

      expect(config.media).toBeNull();
      expect(config.mediaMissing).toEqual(['R2_MEDIA_SECRET_ACCESS_KEY']);
    });

    it('em produção, o endpoint e a origem pública exigem https', () => {
      expect(() =>
        loadConfig({
          ...validEnv,
          ...media,
          NODE_ENV: 'production',
          R2_MEDIA_ENDPOINT: 'http://media:9000',
        }),
      ).toThrow(/R2_MEDIA_ENDPOINT: deve usar https em produção/);
      expect(() =>
        loadConfig({
          ...validEnv,
          ...media,
          NODE_ENV: 'production',
          MEDIA_PUBLIC_URL: 'http://img.stcarmine.com',
        }),
      ).toThrow(/MEDIA_PUBLIC_URL: deve usar https em produção/);
    });

    describe('o R2 de mentira da homologação (http pela rede interna)', () => {
      const hml = {
        ...validEnv,
        ...media,
        NODE_ENV: 'production',
        R2_MEDIA_ENDPOINT: 'http://media:9000',
        MEDIA_PUBLIC_URL: 'https://dev.stcarmine.com',
        PUBLIC_WEB_URL: 'https://dev.stcarmine.com',
        SENTRY_ENVIRONMENT: 'staging',
        CARMINE_DEMO: 'homologacao',
      };

      it('com a trava da homologação, o endpoint http é aceito em NODE_ENV=production', () => {
        expect(loadConfig(hml).media).toMatchObject({
          endpoint: 'http://media:9000',
          publicUrl: 'https://dev.stcarmine.com',
        });
      });

      it('a origem pública continua exigindo https mesmo na homologação', () => {
        expect(() => loadConfig({ ...hml, MEDIA_PUBLIC_URL: 'http://dev.stcarmine.com' })).toThrow(
          /MEDIA_PUBLIC_URL: deve usar https em produção/,
        );
      });

      it('em produção nunca: faltando qualquer uma das três chaves da trava, o http é recusado', () => {
        const recusado = /R2_MEDIA_ENDPOINT: deve usar https em produção/;
        // Sem a variável da homologação.
        expect(() => loadConfig({ ...hml, CARMINE_DEMO: '' })).toThrow(recusado);
        // Com um valor que não é o da homologação.
        expect(() => loadConfig({ ...hml, CARMINE_DEMO: 'sim' })).toThrow(recusado);
        // O endereço de produção, mesmo com a variável (alguém copiou o compose da homologação).
        expect(() =>
          loadConfig({
            ...hml,
            PUBLIC_WEB_URL: 'https://stcarmine.com',
            MEDIA_PUBLIC_URL: 'https://img.stcarmine.com',
          }),
        ).toThrow(recusado);
        // O ambiente do Sentry de produção.
        expect(() => loadConfig({ ...hml, SENTRY_ENVIRONMENT: 'production' })).toThrow(recusado);
        expect(() => loadConfig({ ...hml, SENTRY_ENVIRONMENT: 'Production' })).toThrow(recusado);
      });
    });
  });

  describe('analytics (A1)', () => {
    it('sem a chave do PostHog está desligado, como o Discord', () => {
      expect(loadConfig(validEnv).analytics).toEqual({
        mode: 'off',
        environment: 'producao',
        posthog: null,
      });
    });

    it('com a chave liga o PostHog da região UE; a exclusão de pessoas pede a chave pessoal e o projeto', () => {
      const on = loadConfig({ ...validEnv, POSTHOG_API_KEY: 'phc_x' }).analytics;
      expect(on).toMatchObject({
        mode: 'posthog',
        posthog: {
          apiKey: 'phc_x',
          host: 'https://eu.i.posthog.com',
          apiHost: 'https://eu.posthog.com',
          erasure: null,
          flushMs: 5000,
        },
      });

      const full = loadConfig({
        ...validEnv,
        POSTHOG_API_KEY: 'phc_x',
        POSTHOG_PERSONAL_API_KEY: 'phx_y',
        POSTHOG_PROJECT_ID: '99',
        POSTHOG_HOST: 'https://eu.i.posthog.com/',
      }).analytics;
      expect(full.posthog?.erasure).toEqual({ personalApiKey: 'phx_y', projectId: '99' });
      expect(full.posthog?.host).toBe('https://eu.i.posthog.com');
    });

    it('ANALYTICS_DRIVER=log (a homologação) só registra e ganha da chave: nada sai de lá', () => {
      const config = loadConfig({
        ...validEnv,
        ANALYTICS_DRIVER: 'log',
        POSTHOG_API_KEY: 'phc_x',
        ANALYTICS_ENVIRONMENT: 'staging',
      });

      expect(config.analytics).toEqual({ mode: 'log', environment: 'staging', posthog: null });
    });

    it('recusa um driver ou um ambiente desconhecido', () => {
      expect(() => loadConfig({ ...validEnv, ANALYTICS_DRIVER: 'sentry' })).toThrow();
      expect(() => loadConfig({ ...validEnv, ANALYTICS_ENVIRONMENT: 'dev' })).toThrow();
    });
  });
});
