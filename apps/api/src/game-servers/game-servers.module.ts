import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServerRegistry } from './game-server-registry.js';
import { ServerKeyGuard } from './server-key.guard.js';

/** Servidores Carmine e a autenticação das rotas usadas pelos plugins (`/api/server/*`). */
@Module({
  providers: [
    {
      provide: GameServerRegistry,
      inject: [DATABASE],
      useFactory: (db: Database) => new GameServerRegistry(db),
    },
    ServerKeyGuard,
  ],
  exports: [GameServerRegistry, ServerKeyGuard],
})
export class GameServersModule {}
