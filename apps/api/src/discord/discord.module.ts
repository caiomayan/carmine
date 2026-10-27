import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { LiveServers } from '../live-servers/live-servers.js';
import { LiveServersModule } from '../live-servers/live-servers.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { DiscordController } from './discord.controller.js';
import { DISCORD, DiscordIntegration } from './discord-integration.js';
import { DiscordLinkFlow } from './discord-link-flow.js';
import { DiscordLinks } from './discord-links.js';
import { DiscordRest } from './discord-rest.js';
import { DiscordRoleSync } from './discord-role-sync.js';
import { DiscordStatusBoard } from './discord-status-board.js';

/**
 * Discord integrado (S15): vínculo da Conta, cargos sincronizados e mensagem de status. Sem as
 * variáveis `DISCORD_*` a integração é nula: o botão do web fica desabilitado e nenhum job roda.
 */
@Module({
  imports: [LiveServersModule, AnalyticsModule],
  controllers: [DiscordController],
  providers: [
    {
      provide: DiscordLinks,
      inject: [DATABASE],
      useFactory: (db: Database) => new DiscordLinks(db),
    },
    {
      provide: DISCORD,
      inject: [APP_CONFIG, DATABASE, VALKEY, LiveServers, DiscordLinks],
      useFactory: (
        config: AppConfig,
        db: Database,
        valkey: Redis,
        live: LiveServers,
        links: DiscordLinks,
      ): DiscordIntegration | null => {
        const logger = new Logger('Discord');
        const discord = config.discord;
        if (discord === null) {
          if (config.discordMissing.length > 0) {
            logger.warn(
              `Discord desligado: faltam ${config.discordMissing.join(', ')} (preencha todas as variáveis base)`,
            );
          }
          return null;
        }
        const client = new DiscordRest({
          clientId: discord.clientId,
          clientSecret: discord.clientSecret,
          botToken: discord.botToken,
          guildId: discord.guildId,
          apiUrl: discord.apiUrl,
          authorizeUrl: discord.authorizeUrl,
          redirectUri: `${config.publicWebUrl}/api/auth/discord/callback`,
        });
        const roles = new DiscordRoleSync(db, links, client, { roleIds: discord.roleIds });
        return new DiscordIntegration(
          client,
          links,
          roles,
          new DiscordLinkFlow(valkey, client, links, roles),
          discord.statusChannelId === null
            ? null
            : new DiscordStatusBoard(db, client, live, {
                channelId: discord.statusChannelId,
                siteUrl: config.publicWebUrl,
              }),
          { syncMs: discord.syncMs, statusMs: discord.statusMs },
        );
      },
    },
  ],
  exports: [DISCORD, DiscordLinks],
})
export class DiscordModule {}
