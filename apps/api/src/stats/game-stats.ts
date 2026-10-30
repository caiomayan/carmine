import { type GameMode, RANKING_SIZE, type RankingViewer } from '@carmine/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountStatsWeekly } from '../database/schema.js';
import { type StatsTotals, toModeStats } from './stats-formulas.js';
import { weekStartOf } from './stats-week.js';
import type { WeeklyRanking } from './weekly-ranking.js';

const MODE_NAME: Record<GameMode, string> = { retake: 'Retake', deathmatch: 'Deathmatch' };

/** Número no padrão do jogo em português: vírgula decimal. */
function num(value: number, places: number): string {
  return value.toFixed(places).replace('.', ',');
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * `!rank` (S16): a posição da semana no Modo do servidor, com as mesmas regras do Ranking da S12. A
 * linha vai pronta em português; o plugin só imprime (sem o `Carmine ·`, que ele coloca).
 */
export function rankMessage(mode: GameMode, viewer: RankingViewer): string {
  const { entry, progress } = viewer;
  if (entry) {
    const place = `${MODE_NAME[mode]}: ${entry.position}º da semana`;
    if (entry.position > RANKING_SIZE) return `${place}.`;
    return mode === 'retake'
      ? `${place} · ${entry.score} ${plural(entry.score, 'round vencido', 'rounds vencidos')}.`
      : `${place} · ${num(entry.score, 2)} KPM.`;
  }
  if (progress) {
    const unit =
      progress.unit === 'rounds'
        ? plural(progress.missing, 'round', 'rounds')
        : plural(progress.missing, 'minuto', 'minutos');
    const verb = progress.missing === 1 ? 'Falta' : 'Faltam';
    return `${verb} ${progress.missing} ${unit} para você entrar no Ranking desta semana.`;
  }
  return 'Você não aparece no Ranking desta semana.';
}

/** `!stats` (S16): a semana no Modo; Retake com K/D, HS%, ADR e rounds, Deathmatch com KPM, K/D, HS% e minutos. */
export function statsMessage(mode: GameMode, totals: StatsTotals | null): string {
  const played = mode === 'retake' ? (totals?.roundsPlayed ?? 0) : (totals?.secondsPlayed ?? 0);
  if (!totals || played === 0) return `Você ainda não jogou ${MODE_NAME[mode]} esta semana.`;
  const stats = toModeStats(mode, totals);
  const hs = stats.headshotPercent === null ? '–' : `${num(stats.headshotPercent, 1)}%`;
  if (mode === 'retake') {
    return `${MODE_NAME[mode]} na semana: K/D ${num(stats.kd, 2)} · HS ${hs} · ADR ${num(stats.adr ?? 0, 1)} · ${totals.roundsPlayed} ${plural(totals.roundsPlayed, 'round', 'rounds')}.`;
  }
  return `${MODE_NAME[mode]} na semana: KPM ${num(stats.kpm ?? 0, 2)} · K/D ${num(stats.kd, 2)} · HS ${hs} · ${Math.floor(totals.secondsPlayed / 60)} min.`;
}

/** O que o `!rank` e o `!stats` do jogo respondem, com o mesmo dado do Ranking e do Perfil. */
export class GameStatsReader {
  constructor(
    private readonly db: Database,
    private readonly ranking: WeeklyRanking,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async rank(accountId: string, mode: GameMode): Promise<string> {
    const { viewer } = await this.ranking.read(mode, undefined, accountId);
    return viewer ? rankMessage(mode, viewer) : 'Você não aparece no Ranking desta semana.';
  }

  async stats(accountId: string, mode: GameMode): Promise<string> {
    const [row] = await this.db
      .select({
        kills: accountStatsWeekly.kills,
        deaths: accountStatsWeekly.deaths,
        assists: accountStatsWeekly.assists,
        headshots: accountStatsWeekly.headshots,
        damage: accountStatsWeekly.damage,
        roundsPlayed: accountStatsWeekly.roundsPlayed,
        roundsWon: accountStatsWeekly.roundsWon,
        secondsPlayed: accountStatsWeekly.secondsPlayed,
      })
      .from(accountStatsWeekly)
      .where(
        and(
          eq(accountStatsWeekly.accountId, accountId),
          eq(accountStatsWeekly.mode, mode),
          eq(accountStatsWeekly.weekStart, weekStartOf(this.now())),
        ),
      );
    return statsMessage(mode, row ?? null);
  }
}
