import {
  type CalendarDay,
  PLAY_SESSION_RETENTION_DAYS,
  type ProfileActivity,
  type ProfileSessions,
  type ProfileWeapons,
  STAT_WEAPONS,
  type StatWeapon,
  type WeaponsMode,
} from '@carmine/contracts';
import { and, desc, eq, gte, isNotNull, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { canSeeStats } from '../accounts/profile-privacy.js';
import type { Database } from '../database/database.js';
import { accountStatsDaily, accountWeaponStats, playSessions } from '../database/schema.js';
import type { LiveServers } from '../live-servers/live-servers.js';
import { dayOf, weekStartOf } from './stats-week.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_WEAPONS: ReadonlySet<string> = new Set(STAT_WEAPONS);

type ViewedAccount = { id: string; profilePrivate: boolean; steamId: string };

/**
 * O detalhe do Perfil (S12b): o mapa de calor, o radar de armas e as Sessões de jogo. Todos passam
 * por `canSeeStats` (Perfil privado: só a própria Conta; para os outros, `visible: false` e nada
 * mais). O dado só existe desde que o plugin novo foi para os servidores: `since` diz desde quando
 * (o primeiro dia com atividade detalhada da Conta), e nulo com `visible` é "ainda não coletando".
 */
export class ProfileDetailReader {
  constructor(
    private readonly db: Database,
    /** Para o "em andamento" da própria Conta; sem ele, nenhuma Sessão é `live`. */
    private readonly live: Pick<LiveServers, 'whereArePlaying'> | null = null,
  ) {}

  async activity(
    account: ViewedAccount,
    viewerAccountId: string | null,
    weeks: number,
    now: Date = new Date(),
  ): Promise<ProfileActivity> {
    if (!canSeeStats(account, viewerAccountId)) return { visible: false, since: null, days: [] };
    const t = accountStatsDaily;
    const monday = Date.parse(`${weekStartOf(now)}T00:00:00Z`);
    const from = new Date(monday - (weeks - 1) * 7 * DAY_MS).toISOString().slice(0, 10);
    const sum = (column: AnyPgColumn) => sql<number>`coalesce(sum(${column}), 0)::int`;
    const [days, since] = await Promise.all([
      this.db
        .select({
          day: t.day,
          secondsPlayed: sum(t.secondsPlayed),
          roundsPlayed: sum(t.roundsPlayed),
          kills: sum(t.kills),
        })
        .from(t)
        .where(and(eq(t.accountId, account.id), gte(t.day, from)))
        .groupBy(t.day)
        .orderBy(t.day),
      this.since(account.id),
    ]);
    return { visible: true, since, days };
  }

  async weapons(
    account: ViewedAccount,
    viewerAccountId: string | null,
    mode: WeaponsMode,
    limit: number,
  ): Promise<ProfileWeapons> {
    if (!canSeeStats(account, viewerAccountId)) {
      return { visible: false, since: null, mode, weapons: [] };
    }
    const t = accountWeaponStats;
    const kills = sql<number>`coalesce(sum(${t.kills}), 0)::int`;
    const [rows, since] = await Promise.all([
      this.db
        .select({
          weapon: t.weapon,
          kills,
          headshots: sql<number>`coalesce(sum(${t.headshots}), 0)::int`,
          ct: sql<number>`coalesce(sum(${t.kills}) filter (where ${t.side} = 'ct'), 0)::int`,
          t: sql<number>`coalesce(sum(${t.kills}) filter (where ${t.side} = 't'), 0)::int`,
        })
        .from(t)
        .where(and(eq(t.accountId, account.id), mode === 'all' ? undefined : eq(t.mode, mode)))
        .groupBy(t.weapon)
        .orderBy(desc(kills), t.weapon)
        .limit(limit),
      this.since(account.id),
    ]);
    return {
      visible: true,
      since,
      mode,
      weapons: rows.map((row) => ({ ...row, weapon: toWeapon(row.weapon) })),
    };
  }

  /**
   * As Sessões mais recentes, da mais nova para a mais antiga. De fora (D1) só Modo, mapa, dia e
   * duração; o horário exato e o "em andamento" são da própria Conta. Uma Sessão aberta há mais
   * de 24 h (queda do servidor) não aparece.
   */
  async sessions(
    account: ViewedAccount,
    viewerAccountId: string | null,
    limit: number,
    now: Date = new Date(),
  ): Promise<ProfileSessions> {
    if (!canSeeStats(account, viewerAccountId))
      return { visible: false, since: null, sessions: [] };
    const t = playSessions;
    const own = account.id === viewerAccountId;
    const [rows, since] = await Promise.all([
      this.db
        .select()
        .from(t)
        .where(
          and(
            eq(t.accountId, account.id),
            gte(t.startedAt, new Date(now.getTime() - PLAY_SESSION_RETENTION_DAYS * DAY_MS)),
            or(isNotNull(t.endedAt), gte(t.startedAt, new Date(now.getTime() - DAY_MS))),
          ),
        )
        .orderBy(desc(t.startedAt))
        .limit(limit),
      this.since(account.id),
    ]);

    // Em andamento: a Sessão aberta mais nova, se a presença ainda tem a pessoa nesse servidor.
    let liveId: string | null = null;
    if (own && this.live && rows.some((row) => row.endedAt === null)) {
      const steamId = account.steamId;
      const serverId = (await this.live.whereArePlaying([steamId]).catch(() => null))?.get(steamId);
      liveId = rows.find((row) => row.endedAt === null && row.serverId === serverId)?.id ?? null;
    }

    return {
      visible: true,
      since,
      sessions: rows.map((row) => ({
        id: row.id,
        mode: row.mode,
        map: row.map,
        maps: row.maps,
        day: dayOf(row.startedAt),
        startedAt: own ? row.startedAt.toISOString() : null,
        endedAt: own && row.endedAt ? row.endedAt.toISOString() : null,
        seconds: row.seconds,
        live: row.id === liveId,
      })),
    };
  }

  /** O primeiro dia com atividade detalhada da Conta: o "coletando desde" das telas. */
  private async since(accountId: string): Promise<CalendarDay | null> {
    const [row] = await this.db
      .select({ since: sql<string | null>`min(${accountStatsDaily.day})` })
      .from(accountStatsDaily)
      .where(eq(accountStatsDaily.accountId, accountId));
    return row?.since ?? null;
  }
}

function toWeapon(raw: string): StatWeapon {
  return KNOWN_WEAPONS.has(raw) ? (raw as StatWeapon) : 'other';
}
