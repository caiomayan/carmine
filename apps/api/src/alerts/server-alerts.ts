import type { LiveServerList } from '@carmine/contracts';
import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { formatAlert } from './alert-messages.js';
import type { DiscordWebhook } from './discord-webhook.js';
import type { ServerOfflineTracker } from './server-offline-tracker.js';

export interface ServerAlertsOptions {
  /** Intervalo da checagem; independe de haver alguém na home ouvindo o SSE. */
  sweepMs: number;
}

/**
 * Avisa no Discord quando um Servidor Carmine cai e quando volta (S09). Roda sozinho, com ou sem
 * visitantes no site: consulta a lista ao vivo (a mesma da home) e entrega as transições do
 * {@link ServerOfflineTracker}. Sem webhook configurado, não faz nada.
 */
export class ServerAlerts implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ServerAlerts.name);
  private timer: NodeJS.Timeout | undefined;
  private checking = false;

  constructor(
    private readonly live: { current(): Promise<LiveServerList> },
    private readonly tracker: ServerOfflineTracker,
    private readonly webhook: DiscordWebhook,
    private readonly options: ServerAlertsOptions,
    private readonly now: () => Date = () => new Date(),
  ) {}

  onModuleInit(): void {
    if (!this.webhook.enabled) return;
    this.timer = setInterval(() => void this.check(), this.options.sweepMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Uma checagem; nunca rejeita (Postgres ou Valkey fora só não avisam nada desta vez). */
  async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const { servers } = await this.live.current();
      const now = this.now();
      for (const alert of this.tracker.observe(servers, now)) {
        await this.webhook.send(formatAlert(alert, now));
      }
    } catch (error) {
      this.logger.warn(`Checagem dos alertas falhou: ${(error as Error).message}`);
    } finally {
      this.checking = false;
    }
  }
}
