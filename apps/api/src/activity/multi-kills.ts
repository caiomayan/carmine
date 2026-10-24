import type { GameMode, KillEvent } from '@carmine/contracts';

/** Quantas mortes seguidas viram destaque: no Deathmatch, onde todo mundo mata o tempo todo, mais. */
export const MULTI_KILL_MINIMUM: Record<GameMode, number> = { retake: 3, deathmatch: 7 };

/** Entre duas mortes da mesma sequência passa no máximo isto. */
const MAX_GAP_MS = 15_000;

export interface MultiKill {
  steamId: string;
  count: number;
  /** Quando caiu a última morte da sequência (ISO). */
  at: string;
}

/**
 * Sequências de mortes do mesmo jogador num lote de eventos (S12): cada morte a menos de 15 s da
 * anterior, sem atravessar o fim de um round. Só conta o que conta para as Estatísticas: fora
 * aquecimento, kill em aliado, bot e morte sem assassino ou vítima humanos. O lote é tudo o que
 * se sabe, então uma sequência cortada entre dois lotes sai menor do que foi (ou nem sai).
 */
export function detectMultiKills({
  mode,
  kills,
  roundEnds,
}: {
  mode: GameMode;
  kills: readonly KillEvent[];
  roundEnds: readonly { at: string }[];
}): MultiKill[] {
  const ends = roundEnds.map((end) => Date.parse(end.at)).sort((a, b) => a - b);
  const byKiller = new Map<string, number[]>();
  for (const kill of kills) {
    if (kill.warmup || kill.teamKill || kill.killerIsBot || kill.victimIsBot) continue;
    if (kill.killerSteamId === null || kill.victimSteamId === null) continue;
    const times = byKiller.get(kill.killerSteamId) ?? [];
    times.push(Date.parse(kill.at));
    byKiller.set(kill.killerSteamId, times);
  }

  const found: MultiKill[] = [];
  for (const [steamId, times] of byKiller) {
    times.sort((a, b) => a - b);
    let streak: number[] = [];
    const close = () => {
      if (streak.length >= MULTI_KILL_MINIMUM[mode]) {
        found.push({
          steamId,
          count: streak.length,
          at: new Date(streak[streak.length - 1] as number).toISOString(),
        });
      }
      streak = [];
    };
    for (const time of times) {
      const previous = streak[streak.length - 1];
      const broken =
        previous !== undefined &&
        (time - previous > MAX_GAP_MS || ends.some((end) => end > previous && end <= time));
      if (broken) close();
      streak.push(time);
    }
    close();
  }
  return found.sort((a, b) => a.at.localeCompare(b.at));
}
