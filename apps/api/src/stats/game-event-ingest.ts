import {
  type ChatMessageEvent,
  countEvents,
  type EventBatch,
  type EventBatchResult,
  type GameMode,
  PLAY_SESSION_MAX_SECONDS,
} from '@carmine/contracts';
import { inArray, sql } from 'drizzle-orm';
import type { ActivityRecorder } from '../activity/activity-feed.js';
import { detectMultiKills } from '../activity/multi-kills.js';
import type { Analytics } from '../analytics/analytics.js';
import type { Database } from '../database/database.js';
import {
  accountStatsDaily,
  accountStatsWeekly,
  accounts,
  accountWeaponStats,
  chatMessages,
  gameEvents,
  playSessions,
  serverHours,
  teamKills,
} from '../database/schema.js';
import { collectServerHours } from './server-hours.js';
import { type CollectedStats, collectStats } from './stats-deltas.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

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
    /** Os eventos do plano de analytics (A1), depois do commit do lote. Sem ele, nada é emitido. */
    private readonly analytics: Pick<Analytics, 'capture'> = { capture: () => undefined },
  ) {}

  async ingest(server: EventSource, batch: EventBatch): Promise<EventBatchResult> {
    const total = countEvents(batch);
    if (total === 0) return { accepted: 0, duplicates: 0, ignored: 0 };

    const { result, news, accountBySteamId, sessions } = await this.db.transaction(async (tx) => {
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
        sessions,
        deltas,
        dailyDeltas,
        weapons,
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

      // S12b: o detalhe das mesmas somas (dia, arma e lado, Sessões, horas do servidor), na mesma
      // transação e só com o que é novo: reenviar um lote não muda nenhuma destas tabelas.
      await this.writeDetails(tx, server, news, accountBySteamId, { dailyDeltas, weapons });

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

      // S17 (PR A): o início do round e a bomba são aceitos e ainda não guardados (o PR B grava).
      const unstored = (batch.roundStarts?.length ?? 0) + (batch.bombs?.length ?? 0);
      const accepted = inserted.length + savedChat.length + unknownChat + unstored;
      return {
        result: {
          accepted,
          duplicates: total - accepted,
          ignored: ignored + unknownChat + unstored,
        },
        news,
        accountBySteamId,
        sessions,
      };
    });
    await this.announce(server, news, accountBySteamId);
    // Depois do commit: o fim de cada Sessão de jogo aceita, no horário do fim e com o ID do evento do plugin.
    for (const session of sessions) {
      const accountId = accountBySteamId.get(session.steamId);
      if (!accountId) continue;
      this.analytics.capture('sessao_de_jogo_encerrada', {
        accountId,
        props: {
          modo: server.mode,
          duracao_segundos: Math.min(86_400, Math.max(1, Math.round(session.seconds))),
        },
        at: session.at,
        naturalId: session.id,
      });
    }
    return result;
  }

  /** As tabelas da S12b (docs/specs/s12b-contratos.md); ver o adendo do ADR 0018. */
  private async writeDetails(
    tx: Transaction,
    server: EventSource,
    news: EventBatch,
    accountBySteamId: ReadonlyMap<string, string>,
    collected: Pick<CollectedStats, 'dailyDeltas' | 'weapons'>,
  ): Promise<void> {
    const byKey = <T extends { accountId: string }>(rows: T[], key: (row: T) => string) =>
      // Ordem fixa das linhas, para dois lotes ao mesmo tempo não se travarem um no outro.
      rows.sort((a, b) => `${a.accountId}${key(a)}`.localeCompare(`${b.accountId}${key(b)}`));

    const daily = byKey(
      collected.dailyDeltas.map(({ steamId, ...counters }) => ({
        accountId: accountBySteamId.get(steamId) as string,
        mode: server.mode,
        ...counters,
      })),
      (row) => row.day,
    );
    if (daily.length > 0) {
      const t = accountStatsDaily;
      await tx
        .insert(accountStatsDaily)
        .values(daily)
        .onConflictDoUpdate({
          target: [t.accountId, t.mode, t.day],
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

    const weapons = byKey(
      collected.weapons.map(({ steamId, ...counters }) => ({
        accountId: accountBySteamId.get(steamId) as string,
        mode: server.mode,
        ...counters,
      })),
      (row) => `${row.weapon}${row.side}`,
    );
    if (weapons.length > 0) {
      const t = accountWeaponStats;
      await tx
        .insert(accountWeaponStats)
        .values(weapons)
        .onConflictDoUpdate({
          target: [t.accountId, t.mode, t.weapon, t.side],
          set: {
            kills: sql`${t.kills} + excluded.kills`,
            headshots: sql`${t.headshots} + excluded.headshots`,
            updatedAt: sql`now()`,
          },
        });
    }

    await this.writeSessions(tx, server, news, accountBySteamId);

    const hours = collectServerHours(news.roundEnds);
    if (hours.length > 0) {
      const t = serverHours;
      // O placar é o do round mais recente: só troca se o do lote não é mais antigo que o guardado.
      const newer = sql`excluded.last_round_at >= ${t.lastRoundAt}`;
      await tx
        .insert(serverHours)
        .values(hours.map((hour) => ({ serverId: server.id, ...hour })))
        .onConflictDoUpdate({
          target: [t.serverId, t.hourStart, t.map],
          set: {
            roundsPlayed: sql`${t.roundsPlayed} + excluded.rounds_played`,
            ctWins: sql`${t.ctWins} + excluded.ct_wins`,
            tWins: sql`${t.tWins} + excluded.t_wins`,
            firstRoundAt: sql`least(${t.firstRoundAt}, excluded.first_round_at)`,
            lastRoundAt: sql`greatest(${t.lastRoundAt}, excluded.last_round_at)`,
            lastRoundNumber: sql`case when ${newer} then excluded.last_round_number else ${t.lastRoundNumber} end`,
            scoreCt: sql`case when ${newer} then excluded.score_ct else ${t.scoreCt} end`,
            scoreT: sql`case when ${newer} then excluded.score_t else ${t.scoreT} end`,
          },
        });
    }
  }

  /**
   * Sessões de jogo (S12b): início e fim são eventos separados, em qualquer ordem, então os dois
   * são upserts na mesma linha (o `sessionId`). O fim preenche uma Sessão ainda aberta e cria a
   * linha se o início não chegou; o início só completa o mapa que faltar. Conta desconhecida não
   * tem Sessão.
   */
  private async writeSessions(
    tx: Transaction,
    server: EventSource,
    news: EventBatch,
    accountBySteamId: ReadonlyMap<string, string>,
  ): Promise<void> {
    const t = playSessions;
    const starts = new Map<string, typeof t.$inferInsert>();
    for (const start of news.sessionStarts) {
      const accountId = accountBySteamId.get(start.steamId);
      if (!accountId) continue;
      starts.set(start.sessionId, {
        id: start.sessionId,
        accountId,
        serverId: server.id,
        mode: server.mode,
        startedAt: new Date(start.at),
        map: start.map ?? null,
        maps: start.map ? [start.map] : [],
      });
    }
    if (starts.size > 0) {
      await tx
        .insert(playSessions)
        .values([...starts.values()])
        .onConflictDoUpdate({
          target: t.id,
          set: {
            map: sql`coalesce(${t.map}, excluded.map)`,
            maps: sql`case when cardinality(${t.maps}) = 0 and excluded.map is not null then array[excluded.map] else ${t.maps} end`,
          },
        });
    }

    const ends = new Map<string, typeof t.$inferInsert>();
    for (const end of news.sessionEnds) {
      const accountId = accountBySteamId.get(end.steamId);
      if (!accountId) continue;
      const startedAt = new Date(end.startedAt);
      const endedAt = new Date(end.at);
      const seconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
      ends.set(end.sessionId, {
        id: end.sessionId,
        accountId,
        serverId: server.id,
        mode: server.mode,
        startedAt,
        endedAt,
        seconds: seconds > 0 && seconds <= PLAY_SESSION_MAX_SECONDS ? seconds : null,
        maps: end.maps ?? [],
      });
    }
    if (ends.size > 0) {
      await tx
        .insert(playSessions)
        .values([...ends.values()])
        .onConflictDoUpdate({
          target: t.id,
          // Só fecha uma Sessão aberta: um fim repetido (ou atrasado) não a reescreve.
          setWhere: sql`${t.endedAt} is null`,
          set: {
            endedAt: sql`excluded.ended_at`,
            seconds: sql`excluded.seconds`,
            maps: sql`case when cardinality(excluded.maps) > 0 then excluded.maps else ${t.maps} end`,
          },
        });
    }
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
