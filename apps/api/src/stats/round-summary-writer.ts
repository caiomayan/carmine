import type { GameMode } from '@carmine/contracts';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import {
  mapPlayPlayers,
  mapPlays,
  roundEvents,
  roundPlayerSummaries,
  roundSummaries,
} from '../database/schema.js';
import { type RoundEventRow, rebuildRound } from './round-events.js';
import { summarizeRound } from './round-summary.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface AffectedRound {
  mapPlayId: string;
  roundNumber: number;
  /** A janela de `occurred_at` em que procurar as linhas do round (poda as partições). */
  from: Date;
  to: Date;
}

/** Linhas de `round_events` por comando de `insert`, para ficar longe do limite de parâmetros do Postgres. */
const INSERT_CHUNK = 1_000;

/** Grava as linhas brutas novas. O ID repetido não faz nada (a idempotência já saiu em `game_events`). */
export async function insertRoundEvents(
  tx: Transaction,
  rows: readonly RoundEventRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await tx
      .insert(roundEvents)
      .values(rows.slice(i, i + INSERT_CHUNK))
      .onConflictDoNothing();
  }
}

/**
 * Calcula e grava o resumo de cada round tocado pelo lote (S17): lê do banco as linhas do round
 * (as deste lote e as de lotes anteriores), roda a calculadora pura (`summarizeRound`) e grava o
 * resumo do round, o dos jogadores e o do Mapa jogado. Só vale se o `round_end` já chegou; um
 * evento atrasado que chega depois dele refaz o resumo por cima. Como o resumo é uma função pura
 * das linhas, refazer dá sempre o mesmo resultado e reenviar um lote não duplica nada.
 */
export async function recomputeRounds(
  tx: Transaction,
  server: { id: string; mode: GameMode },
  rounds: readonly AffectedRound[],
): Promise<number> {
  let written = 0;
  for (const round of rounds) {
    // Dois lotes do mesmo mapa ao mesmo tempo esperam um pelo outro em vez de gravar em paralelo.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${round.mapPlayId}, 17))`);

    const stored = await tx
      .select()
      .from(roundEvents)
      .where(
        and(
          eq(roundEvents.mapPlayId, round.mapPlayId),
          eq(roundEvents.roundNumber, round.roundNumber),
          gte(roundEvents.occurredAt, round.from),
          lte(roundEvents.occurredAt, round.to),
        ),
      );
    const rebuilt = rebuildRound(stored);
    if (!rebuilt) continue;
    const summary = summarizeRound(rebuilt.input);
    if (!summary) continue;
    const { meta } = rebuilt;

    await tx
      .insert(mapPlays)
      .values({
        id: meta.mapPlayId,
        serverId: server.id,
        mode: server.mode,
        map: meta.map,
        startedAt: meta.startedAt,
        endedAt: meta.endedAt,
        rounds: 0,
      })
      .onConflictDoNothing();

    const values = {
      winner: summary.winner,
      reason: summary.reason,
      durationMs: summary.durationMs,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt,
      scoreCt: meta.scoreCt,
      scoreT: meta.scoreT,
      map: meta.map,
      updatedAt: sql`now()`,
    };
    await tx
      .insert(roundSummaries)
      .values({ mapPlayId: meta.mapPlayId, roundNumber: meta.roundNumber, ...values })
      .onConflictDoUpdate({
        target: [roundSummaries.mapPlayId, roundSummaries.roundNumber],
        set: values,
      });

    // Refazer o round troca o conjunto de jogadores inteiro, sem sobrar linha de uma versão antiga.
    await tx
      .delete(roundPlayerSummaries)
      .where(
        and(
          eq(roundPlayerSummaries.mapPlayId, meta.mapPlayId),
          eq(roundPlayerSummaries.roundNumber, meta.roundNumber),
        ),
      );
    await tx.insert(roundPlayerSummaries).values(
      summary.players.map((p) => ({
        mapPlayId: meta.mapPlayId,
        roundNumber: meta.roundNumber,
        // A chave que a calculadora recebeu é o ID da Conta (ver `rebuildRound`).
        accountId: p.steamId,
        side: p.side,
        equipmentValue: p.equipmentValue,
        kills: p.kills,
        headshots: p.headshots,
        deaths: p.deaths,
        assists: p.assists,
        flashAssists: p.flashAssists,
        damage: p.damage,
        survived: p.survived,
        traded: p.traded,
        openingKill: p.openingKill,
        openingDeath: p.openingDeath,
        multiKill: p.multiKill,
        clutchAgainst: p.clutch?.against ?? null,
        clutchWon: p.clutch?.won ?? null,
        kast: p.kast,
      })),
    );
    written++;
  }

  const touched = [...new Set(rounds.map((r) => r.mapPlayId))];
  if (written > 0) await refreshMapPlays(tx, touched);
  return written;
}

/** Refaz o Mapa jogado e os jogadores dele a partir dos resumos de round (uma passada, exata). */
async function refreshMapPlays(tx: Transaction, mapPlayIds: readonly string[]): Promise<void> {
  if (mapPlayIds.length === 0) return;
  await tx.execute(sql`
    update map_plays m set
      map = coalesce(a.map, m.map),
      started_at = a.started_at,
      ended_at = a.ended_at,
      rounds = a.rounds,
      score_ct = a.score_ct,
      score_t = a.score_t,
      updated_at = now()
    from (
      select map_play_id,
        count(*)::int as rounds,
        min(started_at) as started_at,
        max(ended_at) as ended_at,
        (array_agg(map order by round_number desc) filter (where map is not null))[1] as map,
        (array_agg(score_ct order by round_number desc) filter (where score_ct is not null))[1] as score_ct,
        (array_agg(score_t order by round_number desc) filter (where score_t is not null))[1] as score_t
      from round_summaries
      where map_play_id in (${sql.join(
        mapPlayIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      group by map_play_id
    ) a
    where m.id = a.map_play_id`);

  await tx.delete(mapPlayPlayers).where(inArray(mapPlayPlayers.mapPlayId, [...mapPlayIds]));
  await tx.execute(sql`
    insert into map_play_players (map_play_id, account_id, rounds, kills, headshots, deaths, assists,
      flash_assists, damage, kast_rounds, survived_rounds, opening_kills, opening_deaths, clutches, clutches_won)
    select map_play_id, account_id,
      count(*)::int,
      sum(kills)::int,
      sum(headshots)::int,
      sum(deaths)::int,
      sum(assists)::int,
      sum(flash_assists)::int,
      sum(damage)::int,
      (count(*) filter (where kast))::int,
      (count(*) filter (where survived))::int,
      (count(*) filter (where opening_kill))::int,
      (count(*) filter (where opening_death))::int,
      (count(*) filter (where clutch_against is not null))::int,
      (count(*) filter (where clutch_won))::int
    from round_player_summaries
    where map_play_id in (${sql.join(
      mapPlayIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
    group by map_play_id, account_id`);
}
