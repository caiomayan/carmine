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
import { WeeklyRanking } from './weekly-ranking.js';

/** Eventos do jogo e Estatísticas das Contas (S12). */
@Module({
  imports: [GameServersModule, AccountsModule, ActivityModule],
  controllers: [GameEventsController, ProfileStatsController, RankingController],
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
