import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { FriendsModule } from '../friends/friends.module.js';
import { FriendsPlayingFinder } from '../friends/friends-playing.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { StatsModule } from '../stats/stats.module.js';
import { WeeklyRanking } from '../stats/weekly-ranking.js';
import { VipModule } from '../vip/vip.module.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { PlayerCardController } from './player-card.controller.js';
import { PlayerCards } from './player-card.service.js';

/** O card de boas-vindas do addon (S19). Fica fora do AccountsModule porque junta o Ranking e os amigos. */
@Module({
  imports: [GameServersModule, AccountsModule, VipModule, StatsModule, FriendsModule],
  controllers: [PlayerCardController],
  providers: [
    {
      provide: PlayerCards,
      inject: [AccountsService, VipPeriods, WeeklyRanking, FriendsPlayingFinder],
      useFactory: (
        accounts: AccountsService,
        vip: VipPeriods,
        ranking: WeeklyRanking,
        friends: FriendsPlayingFinder,
      ) => new PlayerCards(accounts, vip, ranking, friends),
    },
  ],
})
export class CardModule {}
