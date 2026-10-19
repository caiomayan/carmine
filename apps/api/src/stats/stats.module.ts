import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { GameEventIngest } from './game-event-ingest.js';
import { GameEventsController } from './game-events.controller.js';
import { ProfileStatsController } from './profile-stats.controller.js';
import { ProfileStatsReader } from './profile-stats.js';

/** Eventos do jogo e Estatísticas das Contas (S12). */
@Module({
  imports: [GameServersModule, AccountsModule],
  controllers: [GameEventsController, ProfileStatsController],
  providers: [
    {
      provide: GameEventIngest,
      inject: [DATABASE],
      useFactory: (db: Database) => new GameEventIngest(db),
    },
    {
      provide: ProfileStatsReader,
      inject: [DATABASE],
      useFactory: (db: Database) => new ProfileStatsReader(db),
    },
  ],
})
export class StatsModule {}
