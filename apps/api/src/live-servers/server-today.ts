import {
  SERVER_TODAY_MAX_DAYS_BACK,
  type ServerToday,
  type ServerTodayHour,
  type ServerTodayMap,
} from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import { and, eq, gt, gte, isNull, lt, min, or } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../database/database.js';
import { playSessions, serverHours } from '../database/schema.js';
import type { GameServer } from '../game-servers/game-server-registry.js';
import { dayOf } from '../stats/stats-week.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Meia-noite de Brasília (-03:00 fixo) em UTC. */
const BRASILIA_SHIFT_MS = 3 * HOUR_MS;

/** A data pedida não é um dia real, ou está fora da janela (hoje e os 7 dias anteriores). */
export class InvalidServerDay extends Error {}

/** O instante em que o dia (`YYYY-MM-DD`, Brasília) começa. */
export function dayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + BRASILIA_SHIFT_MS);
}

/** O dia pedido (padrão: hoje em Brasília), ou {@link InvalidServerDay}. */
export function parseServerDay(value: string | undefined, now: Date): string {
  const today = dayOf(now);
  if (value === undefined || value === '') return today;
  const real =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!real) throw new InvalidServerDay('date: use um dia no formato YYYY-MM-DD');
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - SERVER_TODAY_MAX_DAYS_BACK * DAY_MS)
    .toISOString()
    .slice(0, 10);
  if (value > today || value < oldest) {
    throw new InvalidServerDay(`date: de ${oldest} a ${today}`);
  }
  return value;
}

/** Uma Sessão recortada no dia, em ms. */
export interface DaySpan {
  accountId: string;
  from: number;
  to: number;
  maps: string[];
}

export interface SessionRow {
  accountId: string;
  startedAt: Date;
  endedAt: Date | null;
  map: string | null;
  maps: string[];
}

/**
 * As Sessões que tocam o dia, recortadas nele e em `now`. Uma Sessão aberta há mais de 24 h (queda do
 * servidor) fica de fora, como no Perfil; uma sem duração dentro do dia também.
 */
export function spansOf(rows: readonly SessionRow[], start: Date, now: Date): DaySpan[] {
  const end = start.getTime() + DAY_MS;
  const spans: DaySpan[] = [];
  for (const row of rows) {
    const began = row.startedAt.getTime();
    if (row.endedAt === null && now.getTime() - began > DAY_MS) continue;
    const from = Math.max(began, start.getTime());
    const to = Math.min(row.endedAt?.getTime() ?? now.getTime(), end, now.getTime());
    if (to <= from) continue;
    spans.push({
      accountId: row.accountId,
      from,
      to,
      maps: row.maps.length > 0 ? row.maps : row.map ? [row.map] : [],
    });
  }
  return spans;
}

/** Jogadores distintos com Sessão em cada hora do dia (0 a 23). */
export function playersPerHour(spans: readonly DaySpan[], start: Date): number[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const from = start.getTime() + hour * HOUR_MS;
    const to = from + HOUR_MS;
    return new Set(spans.filter((s) => s.from < to && s.to > from).map((s) => s.accountId)).size;
  });
}

/** O pico de jogadores ao mesmo tempo e o primeiro instante em que foi atingido; nulo sem Sessões. */
export function peakOf(spans: readonly DaySpan[]): { at: Date; count: number } | null {
  const moves = spans
    .flatMap((s) => [
      { at: s.from, delta: 1, accountId: s.accountId },
      { at: s.to, delta: -1, accountId: s.accountId },
    ])
    // No mesmo instante, quem sai antes de quem entra: a troca não infla o pico.
    .sort((a, b) => a.at - b.at || a.delta - b.delta);
  const open = new Map<string, number>();
  let active = 0;
  let best: { at: number; count: number } | null = null;
  for (const move of moves) {
    const before = open.get(move.accountId) ?? 0;
    const after = before + move.delta;
    open.set(move.accountId, after);
    if (before === 0 && after > 0) active++;
    if (before > 0 && after === 0) active--;
    if (active > (best?.count ?? 0)) best = { at: move.at, count: active };
  }
  return best ? { at: new Date(best.at), count: best.count } : null;
}

/** Os mapas do dia a partir das Sessões (Deathmatch, ou Retake sem rounds do plugin novo): sem rounds nem placar. */
export function mapsFromSpans(spans: readonly DaySpan[]): ServerTodayMap[] {
  const byMap = new Map<string, { from: number; to: number }>();
  for (const span of spans) {
    for (const map of span.maps) {
      const known = byMap.get(map);
      byMap.set(map, {
        from: Math.min(known?.from ?? span.from, span.from),
        to: Math.max(known?.to ?? span.to, span.to),
      });
    }
  }
  return [...byMap.entries()]
    .sort(([, a], [, b]) => a.from - b.from)
    .map(([map, range]) => ({
      map,
      from: new Date(range.from).toISOString(),
      to: new Date(range.to).toISOString(),
      rounds: null,
      ctWins: null,
      tWins: null,
      finalScore: null,
    }));
}

type HourRow = typeof serverHours.$inferSelect;

/** Os mapas do dia a partir de `server_hours` (rounds, vitórias e o placar do último round do mapa). */
export function mapsFromHours(rows: readonly HourRow[]): ServerTodayMap[] {
  const byMap = new Map<string, HourRow[]>();
  for (const row of rows) byMap.set(row.map, [...(byMap.get(row.map) ?? []), row]);
  return [...byMap.entries()]
    .map(([map, group]) => {
      const last = group.reduce((a, b) => (b.lastRoundAt >= a.lastRoundAt ? b : a));
      return {
        map,
        from: new Date(Math.min(...group.map((r) => r.firstRoundAt.getTime()))).toISOString(),
        to: last.lastRoundAt.toISOString(),
        rounds: group.reduce((sum, r) => sum + r.roundsPlayed, 0),
        ctWins: group.reduce((sum, r) => sum + r.ctWins, 0),
        tWins: group.reduce((sum, r) => sum + r.tWins, 0),
        finalScore:
          last.scoreCt !== null && last.scoreT !== null
            ? { ct: last.scoreCt, t: last.scoreT }
            : null,
      };
    })
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** O cache curto do histórico do dia (15 s): a página pede a cada visita e a consulta varre o dia. */
export class ServerTodayCache {
  private readonly logger = new Logger('ServerTodayCache');

  constructor(
    private readonly valkey: Redis,
    private readonly ttlSeconds = 15,
  ) {}

  private key(serverId: string, day: string) {
    return `server:today:v1:${serverId}:${day}`;
  }

  async get(serverId: string, day: string): Promise<ServerToday | null> {
    if (this.ttlSeconds <= 0) return null;
    try {
      const raw = await this.valkey.get(this.key(serverId, day));
      return raw === null ? null : (JSON.parse(raw) as ServerToday);
    } catch (error) {
      this.logger.warn(`Leitura do cache falhou: ${(error as Error).message}`);
      return null;
    }
  }

  async set(serverId: string, day: string, value: ServerToday): Promise<void> {
    if (this.ttlSeconds <= 0) return;
    try {
      await this.valkey.set(this.key(serverId, day), JSON.stringify(value), 'EX', this.ttlSeconds);
    } catch (error) {
      this.logger.warn(`Escrita no cache falhou: ${(error as Error).message}`);
    }
  }
}

/**
 * O histórico do dia de um servidor (S12b): os rounds, vitórias e mapas vêm de `server_hours`; o
 * pico, os jogadores únicos e os jogadores por hora, das Sessões do dia. Agregado, sem identificar
 * ninguém. Onde não há rounds (Deathmatch, ou plugin sem o mapa no round), `rounds` é nulo e os
 * mapas saem das Sessões: nada de zero no lugar de "não sei".
 */
export class ServerTodayReader {
  constructor(
    private readonly db: Database,
    private readonly cache: ServerTodayCache | null = null,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async read(server: GameServer, date: string | undefined): Promise<ServerToday> {
    const now = this.clock();
    const day = parseServerDay(date, now);
    const cached = await this.cache?.get(server.id, day);
    if (cached) return cached;

    const start = dayStart(day);
    const end = new Date(start.getTime() + DAY_MS);
    const [hours, sessions, firstHour, firstSession] = await Promise.all([
      this.db
        .select()
        .from(serverHours)
        .where(
          and(
            eq(serverHours.serverId, server.id),
            gte(serverHours.hourStart, start),
            lt(serverHours.hourStart, end),
          ),
        ),
      this.db
        .select({
          accountId: playSessions.accountId,
          startedAt: playSessions.startedAt,
          endedAt: playSessions.endedAt,
          map: playSessions.map,
          maps: playSessions.maps,
        })
        .from(playSessions)
        .where(
          and(
            eq(playSessions.serverId, server.id),
            lt(playSessions.startedAt, end),
            gte(playSessions.startedAt, new Date(start.getTime() - DAY_MS)),
            or(gt(playSessions.endedAt, start), isNull(playSessions.endedAt)),
          ),
        ),
      this.db
        .select({ at: min(serverHours.hourStart) })
        .from(serverHours)
        .where(eq(serverHours.serverId, server.id)),
      this.db
        .select({ at: min(playSessions.startedAt) })
        .from(playSessions)
        .where(eq(playSessions.serverId, server.id)),
    ]);

    const firsts = [firstHour[0]?.at, firstSession[0]?.at].filter((at): at is Date => !!at);
    const since =
      firsts.length === 0 ? null : dayOf(new Date(Math.min(...firsts.map((d) => d.getTime()))));
    const spans = spansOf(sessions, start, now);
    const peak = peakOf(spans);

    const withRounds = server.mode === 'retake' && hours.length > 0;
    const roundsByHour = new Map<number, number>();
    for (const row of hours) {
      const hour = Math.floor((row.hourStart.getTime() - start.getTime()) / HOUR_MS);
      roundsByHour.set(hour, (roundsByHour.get(hour) ?? 0) + row.roundsPlayed);
    }
    const players = playersPerHour(spans, start);
    const hoursOfDay: ServerTodayHour[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      rounds: roundsByHour.get(hour) ?? 0,
      players: players[hour] ?? 0,
    }));

    const result: ServerToday = {
      serverId: server.id,
      mode: server.mode,
      date: day,
      isToday: day === dayOf(now),
      since,
      rounds:
        server.mode === 'deathmatch' || since === null
          ? null
          : {
              played: hours.reduce((sum, r) => sum + r.roundsPlayed, 0),
              ctWins: hours.reduce((sum, r) => sum + r.ctWins, 0),
              tWins: hours.reduce((sum, r) => sum + r.tWins, 0),
            },
      maps: withRounds ? mapsFromHours(hours) : mapsFromSpans(spans),
      hours: hoursOfDay,
      peakPlayers: peak ? { at: peak.at.toISOString(), count: peak.count } : null,
      uniquePlayers: spans.length === 0 ? null : new Set(spans.map((s) => s.accountId)).size,
      generatedAt: now.toISOString(),
    };
    await this.cache?.set(server.id, day, result);
    return result;
  }
}
