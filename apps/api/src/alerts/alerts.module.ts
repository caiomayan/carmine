import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { LiveServers } from '../live-servers/live-servers.js';
import { LiveServersModule } from '../live-servers/live-servers.module.js';
import { DiscordWebhook } from './discord-webhook.js';
import { ServerAlerts } from './server-alerts.js';
import { ServerOfflineTracker } from './server-offline-tracker.js';

/** Alertas operacionais no Discord (S09): Servidor Carmine offline e de volta. */
@Module({
  imports: [LiveServersModule],
  providers: [
    {
      provide: ServerAlerts,
      inject: [LiveServers, APP_CONFIG],
      useFactory: (live: LiveServers, config: AppConfig) =>
        new ServerAlerts(
          live,
          new ServerOfflineTracker({ confirmAfterMs: config.alerts.serverOfflineConfirmMs }),
          new DiscordWebhook(config.alerts.discordWebhookUrl),
          { sweepMs: config.alerts.sweepMs },
        ),
    },
  ],
})
export class AlertsModule {}
