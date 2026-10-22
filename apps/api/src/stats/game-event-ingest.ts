import {
  type ChatMessageEvent,
  countEvents,
  type EventBatch,
  type EventBatchResult,
  type GameMode,
} from '@carmine/contracts';
import { inArray, sql } from 'drizzle-orm';
import type { ActivityRecorder } from '../activity/activity-feed.js';
import { detectMultiKills } from '../activity/multi-kills.js';
import type { Database } from '../database/database.js';
import {
  accountStatsWeekly,
  accounts,
  chatMessages,
  gameEvents,
  teamKills,
} from '../database/schema.js';
import { collectStats } from './stats-deltas.js';

/** Quem mandou o lote: o Servidor Carmine autenticado pela chave. */
export interface EventSource {
  id: string;
  mode: GameMode;
}

const EVENT_KEYS = ['kills', 'damages', 'roundEnds', 'sessionStarts', 'sessionEnds'] as const;

/**
 * Recebe os lotes de eventos do jogo (S12, ADR 0018): descarta o que já viu (pelo ID do evento),
 * aplica as regras do que conta (`collectStats`) e soma nas Estatísticas semanais. Tudo numa
 * transação, então um lote ou entra inteiro ou o plugin reenvia sem risco de contar em dobro.
 * O chat dos servidores (S13) viaja no mesmo lote e na mesma fila; o ID da mensagem é a chave
 * dela (`chat_messages`), e mensagem de Conta desconhecida não entra.
 */
export class GameEventIngest {
  /** `activity`: a faixa de atividade ao vivo da home, alimentada depois que o lote é gravado. */
  constructor(
    private readonly db: Database,
    private readonly activity: ActivityRecorder | null = null,
  ) {}

  async ingest(server: EventSource, batch: EventBatch): Promise<EventBatchResult> {
    const total = countEvents(batch);
    if (total === 0) return { accepted: 0, duplicates: 0, ignored: 0 };

    const { result, news, accountBySteamId } = await this.db.transaction(async (tx) => {
      // `on conflict do nothing` também resolve o ID repetido dentro do próprio lote.
      const eventIds = EVENT_KEYS.flatMap((key) =>
        batch[key].map(({ id }) => ({ id, serverId: server.id })),
      );
      const inserted =
        eventIds.length === 0
          ? []
          : await tx
              .insert(gameEvents)
              .values(eventIds)
              .onConflictDoNothing()
              .returning({ id: gameEvents.id });
      const fresh = new Set(inserted.map((row) => row.id));

      // Um ID repetido dentro do lote conta uma vez só: `delete` só diz sim na primeira vez.
      const news = Object.fromEntries(
        EVENT_KEYS.map((key) => [key, batch[key].filter(({ id }) => fresh.delete(id))]),
      ) as unknown as EventBatch;

      const chat = batch.chatMessages ?? [];
      const steamIds = steamIdsOf(news, chat);
      const rows =
        steamIds.length === 0
          ? []
          : await tx
              .select({ id: accounts.id, steamId: accounts.steamId })
              .from(accounts)
              .where(inArray(accounts.steamId, steamIds.map(BigInt)));
      const accountBySteamId = new Map(rows.map((row) => [row.steamId.toString(), row.id]));

      const {
        deltas,
        teamKills: teamKillEvents,
        ignored,
      } = collectStats(news, new Set(accountBySteamId.keys()));

      // Ordem fixa das linhas, para dois lotes ao mesmo tempo não se travarem um no outro.
      const values = deltas
        .map(({ steamId, ...counters }) => ({
          accountId: accountBySteamId.get(steamId) as string,
          mode: server.mode,
          ...counters,
        }))
        .sort((a, b) =>
          `${a.accountId}${a.weekStart}`.localeCompare(`${b.accountId}${b.weekStart}`),
        );
      if (values.length > 0) {
        const t = accountStatsWeekly;
        await tx
          .insert(accountStatsWeekly)
          .values(values)
          .onConflictDoUpdate({
            target: [t.accountId, t.mode, t.weekStart],
            set: {
              kills: sql`${t.kills} + excluded.kills`,
              deaths: sql`${t.deaths} + excluded.deaths`,
              assists: sql`${t.assists} + excluded.assists`,
              headshots: sql`${t.headshots} + excluded.headshots`,
              damage: sql`${t.damage} + excluded.damage`,
              roundsPlayed: sql`${t.roundsPlayed} + excluded.rounds_played`,
              roundsWon: sql`${t.roundsWon} + excluded.rounds_won`,
              secondsPlayed: sql`${t.secondsPlayed} + excluded.seconds_played`,
              updatedAt: sql`now()`,
            },
          });
      }

      if (teamKillEvents.length > 0) {
        await tx
          .insert(teamKills)
          .values(
            teamKillEvents.map((kill) => ({
              id: kill.id,
              serverId: server.id,
              killerAccountId: accountBySteamId.get(kill.killerSteamId) as string,
              victimAccountId: accountBySteamId.get(kill.victimSteamId) as string,
              weapon: kill.weapon,
              killedAt: kill.at,
            })),
          )
          .onConflictDoNothing();
      }

      // Chat de Conta que não existe (ou já foi anonimizada) é aceito e não guardado.
      const knownChat = chat.filter(({ steamId }) => accountBySteamId.has(steamId));
      const unknownChat = chat.length - knownChat.length;
      const savedChat =
        knownChat.length === 0
          ? []
          : await tx
              .insert(chatMessages)
              .values(
                knownChat.map((line) => ({
                  id: line.id,
                  serverId: server.id,
                  accountId: accountBySteamId.get(line.steamId) as string,
                  team: line.team,
                  teamChat: line.teamChat,
                  text: line.text,
                  at: new Date(line.at),
                })),
              )
              .onConflictDoNothing()
              .returning({ id: chatMessages.id });

      const accepted = inserted.length + savedChat.length + unknownChat;
      return {
        result: { accepted, duplicates: total - accepted, ignored: ignored + unknownChat },
        news,
        accountBySteamId,
      };
    });
    await this.announce(server, news, accountBySteamId);
    return result;
  }

  /**
   * Entrar no servidor e multi-kill vão para a faixa de atividade. Só o que o lote trouxe de novo
   * (o que já tinha sido visto não repete) e nunca falha: a faixa é um extra.
   */
  private async announce(
    server: EventSource,
    news: EventBatch,
    accountBySteamId: ReadonlyMap<string, string>,
  ): Promise<void> {
    if (!this.activity) return;
    const activity = this.activity;
    const announcements: Promise<void>[] = [];
    for (const start of news.sessionStarts) {
      const accountId = accountBySteamId.get(start.steamId);
      if (accountId) announcements.push(activity.joined(accountId, server.id, new Date(start.at)));
    }
    const multiKills = detectMultiKills({
      mode: server.mode,
      kills: news.kills,
      roundEnds: news.roundEnds,
    });
    for (const multi of multiKills) {
      const accountId = accountBySteamId.get(multi.steamId);
      if (accountId) {
        announcements.push(
          activity.multiKill(accountId, server.id, multi.count, new Date(multi.at)),
        );
      }
    }
    // Em paralelo e cada um por si: um que falha não impede os outros, e o lote espera no máximo o
    // tempo de um comando ao Valkey (o gravador nunca lança).
    await Promise.allSettled(announcements);
  }
}

function steamIdsOf(batch: EventBatch, chat: ChatMessageEvent[]): string[] {
  const ids = new Set<string>(chat.map(({ steamId }) => steamId));
  for (const kill of batch.kills) {
    for (const id of [kill.killerSteamId, kill.victimSteamId, kill.assisterSteamId]) {
      if (id !== null) ids.add(id);
    }
  }
  for (const hit of batch.damages) ids.add(hit.attackerSteamId);
  for (const round of batch.roundEnds) {
    for (const player of round.players) ids.add(player.steamId);
  }
  for (const start of batch.sessionStarts) ids.add(start.steamId);
  for (const end of batch.sessionEnds) ids.add(end.steamId);
  return [...ids];
}
