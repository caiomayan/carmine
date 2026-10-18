import {
  countEvents,
  type EventBatch,
  type EventBatchResult,
  type GameMode,
} from '@carmine/contracts';
import { inArray, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountStatsWeekly, accounts, gameEvents, teamKills } from '../database/schema.js';
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
 */
export class GameEventIngest {
  constructor(private readonly db: Database) {}

  async ingest(server: EventSource, batch: EventBatch): Promise<EventBatchResult> {
    const total = countEvents(batch);
    if (total === 0) return { accepted: 0, duplicates: 0, ignored: 0 };

    return this.db.transaction(async (tx) => {
      // `on conflict do nothing` também resolve o ID repetido dentro do próprio lote.
      const inserted = await tx
        .insert(gameEvents)
        .values(
          EVENT_KEYS.flatMap((key) => batch[key].map(({ id }) => ({ id, serverId: server.id }))),
        )
        .onConflictDoNothing()
        .returning({ id: gameEvents.id });
      const fresh = new Set(inserted.map((row) => row.id));

      // Um ID repetido dentro do lote conta uma vez só: `delete` só diz sim na primeira vez.
      const news = Object.fromEntries(
        EVENT_KEYS.map((key) => [key, batch[key].filter(({ id }) => fresh.delete(id))]),
      ) as unknown as EventBatch;

      const steamIds = steamIdsOf(news);
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

      return { accepted: inserted.length, duplicates: total - inserted.length, ignored };
    });
  }
}

function steamIdsOf(batch: EventBatch): string[] {
  const ids = new Set<string>();
  for (const kill of batch.kills) {
    for (const id of [kill.killerSteamId, kill.victimSteamId, kill.assisterSteamId]) {
      if (id !== null) ids.add(id);
    }
  }
  for (const hit of batch.damages) ids.add(hit.attackerSteamId);
  for (const round of batch.roundEnds) {
    for (const player of round.players) ids.add(player.steamId);
  }
  for (const end of batch.sessionEnds) ids.add(end.steamId);
  return [...ids];
}
