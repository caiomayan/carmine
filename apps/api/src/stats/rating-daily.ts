import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Uma Conta num dia de Brasília: a unidade que o `account_rating_daily` refaz de uma vez. */
export interface RatingDayKey {
  accountId: string;
  day: string;
}

/**
 * Refaz as contagens do Rating (S21, ADR 0029) das Contas e dos dias dados, a partir dos resumos de
 * round: apaga as linhas do dia e as recalcula por SQL, em vez de somar a diferença. Assim um round
 * refeito (evento atrasado) ou um reenvio nunca deixa a conta errada, e o resultado é sempre o mesmo
 * para os mesmos resumos. O dia é o de Brasília em que o round acabou (-03:00 fixo, ADR 0018).
 */
export async function refreshRatingDaily(
  tx: Transaction,
  keys: readonly RatingDayKey[],
): Promise<void> {
  const unique = [...new Map(keys.map((k) => [`${k.accountId}|${k.day}`, k])).values()];
  if (unique.length === 0) return;
  const wanted = sql.join(
    unique.map((k) => sql`(${k.accountId}::uuid, ${k.day}::date)`),
    sql`, `,
  );
  await tx.execute(sql`
    delete from account_rating_daily a
    using (values ${wanted}) as k (account_id, day)
    where a.account_id = k.account_id and a.day = k.day`);
  await tx.execute(sql`
    insert into account_rating_daily (account_id, day, mode, map, side, rounds, kills, survived_rounds,
      kast_rounds, damage, opening_kills, opening_deaths, mk2, mk3, mk4, mk5, cw1, cw2, cw3, cw4, cw5)
    select p.account_id, k.day, m.mode, coalesce(r.map, m.map, ''), p.side,
      count(*)::int,
      sum(p.kills)::int,
      (count(*) filter (where p.survived))::int,
      (count(*) filter (where p.kast))::int,
      sum(p.damage)::int,
      (count(*) filter (where p.opening_kill))::int,
      (count(*) filter (where p.opening_death))::int,
      (count(*) filter (where p.multi_kill = 2))::int,
      (count(*) filter (where p.multi_kill = 3))::int,
      (count(*) filter (where p.multi_kill = 4))::int,
      (count(*) filter (where p.multi_kill = 5))::int,
      (count(*) filter (where p.clutch_won and p.clutch_against = 1))::int,
      (count(*) filter (where p.clutch_won and p.clutch_against = 2))::int,
      (count(*) filter (where p.clutch_won and p.clutch_against = 3))::int,
      (count(*) filter (where p.clutch_won and p.clutch_against = 4))::int,
      (count(*) filter (where p.clutch_won and p.clutch_against >= 5))::int
    from round_player_summaries p
    join round_summaries r on r.map_play_id = p.map_play_id and r.round_number = p.round_number
    join map_plays m on m.id = p.map_play_id
    join (values ${wanted}) as k (account_id, day)
      on k.account_id = p.account_id
      and k.day = ((r.ended_at at time zone 'UTC') - interval '3 hours')::date
    group by p.account_id, k.day, m.mode, coalesce(r.map, m.map, ''), p.side`);
}
