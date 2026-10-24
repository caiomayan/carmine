import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { ActivityFeed } from '../activity/activity-feed.js';
import { RankingLeaderWatch } from '../activity/ranking-leader-watch.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { GameEventIngest } from './game-event-ingest.js';
import { GameEventsController } from './game-events.controller.js';
import { ProfileStatsController } from './profile-stats.controller.js';
import { ProfileStatsReader } from './profile-stats.js';
import { RankingController } from './ranking.controller.js';
import { RankingCache } from './ranking-cache.js';
import { WeekSummaryController } from './week-summary.controller.js';
import { WeekSummaryReader } from './week-summary.js';
import { WeeklyRanking } from './weekly-ranking.js';

/** Eventos do jogo e Estatísticas das Contas (S12). */
@Module({
  imports: [GameServersModule, AccountsModule, ActivityModule],
  controllers: [
    GameEventsController,
    ProfileStatsController,
    RankingController,
    WeekSummaryController,
  ],
  providers: [
    {
      provide: GameEventIngest,
      inject: [DATABASE, ActivityFeed],
      useFactory: (db: Database, activity: ActivityFeed) => new GameEventIngest(db, activity),
    },
    {
      provide: ProfileStatsReader,
      inject: [DATABASE],
      useFactory: (db: Database) => new ProfileStatsReader(db),
    },
    {
      // A home pede a cada visita: poucos segundos na memória bastam (o número só se mexe com os lotes de eventos).
      provide: WeekSummaryReader,
      inject: [DATABASE, APP_CONFIG],
      useFactory: (db: Database, config: AppConfig) =>
        new WeekSummaryReader(db, { cacheMs: config.weekSummaryCacheTtlSeconds * 1000 }),
    },
    {
      provide: WeeklyRanking,
      inject: [DATABASE, VALKEY, APP_CONFIG],
      useFactory: (db: Database, valkey: Redis, config: AppConfig) =>
        new WeeklyRanking(db, new RankingCache(valkey, config.rankingCacheTtlSeconds)),
    },
    {
      // Percebe a troca do primeiro lugar da semana para a faixa de atividade.
      provide: RankingLeaderWatch,
      inject: [WeeklyRanking, ActivityFeed, VALKEY],
      useFactory: (ranking: WeeklyRanking, activity: ActivityFeed, valkey: Redis) =>
        new RankingLeaderWatch(ranking, activity, valkey, 30_000),
    },
  ],
  exports: [WeeklyRanking],
})
export class StatsModule {}
