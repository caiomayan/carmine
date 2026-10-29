import type {
  DamageEvent,
  EventBatch,
  KillEvent,
  RoundEndEvent,
  RoundStartEvent,
} from '@carmine/contracts';
import { retentionCutoff } from './round-event-partitions.js';
import type { RoundInput } from './round-summary.js';

export type RoundEventKind =
  | 'round_start'
  | 'round_player'
  | 'kill'
  | 'damage'
  | 'bomb'
  | 'round_end'
  | 'round_alive';

/** Uma linha de `round_events` (S17). Ver o schema: nenhuma guarda SteamID, só a Conta. */
export interface RoundEventRow {
  id: string;
  seq: number;
  occurredAt: Date;
  serverId: string;
  mapPlayId: string;
  roundNumber: number;
  kind: RoundEventKind;
  atMs: number | null;
  actorAccountId: string | null;
  targetAccountId: string | null;
  assistAccountId: string | null;
  payload: Record<string, unknown>;
}

/** Um evento de round com dia futuro além disto é de um relógio errado e não é guardado. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** O horário do evento cabe na janela guardada: nem passou da retenção, nem é do futuro. */
function withinWindow(at: string, now: Date): Date | null {
  const occurredAt = new Date(at);
  const time = occurredAt.getTime();
  if (Number.isNaN(time)) return null;
  if (time < retentionCutoff(now).getTime() || time > now.getTime() + FUTURE_TOLERANCE_MS)
    return null;
  return occurredAt;
}

/** Os horários dos eventos de round que serão guardados: dizem quais partições precisam existir. */
export function roundEventMonths(batch: EventBatch, now: Date): Date[] {
  const events: {
    at: string;
    warmup: boolean;
    mapPlayId?: string | undefined;
    roundNumber?: number | undefined;
  }[] = [
    ...batch.kills,
    ...batch.damages,
    ...batch.roundEnds,
    ...(batch.roundStarts ?? []),
    ...(batch.bombs ?? []),
  ];
  return events
    .filter((e) => !e.warmup && e.mapPlayId !== undefined && e.roundNumber !== undefined)
    .map((e) => withinWindow(e.at, now))
    .filter((date): date is Date => date !== null);
}

export interface RowContext {
  serverId: string;
  /** SteamID64 → Conta. Quem não está aqui não tem Conta (ou foi anonimizado). */
  accountBySteamId: ReadonlyMap<string, string>;
  now: Date;
}

/**
 * Os eventos novos de um lote como linhas de `round_events` (S17). Só entra evento que:
 * - não é de aquecimento;
 * - traz o `mapPlayId` e o número do round (o plugin atual não manda, então não entra nada);
 * - tem horário dentro da janela da retenção (nem mais velho que 12 meses, nem do futuro).
 *
 * Todo humano de um evento tem Conta (a ingestão cria a não reivindicada de quem chega sem uma), então
 * as colunas de Conta bastam. Um SteamID que mesmo assim não esteja no mapa fica sem referência.
 */
export function toRoundEventRows(batch: EventBatch, context: RowContext): RoundEventRow[] {
  const rows: RoundEventRow[] = [];
  const account = (steamId: string | null | undefined) =>
    steamId ? (context.accountBySteamId.get(steamId) ?? null) : null;

  const base = (
    event: { id: string; at: string; atMs?: number | undefined; warmup: boolean },
    mapPlayId: string | undefined,
    roundNumber: number | undefined,
    kind: RoundEventKind,
  ): RoundEventRow | null => {
    if (event.warmup || mapPlayId === undefined || roundNumber === undefined) return null;
    const occurredAt = withinWindow(event.at, context.now);
    if (occurredAt === null) return null;
    return {
      id: event.id,
      seq: 0,
      occurredAt,
      serverId: context.serverId,
      mapPlayId,
      roundNumber,
      kind,
      atMs: event.atMs ?? null,
      actorAccountId: null,
      targetAccountId: null,
      assistAccountId: null,
      payload: {},
    };
  };

  for (const kill of batch.kills) {
    const row = base(kill, kill.mapPlayId, kill.roundNumber, 'kill');
    if (!row) continue;
    const {
      id: _id,
      at: _at,
      atMs: _atMs,
      warmup: _warmup,
      mapPlayId: _mapPlayId,
      roundNumber: _roundNumber,
      killerSteamId,
      victimSteamId,
      assisterSteamId,
      ...rest
    } = kill;
    row.actorAccountId = account(killerSteamId);
    row.targetAccountId = account(victimSteamId);
    row.assistAccountId = account(assisterSteamId);
    row.payload = rest;
    rows.push(row);
  }

  for (const hit of batch.damages) {
    const row = base(hit, hit.mapPlayId, hit.roundNumber, 'damage');
    if (!row) continue;
    const {
      id: _id,
      at: _at,
      atMs: _atMs,
      warmup: _warmup,
      mapPlayId: _mapPlayId,
      roundNumber: _roundNumber,
      attackerSteamId,
      victimSteamId,
      ...rest
    } = hit;
    row.actorAccountId = account(attackerSteamId);
    row.targetAccountId = account(victimSteamId);
    row.payload = rest;
    rows.push(row);
  }

  for (const bomb of batch.bombs ?? []) {
    const row = base(bomb, bomb.mapPlayId, bomb.roundNumber, 'bomb');
    if (!row) continue;
    row.actorAccountId = account(bomb.steamId);
    row.payload = {
      kind: bomb.kind,
      ...(bomb.site !== undefined && { site: bomb.site }),
    };
    rows.push(row);
  }

  for (const start of batch.roundStarts ?? []) {
    const row = base(start, start.mapPlayId, start.roundNumber, 'round_start');
    if (!row) continue;
    const roster = start.players.map((player, index) => ({
      player,
      accountId: account(player.steamId),
      seq: index + 1,
    }));
    row.payload = {
      ...(start.map !== undefined && { map: start.map }),
      botsCt: start.botsCt,
      botsT: start.botsT,
    };
    rows.push(row);
    for (const { player, accountId, seq } of roster) {
      if (accountId === null) continue;
      rows.push({
        ...row,
        seq,
        kind: 'round_player',
        actorAccountId: accountId,
        payload: { team: player.team, equipmentValue: player.equipmentValue },
      });
    }
  }

  for (const end of batch.roundEnds) {
    const row = base(end, end.mapPlayId, end.roundNumber, 'round_end');
    if (!row) continue;
    row.payload = {
      winner: end.winner,
      ...(end.map !== undefined && { map: end.map }),
      ...(end.scoreCt !== undefined && { scoreCt: end.scoreCt }),
      ...(end.scoreT !== undefined && { scoreT: end.scoreT }),
      ...(end.reason !== undefined && { reason: end.reason }),
      ...(end.durationMs !== undefined && { durationMs: end.durationMs }),
      aliveKnown: end.alive !== undefined,
    };
    rows.push(row);
    let seq = 0;
    for (const steamId of end.alive ?? []) {
      const accountId = account(steamId);
      if (accountId === null) continue;
      rows.push({
        ...row,
        seq: ++seq,
        kind: 'round_alive',
        actorAccountId: accountId,
        payload: {},
      });
    }
  }

  return rows;
}

/** Os rounds que as linhas tocam, com a janela de tempo em que procurar o resto do round. */
export function affectedRounds(
  rows: readonly RoundEventRow[],
): { mapPlayId: string; roundNumber: number; from: Date; to: Date }[] {
  const WINDOW_MS = 60 * 60 * 1000;
  const byRound = new Map<
    string,
    { mapPlayId: string; roundNumber: number; min: number; max: number }
  >();
  for (const row of rows) {
    const key = `${row.mapPlayId}:${row.roundNumber}`;
    const time = row.occurredAt.getTime();
    const found = byRound.get(key);
    if (found) {
      found.min = Math.min(found.min, time);
      found.max = Math.max(found.max, time);
    } else {
      byRound.set(key, {
        mapPlayId: row.mapPlayId,
        roundNumber: row.roundNumber,
        min: time,
        max: time,
      });
    }
  }
  return [...byRound.values()]
    .sort((a, b) =>
      `${a.mapPlayId}${a.roundNumber}`.localeCompare(`${b.mapPlayId}${b.roundNumber}`),
    )
    .map(({ min, max, ...round }) => ({
      ...round,
      from: new Date(min - WINDOW_MS),
      to: new Date(max + WINDOW_MS),
    }));
}

/** O que uma linha de resumo precisa saber do round além dos jogadores. */
export interface RoundMeta {
  mapPlayId: string;
  roundNumber: number;
  map: string | null;
  startedAt: Date;
  endedAt: Date;
  scoreCt: number | null;
  scoreT: number | null;
}

/**
 * Refaz a entrada da calculadora a partir das linhas de um round. A chave de cada jogador é o ID
 * da Conta (a calculadora só precisa de uma chave estável), e quem não tem Conta aparece como bot.
 * Devolve `null` sem `round_end` (o round ainda não acabou) ou sem nenhum jogador no elenco.
 */
export function rebuildRound(
  rows: readonly RoundEventRow[],
): { input: RoundInput; meta: RoundMeta } | null {
  const latest = (kind: RoundEventKind) =>
    rows
      .filter((r) => r.kind === kind && r.seq === 0)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
  const endRow = latest('round_end');
  if (!endRow) return null;
  const startRow = latest('round_start');

  const iso = (row: RoundEventRow) => row.occurredAt.toISOString();
  const at = (row: RoundEventRow) => (row.atMs === null ? {} : { atMs: row.atMs });
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const count = (value: unknown) => (typeof value === 'number' ? value : undefined);

  const endPayload = endRow.payload;
  const end = {
    id: endRow.id,
    at: iso(endRow),
    ...at(endRow),
    warmup: false,
    winner: endPayload.winner,
    players: [],
    mapPlayId: endRow.mapPlayId,
    roundNumber: endRow.roundNumber,
    ...(endPayload.map !== undefined && { map: endPayload.map }),
    ...(endPayload.scoreCt !== undefined && { scoreCt: endPayload.scoreCt }),
    ...(endPayload.scoreT !== undefined && { scoreT: endPayload.scoreT }),
    ...(endPayload.reason !== undefined && { reason: endPayload.reason }),
    ...(endPayload.durationMs !== undefined && { durationMs: endPayload.durationMs }),
    ...(endPayload.aliveKnown === true && {
      alive: rows
        .filter((r) => r.kind === 'round_alive' && r.id === endRow.id && r.actorAccountId)
        .map((r) => r.actorAccountId as string),
    }),
  } as unknown as RoundEndEvent;

  let start: RoundStartEvent | null = null;
  if (startRow) {
    start = {
      id: startRow.id,
      at: iso(startRow),
      ...at(startRow),
      warmup: false,
      mapPlayId: startRow.mapPlayId,
      roundNumber: startRow.roundNumber,
      ...(startRow.payload.map !== undefined && { map: startRow.payload.map }),
      players: rows
        .filter((r) => r.kind === 'round_player' && r.id === startRow.id && r.actorAccountId)
        .map((r) => ({
          steamId: r.actorAccountId as string,
          team: r.payload.team,
          equipmentValue: r.payload.equipmentValue,
        })),
      botsCt: count(startRow.payload.botsCt) ?? 0,
      botsT: count(startRow.payload.botsT) ?? 0,
    } as unknown as RoundStartEvent;
  }

  const kills = rows
    .filter((r) => r.kind === 'kill')
    .map((r) => {
      const p = r.payload;
      return {
        ...p,
        id: r.id,
        at: iso(r),
        ...at(r),
        warmup: false,
        killerSteamId: r.actorAccountId,
        victimSteamId: r.targetAccountId,
        assisterSteamId: r.assistAccountId,
        killerIsBot: p.killerIsBot === true,
        victimIsBot: p.victimIsBot === true,
        assisterIsBot: p.assisterIsBot === true,
      } as unknown as KillEvent;
    });

  const damages = rows
    .filter((r) => r.kind === 'damage' && r.actorAccountId !== null)
    .map((r) => {
      const p = r.payload;
      return {
        ...p,
        id: r.id,
        at: iso(r),
        ...at(r),
        warmup: false,
        attackerSteamId: r.actorAccountId,
        victimSteamId: r.targetAccountId,
        victimIsBot: p.victimIsBot === true,
      } as unknown as DamageEvent;
    });

  const startedAt = startRow?.occurredAt ?? endRow.occurredAt;
  return {
    input: { start, kills, damages, end },
    meta: {
      mapPlayId: endRow.mapPlayId,
      roundNumber: endRow.roundNumber,
      map: text(endPayload.map) ?? text(startRow?.payload.map) ?? null,
      startedAt,
      endedAt: endRow.occurredAt,
      scoreCt: count(endPayload.scoreCt) ?? null,
      scoreT: count(endPayload.scoreT) ?? null,
    },
  };
}
