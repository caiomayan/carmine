import type { GameMode } from '@carmine/contracts';
import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { WeeklyRanking } from '../stats/weekly-ranking.js';
import type { ActivityRecorder } from './activity-feed.js';

const MODES: readonly GameMode[] = ['retake', 'deathmatch'];
const leaderKey = (mode: GameMode, weekStart: string) => `activity:leader:${mode}:${weekStart}`;
/** O último líder de uma semana fica guardado até a semana seguinte já ter passado. */
const LEADER_TTL_SECONDS = 9 * 24 * 60 * 60;

/**
 * Percebe quando o primeiro lugar da semana muda de mãos e avisa a faixa de atividade. Olha o
 * Ranking de tempos em tempos (a ordem dele já vem do cache) e guarda o líder visto por Modo e
 * semana: a troca é lida e gravada numa operação só (`SET ... GET`), então com várias instâncias da
 * API só uma delas anuncia. A primeira vez que vê uma semana só anota o líder, sem anunciar.
 */
export class RankingLeaderWatch implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RankingLeaderWatch.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly ranking: Pick<WeeklyRanking, 'leaderOf'>,
    private readonly activity: ActivityRecorder,
    private readonly valkey: Redis,
    private readonly intervalMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Confere o líder de cada Modo; nunca rejeita. */
  async tick(): Promise<void> {
    for (const mode of MODES) {
      try {
        const leader = await this.ranking.leaderOf(mode);
        if (leader === null) continue;
        const before = await this.valkey.set(
          leaderKey(mode, leader.weekStart),
          leader.accountId,
          'EX',
          LEADER_TTL_SECONDS,
          'GET',
        );
        if (before !== null && before !== leader.accountId) {
          await this.activity.newLeader(leader.accountId, mode, this.now());
        }
      } catch (error) {
        this.logger.warn(`Líder do Ranking (${mode}) indisponível: ${(error as Error).message}`);
      }
    }
  }
}
