import type { RoundEndEvent } from '@carmine/contracts';
import { hourStartOf } from './stats-week.js';

/** O que um lote soma no histórico de rounds de um servidor, por hora cheia e mapa (S12b). */
export interface ServerHourDelta {
  hourStart: Date;
  map: string;
  roundsPlayed: number;
  ctWins: number;
  tWins: number;
  firstRoundAt: Date;
  lastRoundAt: Date;
  /** Número e placar do round mais recente do grupo (o placar do mapa é o do último round dele). */
  lastRoundNumber: number | null;
  scoreCt: number | null;
  scoreT: number | null;
}

/**
 * Agrupa os fins de round novos por hora cheia e mapa. Só round de verdade (sem aquecimento) que
 * veio com o mapa: plugin velho não manda o mapa, e então o round não entra (a página do servidor
 * mostra "coletando desde"). Não depende de haver Conta: o servidor jogou o round do mesmo jeito.
 * `none` (empate) conta o round, mas nenhum lado.
 */
export function collectServerHours(roundEnds: readonly RoundEndEvent[]): ServerHourDelta[] {
  const groups = new Map<string, ServerHourDelta>();
  for (const round of roundEnds) {
    if (round.warmup || !round.map) continue;
    const at = new Date(round.at);
    const hourStart = hourStartOf(at);
    const key = `${hourStart.getTime()}|${round.map}`;
    const group = groups.get(key) ?? {
      hourStart,
      map: round.map,
      roundsPlayed: 0,
      ctWins: 0,
      tWins: 0,
      firstRoundAt: at,
      lastRoundAt: at,
      lastRoundNumber: null,
      scoreCt: null,
      scoreT: null,
    };
    group.roundsPlayed += 1;
    if (round.winner === 'ct') group.ctWins += 1;
    if (round.winner === 't') group.tWins += 1;
    if (at < group.firstRoundAt) group.firstRoundAt = at;
    if (at >= group.lastRoundAt) {
      group.lastRoundAt = at;
      group.lastRoundNumber = round.roundNumber ?? null;
      group.scoreCt = round.scoreCt ?? null;
      group.scoreT = round.scoreT ?? null;
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}
