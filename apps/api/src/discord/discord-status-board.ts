import type { LiveServer, LiveServerList } from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { discordStatusMessages } from '../database/schema.js';
import type { DiscordClient, DiscordMessage } from './discord-client.js';

const MODE_LABEL: Record<LiveServer['mode'], string> = {
  retake: 'Retake',
  deathmatch: 'Deathmatch',
};

const STATE_ICON: Record<LiveServer['state'], string> = {
  online: '🟢',
  full: '🟡',
  offline: '🔴',
};

const STATE_LABEL: Record<LiveServer['state'], string> = {
  online: 'online',
  full: 'lotado',
  offline: 'offline',
};

/** Cinza escuro da identidade Liberty (a barra lateral do embed). */
const EMBED_COLOR = 0x2b2926;

/**
 * A mensagem de status: um embed com cada Servidor Carmine (nome, Modo, estado, jogadores/vagas e
 * mapa) e os links do site, do Ranking e das regras. O `timestamp` do embed é a hora da lista,
 * então a mensagem mostra há quanto tempo foi atualizada.
 */
export function buildStatusMessage(list: LiveServerList, siteUrl: string): DiscordMessage {
  const lines = list.servers.map((server) => {
    const name = server.showcaseName ?? server.name;
    const code = server.code ? ` (${server.code})` : '';
    const where =
      server.state === 'offline'
        ? 'offline'
        : `${server.players}/${server.maxPlayers} jogadores · ${server.map ?? 'mapa indisponível'}`;
    return `${STATE_ICON[server.state]} **${name}**${code} · ${MODE_LABEL[server.mode]} · ${STATE_LABEL[server.state]}\n${where} · \`${server.address}\``;
  });
  const { online, players } = list.summary;
  return {
    embeds: [
      {
        title: 'Servidores Carmine',
        description:
          lines.length > 0 ? lines.join('\n\n') : 'Nenhum servidor cadastrado no momento.',
        color: EMBED_COLOR,
        fields: [
          {
            name: 'Agora',
            value: `${online} ${online === 1 ? 'servidor no ar' : 'servidores no ar'} · ${players} ${players === 1 ? 'jogador' : 'jogadores'}`,
          },
          {
            name: 'Links',
            value: `[Site](${siteUrl}) · [Ranking](${siteUrl}/ranking) · [Regras](${siteUrl}/rules)`,
          },
        ],
        timestamp: list.generatedAt,
      },
    ],
  };
}

/**
 * O bot de status (S15): uma mensagem fixa num canal, **editada** a cada passada (nunca uma nova a
 * cada minuto). O ID dela fica no banco; se alguém a apagar, a próxima passada posta outra e
 * passa a editar essa.
 */
export class DiscordStatusBoard {
  private readonly logger = new Logger(DiscordStatusBoard.name);
  private running = false;

  constructor(
    private readonly db: Database,
    private readonly client: DiscordClient,
    private readonly live: { current(): Promise<LiveServerList> },
    private readonly options: { channelId: string; siteUrl: string },
  ) {}

  /** Uma atualização; nunca rejeita (Discord, Postgres ou Valkey fora só pulam esta vez). */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { channelId, siteUrl } = this.options;
      const message = buildStatusMessage(await this.live.current(), siteUrl);
      const [stored] = await this.db
        .select()
        .from(discordStatusMessages)
        .where(eq(discordStatusMessages.channelId, channelId));
      if (stored && (await this.client.editMessage(channelId, stored.messageId, message))) {
        await this.db
          .update(discordStatusMessages)
          .set({ updatedAt: new Date() })
          .where(eq(discordStatusMessages.channelId, channelId));
        return;
      }
      const messageId = await this.client.postMessage(channelId, message);
      await this.db
        .insert(discordStatusMessages)
        .values({ channelId, messageId })
        .onConflictDoUpdate({
          target: discordStatusMessages.channelId,
          set: { messageId, updatedAt: new Date() },
        });
    } catch (error) {
      this.logger.warn(`Mensagem de status do Discord não atualizou: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
