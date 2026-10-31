import { Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { Analytics, AnalyticsPreferences } from './analytics.js';
import { createAnalyticsTransport } from './analytics-factory.js';
import type { AnalyticsTransport } from './analytics-transport.js';
import { PostHogTransport } from './posthog-transport.js';

/** Liga a descarga periódica da fila ao subir a API e a esvazia ao desligar. */
class AnalyticsLifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly transport: AnalyticsTransport | null,
    private readonly analytics: Analytics,
  ) {}

  onModuleInit(): void {
    if (this.transport instanceof PostHogTransport) this.transport.start();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.transport instanceof PostHogTransport) this.transport.stop();
    await this.analytics.flush();
  }
}

const ANALYTICS_TRANSPORT = Symbol('ANALYTICS_TRANSPORT');

/**
 * Analytics de produto (A1, ADR 0021): a porta `Analytics`, o transporte do ambiente e a chave "Participar da análise
 * de uso". Sem `POSTHOG_API_KEY` (e fora da homologação) o transporte é nulo e a API não envia nada.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [
    {
      provide: AnalyticsPreferences,
      inject: [DATABASE],
      useFactory: (db: Database) => new AnalyticsPreferences(db),
    },
    {
      provide: ANALYTICS_TRANSPORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createAnalyticsTransport(config.analytics),
    },
    {
      provide: Analytics,
      inject: [ANALYTICS_TRANSPORT, AnalyticsPreferences, APP_CONFIG],
      useFactory: (
        transport: AnalyticsTransport | null,
        preferences: AnalyticsPreferences,
        config: AppConfig,
      ) => new Analytics(transport, preferences, config.analytics.environment),
    },
    {
      provide: AnalyticsLifecycle,
      inject: [ANALYTICS_TRANSPORT, Analytics],
      useFactory: (transport: AnalyticsTransport | null, analytics: Analytics) =>
        new AnalyticsLifecycle(transport, analytics),
    },
  ],
  exports: [Analytics, AnalyticsPreferences],
})
export class AnalyticsModule {}
